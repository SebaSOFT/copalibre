import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The object-storage capability's own metadata registry (0041): one row per
 * object stored through `@copalibre/object-storage`'s adapter, pointing at
 * its profile-agnostic storage key — no object bytes live in this database.
 * `status` is the async media-processing job's tracking field (pending until
 * validation/malware-scan/thumbnail generation completes); a domain-specific
 * table (`report_evidence`, `module_assets`) that already records its own
 * storage reference and status is left as-is — this table is for a caller
 * with no such table of its own, not a forced migration of theirs.
 */
export const objectStorageMetadata: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('object_metadata')
      .addColumn('object_id', 'uuid', (col) => col.primaryKey())
      .addColumn('profile', 'text', (col) => col.notNull())
      .addColumn('storage_key', 'text', (col) => col.notNull())
      .addColumn('content_type', 'text', (col) => col.notNull())
      .addColumn('size_bytes', 'bigint', (col) => col.notNull())
      .addColumn('uploaded_by', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('object_metadata_status_idx')
      .on('object_metadata')
      .columns(['status'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('object_metadata').ifExists().execute();
  },
};
