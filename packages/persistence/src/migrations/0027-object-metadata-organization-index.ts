import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Composite index `(organization_id, status)` on `object_metadata`:
 * speeds up aggregate queries filtering by organization and processing status
 * (`SUM(size_bytes)`, `COUNT(*) WHERE organization_id = ? AND status = 'passed'`).
 */
export const objectMetadataOrganizationIndex: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createIndex('object_metadata_organization_id_status_idx')
      .on('object_metadata')
      .columns(['organization_id', 'status'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('object_metadata_organization_id_status_idx').ifExists().execute();
  },
};
