import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Every organization gains a presentation-layer language/timezone default.
 * Defaults match today's de facto behavior — Spanish everywhere,
 * timezone unknown — so existing rows change nothing about how they render.
 */
export const organizationLocale: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('organizations')
      .addColumn('primary_language', 'text', (col) => col.notNull().defaultTo('es'))
      .execute();
    await db.schema
      .alterTable('organizations')
      .addColumn('timezone', 'text', (col) => col.notNull().defaultTo('UTC'))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('organizations').dropColumn('timezone').execute();
    await db.schema.alterTable('organizations').dropColumn('primary_language').execute();
  },
};
