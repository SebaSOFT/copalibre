import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Every recorded event may carry an optional operator note, independent
 * of the discipline that defines it and independent of the event's own
 * `payloadSchema`. Nullable, so every existing row reads as having no note.
 */
export const matchEventNotes: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('match_events').addColumn('notes', 'text').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('match_events').dropColumn('notes').execute();
  },
};
