import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The object-storage capability's own metadata registry: one row per
 * object stored through `@copalibre/object-storage`'s adapter, pointing at
 * its profile-agnostic storage key — no object bytes live in this database.
 * `status` is the async media-processing job's tracking field (pending until
 * validation/malware-scan/thumbnail generation completes); a domain-specific
 * table (`report_evidence`, `module_assets`) that already records its own
 * storage reference and status is left as-is — this table is for a caller
 * with no such table of its own, not a forced migration of theirs.
 *
 * `organization_id` has no FK to `organizations` (matching `audit_log`'s own
 * column) so a system-level object can carry `SYSTEM_ORGANIZATION`'s
 * sentinel value — a failed scan is audited (task 2.5), and `recordAudit`
 * requires an organization to scope the entry to.
 */
export const objectStorageMetadata: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('object_metadata')
      .addColumn('object_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) => col.notNull())
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
