import type { CapabilityBinding, MatchRuleset } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './participant-repository.js';

/**
 * The durable record of a competition, independent of the modules that produced
 * it.
 *
 * Without this, reading a finished tournament means re-compiling from the
 * descriptor row, so every referenced module version has to survive forever —
 * untenable once modules are community-authored and can be retracted. Here the
 * compiled configuration, its capability binding, and each finalised match's
 * standings are written as they happen, so the record outlives its inputs.
 */

export interface StoredCompiledRuleset {
  readonly compiledRulesetId: string;
  readonly tournamentId: string;
  readonly stageId?: string;
  readonly ruleset: MatchRuleset;
}

export interface StandingsSnapshot {
  readonly tournamentId: string;
  readonly stageId: string;
  /** Match whose finalisation produced this snapshot. */
  readonly matchId: string;
  readonly rows: readonly Record<string, unknown>[];
  readonly trace: readonly Record<string, unknown>[];
  readonly fullyResolved: boolean;
}

export interface StoredStandings extends StandingsSnapshot {
  readonly standingsId: string;
  readonly createdAt: string;
}

export class CompetitionRecordRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Persists a compiled ruleset with its binding, inside the caller's transaction. */
  async saveCompiledRuleset(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly stageId?: string;
      readonly ruleset: MatchRuleset;
    } & AuditContext,
  ): Promise<StoredCompiledRuleset> {
    const compiledRulesetId = newId();
    const { compiledFrom, config, binding } = input.ruleset;

    await uow.tx
      .insertInto('compiled_rulesets')
      .values({
        compiled_ruleset_id: compiledRulesetId,
        tournament_id: input.tournamentId,
        stage_id: input.stageId ?? null,
        descriptor_id: compiledFrom.descriptorId,
        descriptor_version: compiledFrom.descriptorVersion,
        profile_id: binding?.profileId ?? null,
        profile_version: binding?.profileVersion ?? null,
        config: JSON.stringify(config),
        binding: binding ? JSON.stringify(binding) : null,
        compiled_at: new Date(),
      })
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'compiled-ruleset',
      entityId: compiledRulesetId,
      action: 'ruleset.compiled',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: {
        descriptorVersion: compiledFrom.descriptorVersion,
        profileVersion: binding?.profileVersion ?? null,
        unsatisfiedRequired: binding?.unsatisfiedRequired ?? [],
        overridden: binding?.overridden ?? false,
      },
    });

    return {
      compiledRulesetId,
      tournamentId: input.tournamentId,
      stageId: input.stageId,
      ruleset: input.ruleset,
    };
  }

  /** Reads a stored compiled ruleset without consulting any descriptor row. */
  async findCompiledRuleset(tournamentId: string): Promise<MatchRuleset | undefined> {
    const row = await this.db
      .selectFrom('compiled_rulesets')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('compiled_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!row) return undefined;

    return {
      compiledFrom: {
        descriptorId: row.descriptor_id,
        descriptorVersion: row.descriptor_version,
      },
      config: row.config as Record<string, unknown>,
      compiledAt: toIsoString(row.compiled_at),
      binding: (row.binding as CapabilityBinding | null) ?? undefined,
    };
  }

  /**
   * Writes the standings as of a finalised match. Called inside the same
   * transaction that finalises the match, so the record cannot diverge from the
   * result that produced it.
   */
  async materialiseStandings(
    uow: UnitOfWork,
    input: StandingsSnapshot & AuditContext,
  ): Promise<StoredStandings> {
    const standingsId = newId();
    const createdAt = new Date();

    await uow.tx
      .insertInto('materialised_standings')
      .values({
        standings_id: standingsId,
        tournament_id: input.tournamentId,
        stage_id: input.stageId,
        match_id: input.matchId,
        rows: JSON.stringify(input.rows),
        trace: JSON.stringify(input.trace),
        fully_resolved: input.fullyResolved,
        created_at: createdAt,
      })
      .execute();

    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: input.tournamentId,
      eventType: 'standings.updated',
      projectionVersion: 1,
      payload: { matchId: input.matchId, fullyResolved: input.fullyResolved },
    });

    return { ...input, standingsId, createdAt: toIsoString(createdAt) };
  }

  /** Latest materialised standings for a stage — the historical read path. */
  async latestStandings(stageId: string): Promise<StoredStandings | undefined> {
    const row = await this.db
      .selectFrom('materialised_standings')
      .selectAll()
      .where('stage_id', '=', stageId)
      .orderBy('created_at', 'desc')
      .orderBy('standings_id', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!row) return undefined;

    return {
      standingsId: row.standings_id,
      tournamentId: row.tournament_id,
      stageId: row.stage_id,
      matchId: row.match_id,
      rows: row.rows as readonly Record<string, unknown>[],
      trace: row.trace as readonly Record<string, unknown>[],
      fullyResolved: row.fully_resolved,
      createdAt: toIsoString(row.created_at),
    };
  }

  async standingsHistory(stageId: string): Promise<readonly StoredStandings[]> {
    const rows = await this.db
      .selectFrom('materialised_standings')
      .selectAll()
      .where('stage_id', '=', stageId)
      .orderBy('created_at')
      .execute();
    return rows.map((row) => ({
      standingsId: row.standings_id,
      tournamentId: row.tournament_id,
      stageId: row.stage_id,
      matchId: row.match_id,
      rows: row.rows as readonly Record<string, unknown>[],
      trace: row.trace as readonly Record<string, unknown>[],
      fullyResolved: row.fully_resolved,
      createdAt: toIsoString(row.created_at),
    }));
  }

  /**
   * Discipline versions no started tournament references, so an operator can
   * retire a module without breaking a live competition. Profiles hold no
   * version references, so they do not pin anything.
   */
  async retirableDescriptorVersions(): Promise<
    readonly { readonly descriptorId: string; readonly version: string }[]
  > {
    const all = await this.db
      .selectFrom('discipline_descriptors')
      .select(['descriptor_id', 'version'])
      .execute();

    const inUse = await this.db
      .selectFrom('tournaments')
      .select(['descriptor_id', 'descriptor_version'])
      .where('status', 'in', ['started', 'finished'])
      .execute();

    const used = new Set(inUse.map((row) => `${row.descriptor_id}@${row.descriptor_version}`));
    return all
      .filter((row) => !used.has(`${row.descriptor_id}@${row.version}`))
      .map((row) => ({ descriptorId: row.descriptor_id, version: row.version }));
  }

  async requireCompiledRuleset(tournamentId: string): Promise<MatchRuleset> {
    const found = await this.findCompiledRuleset(tournamentId);
    if (!found) {
      throw new NotFoundError(`No compiled ruleset for tournament ${tournamentId}`, {
        tournamentId,
      });
    }
    return found;
  }
}
