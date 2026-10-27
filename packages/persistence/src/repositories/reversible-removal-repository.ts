import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';
import { withTransaction } from '../transaction.js';

export interface ReversibleRemovalPurgeCounts {
  readonly venues: number;
  readonly zones: number;
  readonly groups: number;
  readonly tokens: number;
}

const UNDO_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Permanently removes reversible records only after their 24-hour recovery window. */
export class ReversibleRemovalRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async purgeExpired(now = new Date()): Promise<ReversibleRemovalPurgeCounts> {
    const cutoff = new Date(now.getTime() - UNDO_RETENTION_MS);
    return withTransaction(this.db, async (uow) => {
      const expiredZones = await uow.tx
        .selectFrom('zones')
        .select('zone_id')
        .where('deleted_at', '<=', cutoff)
        .execute();
      const zoneIds = expiredZones.map((zone) => zone.zone_id);
      const expiredGroups = await uow.tx
        .selectFrom('groups')
        .select('group_id')
        .where((eb) =>
          zoneIds.length === 0
            ? eb('deleted_at', '<=', cutoff)
            : eb.or([eb('deleted_at', '<=', cutoff), eb('zone_id', 'in', zoneIds)]),
        )
        .execute();
      const groupIds = expiredGroups.map((group) => group.group_id);

      if (groupIds.length > 0) {
        await uow.tx.deleteFrom('group_entrants').where('group_id', 'in', groupIds).execute();
        await uow.tx.deleteFrom('groups').where('group_id', 'in', groupIds).execute();
      }
      if (zoneIds.length > 0) {
        await uow.tx.deleteFrom('zone_entrants').where('zone_id', 'in', zoneIds).execute();
        await uow.tx.deleteFrom('promotion_plans').where('zone_id', 'in', zoneIds).execute();
        await uow.tx.deleteFrom('zones').where('zone_id', 'in', zoneIds).execute();
      }

      const venues = await uow.tx
        .deleteFrom('venues')
        .where('deleted_at', '<=', cutoff)
        .returning('venue_id')
        .execute();
      const tokens = await uow.tx
        .deleteFrom('personal_access_tokens')
        .where('deleted_at', '<=', cutoff)
        .returning('token_id')
        .execute();

      return {
        venues: venues.length,
        zones: zoneIds.length,
        groups: groupIds.length,
        tokens: tokens.length,
      };
    });
  }
}
