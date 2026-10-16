import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A tournament's stored minimum rest, and the append-only record of every change to a
 * published placement. The prior slot, start, venue and officials are copied rather than
 * referenced, so editing or deleting a venue or schedule later never rewrites what a
 * published match used to be.
 */
export const scheduleIntegrity: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('tournaments')
      .addColumn('minimum_rest_minutes', 'integer')
      .execute();

    await db.schema
      .createTable('match_schedule_history')
      .addColumn('history_id', 'uuid', (col) => col.primaryKey())
      .addColumn('match_id', 'uuid', (col) =>
        col.notNull().references('matches.match_id').onDelete('cascade'),
      )
      .addColumn('prior_slot_id', 'uuid', (col) => col.notNull())
      .addColumn('prior_starts_at', 'bigint', (col) => col.notNull())
      .addColumn('prior_venue_id', 'uuid', (col) => col.notNull())
      .addColumn('prior_official_ids', 'jsonb', (col) => col.notNull())
      .addColumn('resulting_slot_id', 'uuid')
      .addColumn('reason_code', 'text')
      .addColumn('reason', 'text', (col) => col.notNull())
      .addColumn('actor', 'text', (col) => col.notNull())
      .addColumn('changed_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();
    await db.schema
      .createIndex('match_schedule_history_match_changed_idx')
      .on('match_schedule_history')
      .columns(['match_id', 'changed_at'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('match_schedule_history').execute();
    await db.schema.alterTable('tournaments').dropColumn('minimum_rest_minutes').execute();
  },
};
