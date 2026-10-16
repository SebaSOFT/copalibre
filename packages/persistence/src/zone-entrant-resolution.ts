import type { Kysely } from 'kysely';
import type { RecordedOutcome } from '@copalibre/domain';
import { NotFoundError } from './errors.js';
import {
  isPersistedGraph,
  sourceOf,
  type FixtureGraphBracket,
  type PersistedFixtureNode,
  type PersistedNodeOutcome,
  type ResolvedFixtureSide,
  type ZoneEntrantResolver,
  type ZoneSeriesLookup,
} from './fixture-graph.js';
import { CompetitionRepository } from './repositories/competition-repository.js';
import type { AuditContext } from './repositories/enrollment-repository.js';
import { lockRowsForMutation } from './row-lock.js';
import type { Database } from './schema.js';
import type { UnitOfWork } from './transaction.js';

/** Why a whole contingent node was revived, named in each `match.reinstated` audit record. */
const CONTINGENCY_REINSTATED = 'bracket reset no longer known to be unneeded';

/** Statuses whose stored result the advancement walk counts. */
const COUNTED_STATUSES: ReadonlySet<string> = new Set(['finalized', 'forfeited']);

export interface ZoneEntrantResolutionOutcome {
  /** False for a legacy zone, which this use case never writes. */
  readonly persisted: boolean;
  readonly changedSides: number;
  readonly anulledMatchIds: readonly string[];
  readonly reinstatedMatchIds: readonly string[];
}

type FixtureSide = 'home' | 'away';

/**
 * The only writer of a persisted graph's entrants.
 *
 * Entrants are a cache of structure plus outcomes, so this use case recomputes them rather than
 * accepting them: it locks the zone, reads what is stored, asks the injected `ZoneEntrantResolver`
 * for the resolution, and writes only the sides that differ — each with an audit record and an
 * outbox event in the caller's transaction. A contingent node the resolution marks not-required is
 * released through the series-anulling path, and revived the same way if a correction makes it
 * needed again.
 *
 * The graph calculation lives in `@copalibre/tournament-engine`, which this package never imports.
 * The composition root supplies it, exactly as it supplies `Refold` to `StatisticProjection`.
 */
