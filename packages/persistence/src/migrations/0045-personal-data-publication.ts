import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Privacy preferences are opt-in for public exposure and false for existing records. */
export const personalDataPublication: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('tournaments')
      .addColumn('includes_minors', 'boolean', (column) => column.notNull().defaultTo(false))
      .execute();
    await db.schema
      .alterTable('tournaments')
      .addColumn('show_youth_profiles', 'boolean', (column) => column.notNull().defaultTo(false))
      .execute();

    await db.schema
      .alterTable('persons')
      .addColumn('hidden_from_public', 'boolean', (column) => column.notNull().defaultTo(false))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('persons').dropColumn('hidden_from_public').execute();
    await db.schema.alterTable('tournaments').dropColumn('show_youth_profiles').execute();
    await db.schema.alterTable('tournaments').dropColumn('includes_minors').execute();
  },
};
