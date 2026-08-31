import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Durable clock state and idempotent finalization. */
export const liveMatchConsole: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('segments')
      .addColumn('elapsed_seconds', 'integer', (col) => col.notNull().defaultTo(0))
      .execute();
    // SQLite accepts one ADD COLUMN per ALTER TABLE statement. Keeping the
    // statements separate also makes the migration executable by its ephemeral
    // integration harness without changing PostgreSQL's resulting schema.
    await db.schema.alterTable('segments').addColumn('clock_started_at', 'timestamptz').execute();

    await db.schema
      .createTable('match_command_idempotency')
      .addColumn('idempotency_key', 'text', (col) => col.primaryKey())
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('operation', 'text', (col) => col.notNull())
      .addColumn('request_fingerprint', 'text', (col) => col.notNull())
      .addColumn('response', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createTable('match_timer_resolutions')
      .addColumn('timer_id', 'uuid', (col) => col.primaryKey().references('match_events.event_id'))
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('actor', 'text', (col) => col.notNull())
      .addColumn('resolved_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('match_command_idempotency_match_idx')
      .on('match_command_idempotency')
      .columns(['match_id', 'operation'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('match_timer_resolutions').ifExists().execute();
    await db.schema.dropTable('match_command_idempotency').ifExists().execute();
    await db.schema.alterTable('segments').dropColumn('clock_started_at').execute();
    await db.schema.alterTable('segments').dropColumn('elapsed_seconds').execute();
  },
};
