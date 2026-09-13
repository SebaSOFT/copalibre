import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `tournaments.emblem_object_id` — nullable, additive, no backfill,
 * mirroring `organizations.emblem_object_id` (0025) and `clubs.emblem_object_id` (0019):
 * a real FK into `object_metadata.object_id`.
 */
export const tournamentEmblem: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('tournaments')
      .addColumn('emblem_object_id', 'uuid', (col) => col.references('object_metadata.object_id'))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('tournaments').dropColumn('emblem_object_id').execute();
  },
};
