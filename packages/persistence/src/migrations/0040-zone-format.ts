import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A zone may play a format other than its stage's. Null means "inherit the stage's", which is
 * every zone that exists today, so no row needs backfilling.
 */
export const zoneFormat: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('zones').addColumn('format', 'text').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('zones').dropColumn('format').execute();
  },
};
