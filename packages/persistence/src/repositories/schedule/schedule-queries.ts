import {
  estimatedMatchMinutes,
  type DisciplineDescriptor,
  type ResourceAssignment,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError } from '../../errors.js';
import { toResourceAssignment } from '../../mapping.js';
import type { Database } from '../../schema.js';
import {
  type SchedulePlacementHistory,
  type OrganizationScheduleEntry,
  type ScheduleAssignmentDetail,
  MAX_ORGANIZATION_RANGE_MS,
  parseJson,
} from './schedule-support.js';

/** Stage schedules, placement history and organization schedule reads. */
export class ScheduleQueryRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listScheduleForStage(stageId: string): Promise<readonly ResourceAssignment[]> {
    const rows = await this.db
      .selectFrom('match_schedule_assignments')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_assignments.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['match_schedule_assignments.match_id', 'match_schedule_assignments.slot_id'])
      .where('fixtures.stage_id', '=', stageId)
      .where('matches.status', '!=', 'not-required')
      .execute();

    if (rows.length === 0) return [];

    const matchIds = rows.map((r) => r.match_id);
    const officials = await this.db
      .selectFrom('match_schedule_officials')
      .selectAll()
      .where('match_id', 'in', matchIds)
      .execute();

    return rows.map((row) =>
      toResourceAssignment(
        row,
        officials.filter((o) => o.match_id === row.match_id).map((o) => o.official_id),
      ),
    );
  }

  async listScheduleDetailsForStage(stageId: string): Promise<readonly ScheduleAssignmentDetail[]> {
    const rows = await this.db
      .selectFrom('match_schedule_assignments')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_assignments.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .innerJoin('schedules', 'schedules.schedule_id', 'schedule_slots.schedule_id')
      .select([
        'matches.match_id',
        'fixtures.fixture_id',
        'schedule_slots.slot_id',
        'schedule_slots.venue_id',
        'schedule_slots.starts_at',
        'schedules.slot_minutes',
      ])
      .where('fixtures.stage_id', '=', stageId)
      .where('matches.status', '!=', 'not-required')
      .execute();

    if (rows.length === 0) return [];

    const matchIds = rows.map((r) => r.match_id);
    const officials = await this.db
      .selectFrom('match_schedule_officials')
      .selectAll()
      .where('match_id', 'in', matchIds)
      .execute();

    return rows.map((row) => {
      const matchOfficials = officials
        .filter((o) => o.match_id === row.match_id)
        .map((o) => o.official_id);
      return {
        matchId: row.match_id,
        fixtureId: row.fixture_id,
        slotId: row.slot_id,
        venueId: row.venue_id,
        window: {
          startsAt: Number(row.starts_at),
          durationMinutes: row.slot_minutes,
        },
        ...(matchOfficials.length === 0 ? {} : { officialIds: matchOfficials }),
      };
    });
  }

  /**
   * Each tournament's estimated match length, from its discipline and its latest ruleset's
   * overrides — the one duration conflict detection and every timeline drawing share.
   */
  async occupancyByTournament(
    executor: Kysely<Database>,
    tournamentIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    if (tournamentIds.length === 0) return new Map();
    const descriptors = await executor
      .selectFrom('tournaments')
      .innerJoin('discipline_descriptors', (join) =>
        join
          .onRef('discipline_descriptors.descriptor_id', '=', 'tournaments.descriptor_id')
          .onRef('discipline_descriptors.version', '=', 'tournaments.descriptor_version'),
      )
      .select(['tournaments.tournament_id', 'discipline_descriptors.document'])
      .where('tournaments.tournament_id', 'in', [...tournamentIds])
      .execute();
    const rulesets = await executor
      .selectFrom('tournament_rulesets')
      .select(['tournament_id', 'version', 'overrides'])
      .where('tournament_id', 'in', [...tournamentIds])
      .orderBy('version', 'asc')
      .execute();
    const overridesOf = new Map<string, Readonly<Record<string, unknown>>>();
    for (const ruleset of rulesets) {
      overridesOf.set(ruleset.tournament_id, parseJson(ruleset.overrides) ?? {});
    }

    const occupancy = new Map<string, number>();
    for (const row of descriptors) {
      const document = parseJson(row.document) as DisciplineDescriptor | undefined;
      if (!document) continue;
      const minutes = estimatedMatchMinutes(document, overridesOf.get(row.tournament_id));
      if (minutes !== undefined) occupancy.set(row.tournament_id, minutes);
    }
    return occupancy;
  }

  // ---------------------------------------------------------------------------
  // History & organization reads
  // ---------------------------------------------------------------------------

  /** A match's published-placement history, oldest first. */
  async listScheduleHistory(matchId: string): Promise<readonly SchedulePlacementHistory[]> {
    const rows = await this.db
      .selectFrom('match_schedule_history')
      .selectAll()
      .where('match_id', '=', matchId)
      .orderBy('changed_at')
      .orderBy('history_id')
      .execute();
    return rows.map((row) => ({
      historyId: row.history_id,
      matchId: row.match_id,
      priorSlotId: row.prior_slot_id,
      priorStartsAt: Number(row.prior_starts_at),
      priorVenueId: row.prior_venue_id,
      priorOfficialIds: (parseJson(row.prior_official_ids) as readonly string[] | undefined) ?? [],
      ...(row.resulting_slot_id === null ? {} : { resultingSlotId: row.resulting_slot_id }),
      ...(row.reason_code === null ? {} : { reasonCode: row.reason_code }),
      reason: row.reason,
      actor: row.actor,
      changedAt: new Date(row.changed_at).toISOString(),
    }));
  }

  /** The organization's most recent distinct typed reasons, newest first. */
  async recentScheduleReasons(organizationId: string, limit = 10): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('match_schedule_history')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_history.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select((eb) => [
        'match_schedule_history.reason',
        eb.fn.max('match_schedule_history.changed_at').as('last_used'),
      ])
      .where('tournaments.organization_id', '=', organizationId)
      .where('match_schedule_history.reason_code', 'is', null)
      .groupBy('match_schedule_history.reason')
      .orderBy('last_used', 'desc')
      .limit(limit)
      .execute();
    return rows.map((row) => row.reason);
  }

  /**
   * An organization's assignments whose start falls in `[from, to)`, across its tournaments,
   * optionally narrowed to one tournament, stage or venue. The range is capped so one read
   * never scans a season.
   */
  async listOrganizationSchedule(input: {
    readonly organizationId: string;
    readonly from: number;
    readonly to: number;
    readonly tournamentId?: string;
    readonly stageId?: string;
    readonly venueId?: string;
  }): Promise<readonly OrganizationScheduleEntry[]> {
    if (!(input.to > input.from) || input.to - input.from > MAX_ORGANIZATION_RANGE_MS) {
      throw new InvariantViolationError(
        'An organization schedule read covers a positive range of at most 31 days',
        { from: input.from, to: input.to },
      );
    }
    let query = this.db
      .selectFrom('match_schedule_assignments')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .innerJoin('schedules', 'schedules.schedule_id', 'schedule_slots.schedule_id')
      .innerJoin('matches', 'matches.match_id', 'match_schedule_assignments.match_id')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'seasons.tournament_id')
      .select([
        'matches.match_id',
        'matches.status',
        'tournaments.tournament_id',
        'stages.stage_id',
        'fixtures.zone_id',
        'fixtures.round',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'schedule_slots.slot_id',
        'schedule_slots.venue_id',
        'schedule_slots.starts_at',
        'schedules.slot_minutes',
        'match_schedule_assignments.published',
      ])
      .where('tournaments.organization_id', '=', input.organizationId)
      .where('schedules.organization_id', '=', input.organizationId)
      .where('matches.status', '!=', 'not-required')
      .where('schedule_slots.starts_at', '>=', String(input.from))
      .where('schedule_slots.starts_at', '<', String(input.to));
    if (input.tournamentId !== undefined) {
      query = query.where('tournaments.tournament_id', '=', input.tournamentId);
    }
    if (input.stageId !== undefined) query = query.where('stages.stage_id', '=', input.stageId);
    if (input.venueId !== undefined) {
      query = query.where('schedule_slots.venue_id', '=', input.venueId);
    }
    const rows = await query
      .orderBy('schedule_slots.starts_at')
      .orderBy('matches.match_id')
      .execute();
    const occupancy = await this.occupancyByTournament(this.db, [
      ...new Set(rows.map((row) => row.tournament_id)),
    ]);

    return rows.map((row) => {
      const startsAt = Number(row.starts_at);
      const minutes = occupancy.get(row.tournament_id) ?? row.slot_minutes;
      return {
        matchId: row.match_id,
        status: row.status,
        tournamentId: row.tournament_id,
        stageId: row.stage_id,
        ...(row.zone_id === null ? {} : { zoneId: row.zone_id }),
        round: row.round,
        entrantIds: [row.home_entrant_id, row.away_entrant_id].filter(
          (id): id is string => id !== null,
        ),
        slotId: row.slot_id,
        venueId: row.venue_id,
        startsAt,
        estimatedEnd: startsAt + minutes * 60_000,
        published: Boolean(row.published),
      };
    });
  }
}
