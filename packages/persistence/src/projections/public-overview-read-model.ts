import type { Kysely } from 'kysely';
import { isImplicitGroup, isImplicitZone } from '@copalibre/domain';
import type { Database } from '../schema.js';

/**
 * The read side of a tournament's public overview/live pages.
 *
 * Separate from `StageReadModel` because that projection is scoped to
 * one stage and answers the bracket/standings question; this one is scoped to
 * a whole tournament and answers "every match across every stage, with when
 * it is scheduled" — the one extra fact (`scheduledAt`) neither
 * `StageReadModel.matches` nor `CompetitionRepository` expose today, and the
 * one a spectator overview page cannot do without.
 */

export interface PublicOverviewMatch {
  readonly matchId: string;
  /** The match's stage-local public number, absent before a fixture becomes a match. */
  readonly matchNumber?: number;
  readonly stageNumber: number;
  readonly round: number;
  /** The zone the match's group belongs to, absent when the stage declares none of its own. */
  readonly zoneName?: string;
  /** The match's group, absent when the zone declares none of its own. */
  readonly groupName?: string;
  readonly status: string;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly scores?: readonly (number | undefined)[];
  readonly scheduledAt?: string;
}

export class PublicOverviewReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  /** Every match of every stage of one tournament, in stage/round order. */
  async matchesForTournament(tournamentId: string): Promise<readonly PublicOverviewMatch[]> {
    const rows = await this.db
      .selectFrom('fixtures')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
      .leftJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .leftJoin('match_schedule_assignments', (join) =>
        join
          .onRef('match_schedule_assignments.match_id', '=', 'matches.match_id')
          .on('match_schedule_assignments.published', '=', true),
      )
      .leftJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .leftJoin('groups', (join) =>
        join.onRef('groups.group_id', '=', 'fixtures.group_id').on('groups.deleted_at', 'is', null),
      )
      .leftJoin('zones', (join) =>
        join.onRef('zones.zone_id', '=', 'groups.zone_id').on('zones.deleted_at', 'is', null),
      )
      .select([
        'fixtures.fixture_id',
        'fixtures.round',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'schedule_slots.starts_at as scheduled_starts_at',
        'stages.number as stage_number',
        'matches.match_id',
        'matches.number as match_number',
        'matches.status',
        'matches.result',
        'groups.name as group_name',
        'groups.number as group_number',
        'zones.name as zone_name',
        'zones.number as zone_number',
      ])
      .where('seasons.tournament_id', '=', tournamentId)
      .orderBy('stages.number')
      .orderBy('fixtures.round')
      .orderBy('fixtures.created_at')
      .execute();

    return rows.map((row) => {
      const result = row.result as unknown as {
        readonly sides?: readonly { readonly statistics?: Record<string, number> }[];
      } | null;

      return {
        matchId: row.match_id ?? row.fixture_id,
        ...(row.match_number === null ? {} : { matchNumber: row.match_number }),
        stageNumber: row.stage_number,
        round: row.round,
        ...zoneAndGroupOf(row),
        status: row.status ?? 'scheduled',
        ...(row.home_entrant_id === null ? {} : { homeEntrantId: row.home_entrant_id }),
        ...(row.away_entrant_id === null ? {} : { awayEntrantId: row.away_entrant_id }),
        ...(result?.sides === undefined ? {} : { scores: scoresOf(result.sides) }),
        ...(row.scheduled_starts_at === null || row.scheduled_starts_at === undefined
          ? {}
          : { scheduledAt: new Date(Number(row.scheduled_starts_at)).toISOString() }),
      };
    });
  }
}

/** The organizer's zone and group names; an implicit zone or group names nothing. */
function zoneAndGroupOf(row: {
  readonly group_name: string | null;
  readonly group_number: number | null;
  readonly zone_name: string | null;
  readonly zone_number: number | null;
}): { readonly zoneName?: string; readonly groupName?: string } {
  const zone =
    row.zone_name === null || row.zone_number === null
      ? undefined
      : { name: row.zone_name, number: row.zone_number };
  const group =
    row.group_name === null || row.group_number === null
      ? undefined
      : { name: row.group_name, number: row.group_number };
  return {
    ...(zone === undefined || isImplicitZone(zone) ? {} : { zoneName: zone.name }),
    ...(group === undefined || isImplicitGroup(group) ? {} : { groupName: group.name }),
  };
}

/** Same convention as `StageReadModel`'s own `scoresOf`: the first declared statistic. */
function scoresOf(
  sides: readonly { readonly statistics?: Record<string, number> }[],
): readonly (number | undefined)[] {
  return sides.map((side) => {
    const values = Object.values(side.statistics ?? {});
    return values.length === 0 ? undefined : values[0];
  });
}
