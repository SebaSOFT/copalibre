import { suggestRequiredClubAlias } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import type { Database } from '../schema.js';

/**
 * Every club carries an alias. Clubs created before the suggestion existed, and clubs whose name
 * folds to nothing (for example "北京俱乐部"), were stored with none. Each one is given the alias
 * creation would give it today, and the column becomes NOT NULL.
 *
 * Deterministic: clubs are visited in a fixed order, so two installations holding the same data
 * get the same aliases. Idempotent: a rerun finds no null alias, and SET NOT NULL on a non-null
 * column is a no-op. No audit event is written, because a migration is not an actor (as 0005 and
 * 0016 do). Records no alias history either: a club given its first alias had no URL to preserve.
 */
export const requiredClubAlias: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const typedDb = db as unknown as Kysely<Database>;

    const unaliased = await typedDb
      .selectFrom('clubs')
      .select(['club_id', 'organization_id', 'name', 'abbreviation'])
      .where('alias', 'is', null)
      .orderBy('organization_id')
      .orderBy('created_at')
      .orderBy('club_id')
      .execute();

    if (unaliased.length > 0) {
      const takenByOrganization = new Map<string, Set<string>>();
      const aliased = await typedDb
        .selectFrom('clubs')
        .select(['organization_id', 'alias'])
        .where('alias', 'is not', null)
        .execute();
      for (const row of aliased) {
        if (row.alias === null) continue;
        const taken = takenByOrganization.get(row.organization_id) ?? new Set<string>();
        taken.add(row.alias);
        takenByOrganization.set(row.organization_id, taken);
      }

      for (const club of unaliased) {
        const taken = takenByOrganization.get(club.organization_id) ?? new Set<string>();
        const alias = suggestRequiredClubAlias(club.name, taken, club.abbreviation ?? undefined);
        taken.add(alias);
        takenByOrganization.set(club.organization_id, taken);

        await typedDb
          .updateTable('clubs')
          .set({ alias })
          .where('club_id', '=', club.club_id)
          .execute();
      }
    }

    await db.schema
      .alterTable('clubs')
      .alterColumn('alias', (col) => col.setNotNull())
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // The backfilled aliases are kept: there is no record of which ones were null, and a null alias
    // is no longer a state worth restoring.
    await db.schema
      .alterTable('clubs')
      .alterColumn('alias', (col) => col.dropNotNull())
      .execute();
  },
};
