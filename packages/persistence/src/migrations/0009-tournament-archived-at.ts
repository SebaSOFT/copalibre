import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Records when a tournament was archived — nullable, unset until archival. */
export const tournamentArchivedAt: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('tournaments').addColumn('archived_at', 'timestamptz').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('tournaments').dropColumn('archived_at').execute();
  },
};
