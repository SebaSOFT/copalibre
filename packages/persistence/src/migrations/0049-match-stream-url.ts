import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A match may carry the link its broadcast is watched through. The column is a presentation attribute:
 * no result, standing or schedule rule reads it, so the change is safe. Nullable, because every existing
 * match has no link until an organizer sets one.
 */
export const matchStreamUrl: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('matches').addColumn('stream_url', 'text').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('matches').dropColumn('stream_url').execute();
  },
};
