import {
  checkAdjustment,
  type ActorGranularity,
  type CollectorMeasure,
  type CompetitionGranularity,
  type StatisticAdjustment,
} from '@copalibre/domain';
import { sql, type Kysely } from 'kysely';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

/**
 * Storage for folded figures (0016-statistic-collectors-and-tags).
 *
 * There is deliberately **no write path for a total**. Every number in
 * `statistic_totals` arrives from one call — `projectMatch` — carrying the
 * figures a fold produced, and every read is an aggregate of those rows. An
 * `update … set value = value + 1` would be faster and would produce a number
 * no log supports: the first correction recomputes the match and the increment
 * is gone, with nothing to say it ever existed.
 *
 * A hand adjustment is therefore stored as a *fact* in `statistic_adjustments`,
 * folded with the match's events, and projected like everything else.
 */

export interface StoredFigure {
  readonly collectorCode: string;
  readonly actorGranularity: ActorGranularity;
  readonly actorId: string;
  readonly competitionGranularity: CompetitionGranularity;
  readonly competitionId: string;
  readonly value: number;
  readonly samples: number;
}

export interface TotalsQuery {
  readonly organizationId: string;
  readonly collectorCode: string;
  readonly actorGranularity: ActorGranularity;
  readonly competitionGranularity: CompetitionGranularity;
  /** Which competition to read; absent reads every one at that granularity. */
  readonly competitionId?: string;
  readonly actorId?: string;
}

export interface ReadTotal {
  readonly actorId: string;
  readonly competitionId: string;
  readonly value: number;
  readonly samples: number;
}

export class StatisticRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Replaces everything this match contributed.
   *
   * Delete-then-insert rather than upsert, because a correction may remove a
   * figure entirely — a goal disallowed leaves no row, and an upsert would
   * leave the old one standing. Scoped to the match, so no other match's
   * figures are touched and a recompute never has to walk a season.
   */
  async projectMatch(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly matchId: string;
      readonly figures: readonly StoredFigure[];
      readonly projectionVersion: number;
    },
  ): Promise<number> {
    await uow.tx
      .deleteFrom('statistic_totals')
      .where('source_match_id', '=', input.matchId)
      .execute();

    if (input.figures.length === 0) return 0;

    await uow.tx
      .insertInto('statistic_totals')
      .values(
        input.figures.map((figure) => ({
          organization_id: input.organizationId,
          collector_code: figure.collectorCode,
          actor_granularity: figure.actorGranularity,
          actor_id: figure.actorId,
          competition_granularity: figure.competitionGranularity,
          competition_id: figure.competitionId,
          source_match_id: input.matchId,
          value: figure.value,
          samples: figure.samples,
          projection_version: input.projectionVersion,
          updated_at: new Date(),
        })),
      )
      .execute();

    return input.figures.length;
  }

  /**
   * Reads a total, combining the stored rows by the operation the measure
   * permits.
   *
   * An average is recomputed from the samples rather than averaged: the mean of
   * four means is the mean only when the groups are the same size, and a
   * player's matches never are.
   */
  async readTotals(query: TotalsQuery, measure: CollectorMeasure): Promise<readonly ReadTotal[]> {
    let statement = this.db
      .selectFrom('statistic_totals')
      .select(['actor_id', 'competition_id'])
      .select((eb) => eb.fn.sum<number>('samples').as('samples'))
      .select(
        measure.kind === 'average'
          ? sql<number>`sum(value * samples) / nullif(sum(samples), 0)`.as('value')
          : measure.kind === 'max'
            ? sql<number>`max(value)`.as('value')
            : measure.kind === 'min'
              ? sql<number>`min(value)`.as('value')
              : sql<number>`sum(value)`.as('value'),
      )
      .where('organization_id', '=', query.organizationId)
      .where('collector_code', '=', query.collectorCode)
      .where('actor_granularity', '=', query.actorGranularity)
      .where('competition_granularity', '=', query.competitionGranularity)
      .groupBy(['actor_id', 'competition_id']);

    if (query.competitionId !== undefined) {
      statement = statement.where('competition_id', '=', query.competitionId);
    }
    if (query.actorId !== undefined) {
      statement = statement.where('actor_id', '=', query.actorId);
    }

    const rows = await statement.execute();
    return rows.map((row) => ({
      actorId: row.actor_id,
      competitionId: row.competition_id,
      value: Number(row.value ?? 0),
      samples: Number(row.samples ?? 0),
    }));
  }

  /**
   * Records an adjustment as a fact.
   *
   * Validated first: an adjustment the fold would silently skip is a number an
   * operator believes they moved. Audited, because "who moved this" is the
   * question a protest opens with.
   */
  async recordAdjustment(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly matchId: string;
      readonly adjustment: StatisticAdjustment;
    } & AuditContext,
  ): Promise<string> {
    const valid = checkAdjustment(input.adjustment);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);

    const adjustmentId = newId();
    const { adjustment } = input;

    await uow.tx
      .insertInto('statistic_adjustments')
      .values({
        adjustment_id: adjustmentId,
        organization_id: input.organizationId,
        match_id: input.matchId,
        collector_code: adjustment.collectorCode,
        actor_granularity: adjustment.actorGranularity,
        actor_id: adjustment.actorId,
        delta: adjustment.delta,
        reason: adjustment.reason,
        actor: adjustment.actor,
        created_at: new Date(),
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'statistic-adjustment',
      entityId: adjustmentId,
      action: 'statistic.adjusted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      reason: adjustment.reason,
      resultingState: { ...adjustment, matchId: input.matchId },
    });

    return adjustmentId;
  }

  /** The adjustments a match's fold must include. */
  async adjustmentsOf(matchId: string): Promise<readonly StatisticAdjustment[]> {
    const rows = await this.db
      .selectFrom('statistic_adjustments')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('created_at')
      .execute();

    return rows.map((row) => ({
      collectorCode: row.collector_code,
      actorGranularity: row.actor_granularity as ActorGranularity,
      actorId: row.actor_id,
      delta: Number(row.delta),
      reason: row.reason,
      actor: row.actor,
    }));
  }
}
