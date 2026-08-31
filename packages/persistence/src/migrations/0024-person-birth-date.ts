import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `persons.birth_date` — nullable, additive date column; no default, no backfill.
 */
export const personBirthDate: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('persons').addColumn('birth_date', 'date').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('persons').dropColumn('birth_date').execute();
  },
};
