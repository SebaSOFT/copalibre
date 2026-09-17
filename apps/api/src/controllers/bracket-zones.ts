import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';

/**
 * A stage's terminal-stage zone, or the implicit single zone every un-zoned
 * stage has. Shared by every reader that must project one bracket per zone
 * (0245's `resolveTournamentWinners`, 0246's public bracket and operator
 * seeding canvas) so the "no zones declared" fallback is defined exactly once.
 */
export interface StageZone {
  readonly zoneId?: string;
  readonly zoneName?: string;
}

/**
 * A stage's own zones, in declared order — or one implicit zone when none are
 * declared, so every caller's "for each zone" loop runs at least once and an
 * un-zoned stage is unaffected.
 */
export async function resolveStageZones(
  db: Kysely<Database>,
  stageId: string,
): Promise<readonly StageZone[]> {
  const rows = await db
    .selectFrom('zones')
    .selectAll()
    .where('stage_id', '=', stageId)
    .orderBy('number')
    .execute();

  return rows.length > 0
    ? rows.map((row) => ({ zoneId: row.zone_id, zoneName: row.name }))
    : [{ zoneId: undefined, zoneName: undefined }];
}
