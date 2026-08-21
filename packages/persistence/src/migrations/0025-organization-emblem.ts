import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `organizations.emblem_object_id` — nullable, additive, no backfill (0109),
 * mirroring `clubs.emblem_object_id` (0019) exactly: a real FK into
 * `object_metadata.object_id`.
 */
export const organizationEmblem: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('organizations')
      .addColumn('emblem_object_id', 'uuid', (col) => col.references('object_metadata.object_id'))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('organizations').dropColumn('emblem_object_id').execute();
  },
};
