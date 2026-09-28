import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Ephemeral aggregate telemetry. No client addresses, tokens, or tournament identities. */
export const realtimeReplicas: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('realtime_replicas')
      .addColumn('replica_id', 'uuid', (column) => column.primaryKey())
      .addColumn('tv_kiosks', 'integer', (column) => column.notNull())
      .addColumn('overlays', 'integer', (column) => column.notNull())
      .addColumn('public_spectators', 'integer', (column) => column.notNull())
      .addColumn('control_connections', 'integer', (column) => column.notNull())
      .addColumn('unclassified', 'integer', (column) => column.notNull())
      .addColumn('reported_at', 'timestamptz', (column) => column.notNull())
      .addColumn('expires_at', 'timestamptz', (column) => column.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('realtime_replicas').execute();
  },
};
