import { foldTournamentCompletion, type RawSegmentStatusCount } from '@copalibre/domain';
import type {
  Match,
  MatchCommand,
  MatchStatus,
  RawStageStatusCount,
  TournamentCompletionSummary,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toMatch } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { findMatchIn } from './competition-support.js';

/** Matches: create, find and list, released slots, commands, finalized matches, counts and completion. */
export class MatchRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createMatch(
    uow: UnitOfWork,
    input: { readonly fixtureId: string; readonly number: number } & AuditContext,
  ): Promise<Match> {
    const existing = await uow.tx
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', input.fixtureId)
      .where('number', '=', input.number)
      .executeTakeFirst();
    if (existing) {
      return toMatch(existing);
    }

    const matchId = newId();
    const row = await uow.tx
      .insertInto('matches')
      .values({
        match_id: matchId,
        fixture_id: input.fixtureId,
        number: input.number,
        status: 'scheduled',
        result: null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: matchId,
      action: 'match.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...match },
    });
    return match;
  }

  async listMatchesForStage(stageId: string, uow?: UnitOfWork): Promise<readonly Match[]> {
    const handle = uow?.tx ?? this.db;
    const rows = await handle
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .selectAll('matches')
      .where('fixtures.stage_id', '=', stageId)
      .orderBy('matches.number')
      .execute();
    return rows.map(toMatch);
  }

  /**
   * The slot each anulled match of a stage had occupied before a decided series freed it.
   *
   * Sourced from the `match.anulled` audit record rather than from a schedule table, because
   * anulling deletes the assignment — the slot goes back to whoever wants it. A builder that
   * only reported "no longer required" would leave an organizer wondering what happened to
   * Court 2 at 19:00; this is what lets it say so. A match anulled while unscheduled has no
   * entry, which is not the same as one whose slot the audit record predates.
   */
  async listReleasedSlotsOfStage(stageId: string): Promise<ReadonlyMap<string, string>> {
    const rows = await this.db
      .selectFrom('audit_log')
      .innerJoin('matches', 'matches.match_id', 'audit_log.entity_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['audit_log.entity_id as match_id', 'audit_log.previous_state as previous_state'])
      .where('fixtures.stage_id', '=', stageId)
      .where('audit_log.entity_type', '=', 'match')
      .where('audit_log.action', '=', 'match.anulled')
      .orderBy('audit_log.occurred_at', 'desc')
      .execute();

    const released = new Map<string, string>();
    for (const row of rows) {
      if (released.has(row.match_id)) continue;
      const previous = row.previous_state;
      const parsed = (typeof previous === 'string' ? JSON.parse(previous) : previous) as
        { readonly releasedSlotId?: unknown } | null | undefined;
      const slotId = parsed?.releasedSlotId;
      if (typeof slotId === 'string') released.set(row.match_id, slotId);
    }
    return released;
  }

  /**
   * Moves a match through the states `applyMatchCommand` permits.
   *
   * The transition itself was decided in the domain; this writes it and says
   * who was allowed to. A finalized match is refused here as well as there,
   * because an invariant enforced in one layer is enforced only until someone
   * calls the other one.
   */
  async applyCommand(
    uow: UnitOfWork,
    input: {
      readonly matchId: string;
      readonly command: MatchCommand;
      readonly status: MatchStatus;
      /** The appointment that authorised it, for the audit row. */
      readonly grantedBy: string;
    } & AuditContext,
  ): Promise<Match> {
    const existing = await findMatchIn(uow.tx, input.matchId);
    if (!existing) {
      throw new NotFoundError(`Match ${input.matchId} does not exist`, { matchId: input.matchId });
    }
    if (existing.status === 'finalized') {
      throw new InvariantViolationError(
        `Match ${input.matchId} is finalized; use the audited correction workflow`,
        { matchId: input.matchId },
      );
    }

    const row = await uow.tx
      .updateTable('matches')
      .set({ status: input.status })
      .where('match_id', '=', input.matchId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const match = toMatch(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match',
      entityId: input.matchId,
      action: `match.${input.command}`,
      actor: input.actor,
      authorizationContext: `${input.authorizationContext} via ${input.grantedBy}`,
      previousState: { ...existing },
      resultingState: { ...match },
    });
    return match;
  }

  /** The stage a match belongs to, which is what scopes an appointment. */
  async stageOfMatch(matchId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('fixtures.stage_id')
      .where('matches.match_id', '=', matchId)
      .executeTakeFirst();
    return row?.stage_id;
  }

  /** Reads through the caller's transaction when given one, so a write it just made is visible. */
  async findMatch(matchId: string, uow?: UnitOfWork): Promise<Match | undefined> {
    return findMatchIn(uow?.tx ?? this.db, matchId);
  }

  /**
   * Every finalized match in scope for a statistics rebuild:
   * organization-wide, or narrowed to one tournament. Ordered so a rebuild's
   * output is deterministic across runs, which is what idempotence is checked
   * against.
   */
  async listFinalizedMatches(scope: {
    readonly organizationId: string;
    readonly tournamentId?: string;
  }): Promise<readonly string[]> {
    let query = this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select('matches.match_id')
      .where('matches.status', '=', 'finalized')
      .where('tournaments.organization_id', '=', scope.organizationId);
    if (scope.tournamentId !== undefined) {
      query = query.where('tournaments.tournament_id', '=', scope.tournamentId);
    }

    const rows = await query.orderBy('matches.created_at').orderBy('matches.match_id').execute();
    return rows.map((row) => row.match_id);
  }

  /**
   * Per-stage match counts grouped by status for a tournament.
   * Uses a single GROUP BY query across stages, fixtures, and matches.
   * Stages with zero fixtures/matches return a single row with status = null and count = 0.
   */
  async countTournamentMatchesByStatus(
    tournamentId: string,
  ): Promise<readonly RawStageStatusCount[]> {
    const rows = await this.db
      .selectFrom('stages')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .leftJoin('fixtures', 'fixtures.stage_id', 'stages.stage_id')
      .leftJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .select([
        'stages.stage_id as stageId',
        'stages.number as stageNumber',
        'stages.name as stageName',
        'matches.status as status',
        this.db.fn.count<string>('matches.match_id').as('count'),
      ])
      .where('seasons.tournament_id', '=', tournamentId)
      .groupBy(['stages.stage_id', 'stages.number', 'stages.name', 'matches.status'])
      .orderBy('stages.number', 'asc')
      .execute();

    return rows.map((r) => ({
      stageId: r.stageId,
      stageNumber: r.stageNumber,
      stageName: r.stageName,
      status: r.status,
      count: parseInt(String(r.count), 10) || 0,
    }));
  }

  /**
   * Match counts per stage, zone and group, for the per-segment progress of a
   * tournament. A fixture without a zone or group contributes no row.
   */
  async countTournamentMatchesBySegment(
    tournamentId: string,
  ): Promise<readonly RawSegmentStatusCount[]> {
    const rows = await this.db
      .selectFrom('stages')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('fixtures', 'fixtures.stage_id', 'stages.stage_id')
      .innerJoin('zones', 'zones.zone_id', 'fixtures.zone_id')
      .innerJoin('groups', 'groups.group_id', 'fixtures.group_id')
      .leftJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .select([
        'stages.stage_id as stageId',
        'zones.zone_id as zoneId',
        'zones.name as zoneName',
        'zones.number as zoneNumber',
        'groups.group_id as groupId',
        'groups.name as groupName',
        'groups.number as groupNumber',
        'matches.status as status',
        this.db.fn.count<string>('matches.match_id').as('count'),
      ])
      .where('seasons.tournament_id', '=', tournamentId)
      .groupBy([
        'stages.stage_id',
        'zones.zone_id',
        'zones.name',
        'zones.number',
        'groups.group_id',
        'groups.name',
        'groups.number',
        'matches.status',
      ])
      .execute();

    return rows.map((r) => ({
      ...r,
      count: parseInt(String(r.count), 10) || 0,
    }));
  }

  /**
   * Tournament-wide completion summary rolled up across every stage.
   * Reuses the platform definition: resolved = finalized + forfeited.
   */
  async getTournamentCompletion(tournamentId: string): Promise<TournamentCompletionSummary> {
    const [counts, segments] = await Promise.all([
      this.countTournamentMatchesByStatus(tournamentId),
      this.countTournamentMatchesBySegment(tournamentId),
    ]);
    return foldTournamentCompletion(counts, segments);
  }
}
