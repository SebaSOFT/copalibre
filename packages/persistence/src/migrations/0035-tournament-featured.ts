import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `tournaments.featured` — the organizer's own "this one matters" flag, distinct
 * from whichever tournament happens to be live.
 *
 * Not null with a `false` default rather than nullable: every existing row means
 * exactly "not featured", and there is no third state a null would carry. The
 * organization page's existing live-or-most-recent computation stays as the
 * fallback for an organization that never sets it, so backfilling nothing is the
 * correct backfill.
 */
export const tournamentFeatured: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('tournaments')
      .addColumn('featured', 'boolean', (col) => col.notNull().defaultTo(false))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('tournaments').dropColumn('featured').execute();
  },
};
