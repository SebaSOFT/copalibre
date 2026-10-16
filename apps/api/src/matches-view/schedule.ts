import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';

export interface PublicPlacement {
  readonly startsAt: number;
  readonly venue: { readonly alias: string; readonly name: string } | null;
}

interface PublicScheduleChange {
  readonly scheduleVersion: number;
  readonly rescheduledFrom: PublicPlacement | null;
  readonly scheduledAt?: string;
  readonly venueName?: string;
}

/** Read placement, latest history and replay version from one consistent database snapshot. */
export async function readPublicScheduleChanges(
  db: Kysely<Database>,
  matchIds: readonly string[],
): Promise<ReadonlyMap<string, PublicScheduleChange>> {
  if (matchIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('matches')
    .leftJoin('projection_versions as version', (join) =>
      join
        .onRef('version.entity_id', '=', 'matches.match_id')
        .on('version.projection_type', '=', 'match-schedule'),
    )
    .leftJoin('match_schedule_assignments as placement', (join) =>
      join
        .onRef('placement.match_id', '=', 'matches.match_id')
        .on('placement.published', '=', true),
    )
    .leftJoin('schedule_slots as slot', 'slot.slot_id', 'placement.slot_id')
    .leftJoin('venues as venue', 'venue.venue_id', 'slot.venue_id')
    .leftJoin('match_schedule_history as history', (join) =>
      join.on('history.history_id', '=', (eb) =>
        eb
          .selectFrom('match_schedule_history as latest')
          .select('latest.history_id')
          .whereRef('latest.match_id', '=', 'matches.match_id')
          .orderBy('latest.changed_at', 'desc')
          .orderBy('latest.history_id', 'desc')
          .limit(1),
      ),
    )
    .leftJoin('venues as prior_venue', 'prior_venue.venue_id', 'history.prior_venue_id')
    .select([
      'matches.match_id',
      'matches.status',
      'version.version',
      'slot.starts_at',
      'venue.name',
      'history.prior_starts_at',
      'history.resulting_slot_id',
      'prior_venue.alias as prior_alias',
      'prior_venue.name as prior_name',
    ])
    .where('matches.match_id', 'in', matchIds)
    .execute();
  return new Map(
    rows.map((row) => [
      row.match_id,
      {
        scheduleVersion: Number(row.version ?? 0),
        scheduledAt:
          row.starts_at === null ? undefined : new Date(Number(row.starts_at)).toISOString(),
        venueName: row.name ?? undefined,
        rescheduledFrom:
          row.status === 'scheduled' &&
          row.resulting_slot_id !== null &&
          row.starts_at !== null &&
          row.prior_starts_at !== null
            ? {
                startsAt: Number(row.prior_starts_at),
                venue:
                  row.prior_alias !== null && row.prior_name !== null
                    ? { alias: row.prior_alias, name: row.prior_name }
                    : null,
              }
            : null,
      },
    ]),
  );
}
