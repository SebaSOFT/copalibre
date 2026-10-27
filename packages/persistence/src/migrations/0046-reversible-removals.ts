import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Soft-deleted control resources and never-used credentials retain a short undo window. */
export const reversibleRemovals: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    for (const table of ['venues', 'zones', 'groups', 'personal_access_tokens'] as const) {
      await db.schema.alterTable(table).addColumn('deleted_at', 'timestamptz').execute();
      await db.schema
        .createIndex(`${table}_deleted_at_idx`)
        .on(table)
        .column('deleted_at')
        .execute();
    }
  },

  async down(db: Kysely<unknown>): Promise<void> {
    for (const table of ['personal_access_tokens', 'groups', 'zones', 'venues'] as const) {
      await db.schema.dropIndex(`${table}_deleted_at_idx`).execute();
      await db.schema.alterTable(table).dropColumn('deleted_at').execute();
    }
  },
};
