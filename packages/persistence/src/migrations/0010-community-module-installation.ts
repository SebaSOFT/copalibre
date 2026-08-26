import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Tracks each installed community module's source and attribution holder
 * and the object-storage references for its uploaded assets.
 * `document_id` points at the `discipline_descriptors`/`tournament_profiles`
 * row matching `kind`+`alias`+`version` — a polymorphic reference the schema
 * does not enforce with a foreign key (Postgres has none spanning two
 * target tables); the importer writes both rows in one transaction, which is
 * what actually keeps them consistent.
 */
export const communityModuleInstallation: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('installed_modules')
      .addColumn('module_id', 'uuid', (col) => col.primaryKey())
      .addColumn('kind', 'text', (col) => col.notNull())
      .addColumn('alias', 'text', (col) => col.notNull())
      .addColumn('version', 'text', (col) => col.notNull())
      .addColumn('document_id', 'uuid', (col) => col.notNull())
      // Denormalized from the descriptor/profile document at install time —
      // avoids a join that would otherwise have to pick between two
      // different target tables depending on `kind`, just to answer "who
      // holds this alias" for the reserved-alias-shadowing check (task 3.6).
      .addColumn('attribution_author', 'text', (col) => col.notNull())
      .addColumn('attribution_licence', 'text', (col) => col.notNull())
      .addColumn('attribution_source_url', 'text')
      // Snapshotted from the manifest at install time so `module verify`
      // (task 4.6) can re-check core-version compatibility without needing
      // the original module package on disk.
      .addColumn('requires_copalibre', 'text', (col) => col.notNull())
      .addColumn('source_kind', 'text', (col) => col.notNull())
      .addColumn('source_repository_url', 'text', (col) => col.notNull())
      .addColumn('installed_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('installed_modules_alias_version_unique')
      .on('installed_modules')
      .columns(['alias', 'version'])
      .unique()
      .execute();
    await db.schema
      .createIndex('installed_modules_alias_idx')
      .on('installed_modules')
      .columns(['alias'])
      .execute();

    await db.schema
      .createTable('module_assets')
      .addColumn('asset_id', 'uuid', (col) => col.primaryKey())
      .addColumn('module_id', 'uuid', (col) =>
        col.notNull().references('installed_modules.module_id'),
      )
      .addColumn('path', 'text', (col) => col.notNull())
      .addColumn('kind', 'text', (col) => col.notNull())
      .addColumn('content_type', 'text', (col) => col.notNull())
      .addColumn('size_bytes', 'bigint', (col) => col.notNull())
      .addColumn('storage_bucket', 'text', (col) => col.notNull())
      .addColumn('storage_key', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('module_assets_module_idx')
      .on('module_assets')
      .columns(['module_id'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('module_assets').ifExists().execute();
    await db.schema.dropTable('installed_modules').ifExists().execute();
  },
};
