import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A fixture may name the part it plays in an elimination zone when it is not one of the generated
 * graph's own matches: a placement game such as `place-3` or `places-5-8`. Null is every fixture
 * that exists today, which the generated bracket already accounts for, so no row needs backfilling.
 */
export const fixtureRole: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('fixtures').addColumn('role', 'text').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('fixtures').dropColumn('role').execute();
  },
};
