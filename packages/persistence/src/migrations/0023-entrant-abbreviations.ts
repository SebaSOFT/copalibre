import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Tournament-scoped, distinct entrant labels for constrained display surfaces. */
export const entrantAbbreviations: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('entrants').addColumn('abbreviation', 'text').execute();
    await db.schema
      .createIndex('entrants_tournament_abbreviation_unique')
      .on('entrants')
      .columns(['tournament_id', 'abbreviation'])
      .where('abbreviation', 'is not', null)
      .unique()
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('entrants_tournament_abbreviation_unique').ifExists().execute();
    await db.schema.alterTable('entrants').dropColumn('abbreviation').execute();
  },
};
