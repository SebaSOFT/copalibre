import { suggestRequiredClubAlias } from '@copalibre/domain';
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import type { Database } from '../schema.js';

/** A UUID-shaped alias is an identifier that was stored as one. It never worked as a public URL. */
const UUID_SHAPED = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

/**
 * Every club carries an alias. Clubs created before the suggestion existed, clubs whose name folds
 * to nothing (for example "北京俱乐部"), and clubs whose stored alias is UUID-shaped, get the alias
 * creation would give them today, and the column becomes NOT NULL.
 *
 * Taken aliases for a suggestion are the organization's current aliases, minus the UUID-shaped ones,
 * plus every former club alias in `alias_redirects`: a former alias still has inbound links, and a
 * suggestion must not hand it to another club.
 *
 * Deterministic: clubs are visited in a fixed order, so two installations with the same data get the
 * same aliases. Idempotent: a rerun finds no club needing an alias, and SET NOT NULL on a non-null
 * column is a no-op. No audit event is written, because a migration is not an actor (as 0005 and 0016
 * do). Records no alias history: a club given its first alias had no URL to preserve, and a UUID-shaped
 * alias never worked as one.
 */
export const requiredClubAlias: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const typedDb = db as unknown as Kysely<Database>;

    const unaliased = await typedDb
      .selectFrom('clubs')
      .select(['club_id', 'organization_id', 'name', 'abbreviation'])
      .where(sql<boolean>`alias IS NULL OR alias ~ ${UUID_SHAPED}`)
      .orderBy('organization_id')
      .orderBy('created_at')
      .orderBy('club_id')
      .execute();

    if (unaliased.length > 0) {
      const takenByOrganization = new Map<string, Set<string>>();
      const takenFor = (organizationId: string): Set<string> => {
        const existing = takenByOrganization.get(organizationId);
        if (existing) return existing;
        const created = new Set<string>();
        takenByOrganization.set(organizationId, created);
        return created;
      };

      const aliased = await typedDb
        .selectFrom('clubs')
        .select(['organization_id', 'alias'])
        .where(sql<boolean>`alias IS NOT NULL AND alias !~ ${UUID_SHAPED}`)
        .execute();
      for (const row of aliased) {
        if (row.alias !== null) takenFor(row.organization_id).add(row.alias);
      }

      const formerAliases = await typedDb
        .selectFrom('alias_redirects')
        .select(['organization_id', 'old_alias'])
        .where('scope', '=', 'club')
        .execute();
      for (const row of formerAliases) {
        takenFor(row.organization_id).add(row.old_alias);
      }

      for (const club of unaliased) {
        const taken = takenFor(club.organization_id);
        const alias = suggestRequiredClubAlias(club.name, taken, club.abbreviation ?? undefined);
        taken.add(alias);

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
    // The backfilled aliases are kept: there is no record of which ones were null or UUID-shaped, and
    // a null alias is no longer a state worth restoring.
    await db.schema
      .alterTable('clubs')
      .alterColumn('alias', (col) => col.dropNotNull())
      .execute();
  },
};
