import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A snapshot of the active segment's running clock at the moment an event
 * was recorded, so a timecode (`45'`, `12:34`) never needs recomputing from
 * segment start times and event `occurredAt` after the fact. Nullable: a
 * non-timed segment (a tennis set) has no running clock to snapshot, and
 * every existing row predates this column.
 */
export const matchEventSegmentElapsedSeconds: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('match_events')
      .addColumn('segment_elapsed_seconds', 'integer')
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('match_events').dropColumn('segment_elapsed_seconds').execute();
  },
};
