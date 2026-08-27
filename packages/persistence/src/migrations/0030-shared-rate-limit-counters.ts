import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Durable, opaque throttler buckets shared by every API replica. */
export const sharedRateLimitCounters: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('shared_rate_limit_counters')
      .addColumn('bucket_key', 'text', (column) => column.primaryKey())
      .addColumn('hit_count', 'integer', (column) => column.notNull())
      .addColumn('window_expires_at', 'timestamptz', (column) => column.notNull())
      .addColumn('block_expires_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('updated_at', 'timestamptz', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();
    await db.schema
      .createIndex('shared_rate_limit_counters_expiry_idx')
      .on('shared_rate_limit_counters')
      .columns(['window_expires_at'])
      .execute();
    await db.schema
      .createIndex('shared_rate_limit_counters_block_expiry_idx')
      .on('shared_rate_limit_counters')
      .columns(['block_expires_at'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('shared_rate_limit_counters').ifExists().execute();
  },
};