export class ZoneEntrantResolution {
  private readonly competition: CompetitionRepository;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly resolve: ZoneEntrantResolver,
    private readonly seriesOf: ZoneSeriesLookup,
  ) {
    this.competition = new CompetitionRepository(db);
  }

  async run(
    uow: UnitOfWork,
    zoneId: string,
    audit: AuditContext,
  ): Promise<ZoneEntrantResolutionOutcome> {
    const zone = await uow.tx
      .selectFrom('zones')
      .innerJoin('stages', 'stages.stage_id', 'zones.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .select(['zones.zone_id', 'zones.stage_id', 'seasons.tournament_id'])
      .where('zones.zone_id', '=', zoneId)
      .executeTakeFirst();
    if (!zone) throw new NotFoundError(`Zone ${zoneId} not found`, { zoneId });

    // Locked in a stable order, so two resolutions of one zone queue instead of deadlocking.
    const fixtures = await lockRowsForMutation(
      this.db,
      uow.tx.selectFrom('fixtures').selectAll().where('zone_id', '=', zoneId).orderBy('fixture_id'),
    ).execute();
    const unchanged = { changedSides: 0, anulledMatchIds: [], reinstatedMatchIds: [] };
    if (!isPersistedGraph(fixtures.map((row) => ({ nodeKey: row.node_key })))) {
      return { persisted: false, ...unchanged };
    }

    const matches = await uow.tx
      .selectFrom('matches')
      .select(['match_id', 'fixture_id', 'number', 'status', 'result'])
      .where(
        'fixture_id',
        'in',
        fixtures.map((row) => row.fixture_id),
      )
      .orderBy('number')
      .execute();
    const matchesOf = (fixtureId: string) => matches.filter((m) => m.fixture_id === fixtureId);

    const nodes = fixtures.map((row) => nodeOf(row, matchesOf(row.fixture_id).length));
    const outcomes = fixtures.flatMap((row) =>
      matchesOf(row.fixture_id).flatMap((match) => {
        const outcome = countedOutcomeOf(match);
        return outcome === undefined
          ? []
          : [{ nodeKey: row.node_key as string, matchNumber: match.number, outcome }];
      }),
    ) satisfies PersistedNodeOutcome[];
    const series = nodes.some((node) => node.seriesSpan > 1)
      ? await this.seriesOf({
          tournamentId: zone.tournament_id,
          stageId: zone.stage_id,
          zoneId,
        })
      : undefined;

    const resolutions = this.resolve({
      nodes,
      outcomes,
      ...(series === undefined ? {} : { series }),
    });

    let changedSides = 0;
    const anulledMatchIds: string[] = [];
    const reinstatedMatchIds: string[] = [];
    const fixtureByKey = new Map(fixtures.map((row) => [row.node_key as string, row]));
    for (const resolution of resolutions) {
      const fixture = fixtureByKey.get(resolution.nodeKey);
      if (!fixture) continue;
      const own = matchesOf(fixture.fixture_id);
      const sides: readonly [FixtureSide, string | null, ResolvedFixtureSide][] = [
        ['home', fixture.home_entrant_id, resolution.sides[0]],
        ['away', fixture.away_entrant_id, resolution.sides[1]],
      ];
      for (const [side, previous, resolved] of sides) {
        const entrantId = resolved.state === 'entrant' ? resolved.entrantId : null;
        if (entrantId === previous) continue;
        await this.writeSide(uow, audit, {
          fixtureId: fixture.fixture_id,
          nodeKey: resolution.nodeKey,
          matchIds: own.map((match) => match.match_id),
          side,
          previous,
          entrantId,
        });
        changedSides += 1;
      }

      if (resolution.contingency === 'not-required') {
        const anulled = await this.competition.anullSurplusMatches(uow, {
          ...audit,
          fixtureId: fixture.fixture_id,
          anulledMatchNumbers: own.map((match) => match.number),
        });
        anulledMatchIds.push(...anulled.map((match) => match.matchId));
      } else if (
        resolution.contingency !== undefined &&
        own.length > 0 &&
        own.every((match) => match.status === 'not-required')
      ) {
        // Only a node released whole was released as contingent; a series that merely left its
        // surplus games not-required keeps them that way.
        const reinstated = await this.competition.reinstateAnulledMatches(uow, {
          ...audit,
          fixtureId: fixture.fixture_id,
          matchNumbers: own.map((match) => match.number),
          reason: CONTINGENCY_REINSTATED,
        });
        reinstatedMatchIds.push(...reinstated.map((match) => match.matchId));
      }
    }

    return { persisted: true, changedSides, anulledMatchIds, reinstatedMatchIds };
  }

  /** One side's new entrant, audited and published under every match of the fixture. */
  private async writeSide(
    uow: UnitOfWork,
    audit: AuditContext,
    change: {
      readonly fixtureId: string;
      readonly nodeKey: string;
      readonly matchIds: readonly string[];
      readonly side: FixtureSide;
      readonly previous: string | null;
      readonly entrantId: string | null;
    },
  ): Promise<void> {
    await uow.tx
      .updateTable('fixtures')
      .set(
        change.side === 'home'
          ? { home_entrant_id: change.entrantId }
          : { away_entrant_id: change.entrantId },
      )
      .where('fixture_id', '=', change.fixtureId)
      .execute();

    for (const matchId of change.matchIds) {
      const state = { fixtureId: change.fixtureId, nodeKey: change.nodeKey, side: change.side };
      await uow.recordAudit({
        organizationId: audit.organizationId,
        entityType: 'match',
        entityId: matchId,
        action: 'fixture.entrant-resolved',
        actor: audit.actor,
        authorizationContext: audit.authorizationContext,
        previousState: { ...state, entrantId: change.previous },
        resultingState: { ...state, entrantId: change.entrantId },
      });
      await uow.publishEvent({
        organizationId: audit.organizationId,
        stream: `match:${matchId}`,
        entityId: matchId,
        eventType: 'fixture.entrant-resolved',
        projectionVersion: 1,
        payload: {
          matchId,
          ...state,
          previousEntrantId: change.previous,
          entrantId: change.entrantId,
        },
      });
    }
  }
}

function nodeOf(
  row: {
    readonly node_key: string | null;
    readonly bracket: string | null;
    readonly round: number;
    readonly position: number | null;
    readonly branch: string | null;
    readonly label: string | null;
    readonly home_source: unknown;
    readonly away_source: unknown;
    readonly contingency: string | null;
  },
  seriesSpan: number,
): PersistedFixtureNode {
  return {
    nodeKey: row.node_key as string,
    bracket: row.bracket as FixtureGraphBracket,
    round: row.round,
    position: row.position ?? 0,
    ...(row.branch === null ? {} : { branch: row.branch }),
    ...(row.label === null ? {} : { label: row.label }),
    sides: [sourceOf(row.home_source), sourceOf(row.away_source)],
    seriesSpan,
    ...(row.contingency === 'bracket-reset' ? { contingency: 'bracket-reset' as const } : {}),
  };
}

/** The outcome a stored match contributes to advancement, or none while it is not counted. */
function countedOutcomeOf(match: {
  readonly match_id: string;
  readonly fixture_id: string;
  readonly status: string;
  readonly result: unknown;
}): RecordedOutcome | undefined {
  if (!COUNTED_STATUSES.has(match.status)) return undefined;
  const raw = typeof match.result === 'string' ? JSON.parse(match.result) : match.result;
  const result = raw as RecordedOutcome | null;
  if (!result?.sides) return undefined;
  return {
    matchId: match.match_id,
    fixtureId: match.fixture_id,
    sides: result.sides,
    ...(result.winnerEntrantId === undefined ? {} : { winnerEntrantId: result.winnerEntrantId }),
    ...(result.forfeitedBy === undefined ? {} : { forfeitedBy: result.forfeitedBy }),
  };
}
