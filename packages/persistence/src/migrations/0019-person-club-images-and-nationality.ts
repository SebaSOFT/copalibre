import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `persons.nationality`, `persons.photo_object_id`, `clubs.emblem_object_id`
 * — nullable, additive columns; no default, no backfill. Both
 * `_object_id` columns are real foreign keys into `object_metadata.object_id`
 * (the upload pipeline's own single source of truth for an uploaded object's
 * storage/scan state), matching this schema's pervasive use of real FKs
 * (e.g. `match_events.match_id references matches.match_id`).
 */
export const personClubImagesAndNationality: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('persons').addColumn('nationality', 'text').execute();
    await db.schema
      .alterTable('persons')
      .addColumn('photo_object_id', 'uuid', (col) => col.references('object_metadata.object_id'))
      .execute();
    await db.schema
      .alterTable('clubs')
      .addColumn('emblem_object_id', 'uuid', (col) => col.references('object_metadata.object_id'))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('clubs').dropColumn('emblem_object_id').execute();
    await db.schema.alterTable('persons').dropColumn('photo_object_id').execute();
    await db.schema.alterTable('persons').dropColumn('nationality').execute();
  },
};
