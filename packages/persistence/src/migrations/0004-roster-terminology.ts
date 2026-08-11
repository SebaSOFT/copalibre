import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import type { Database } from '../schema.js';

/**
 * Renames the match-specific player selection and its capability (0039).
 *
 * Capabilities are persisted as JSON, so rewriting individual rows runs
 * consistently under the PostgreSQL and SQLite persistence test dialects.
 */
export const rosterTerminology: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const typedDb = db as unknown as Kysely<Database>;
    await rewriteCapabilities(typedDb, 'match.select-lineup', 'match.select-roster');
    await db.schema.alterTable('match_lineups').renameTo('match_rosters').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('match_rosters').renameTo('match_lineups').execute();
    const typedDb = db as unknown as Kysely<Database>;
    await rewriteCapabilities(typedDb, 'match.select-roster', 'match.select-lineup');
  },
};

async function rewriteCapabilities(
  db: Kysely<Database>,
  source: string,
  target: string,
): Promise<void> {
  const assignments = await db
    .selectFrom('match_assignments')
    .select(['assignment_id', 'capabilities'])
    .execute();

  for (const assignment of assignments) {
    const capabilities = assignment.capabilities.map((capability) =>
      capability === source ? target : capability,
    );
    if (capabilities.every((capability, index) => capability === assignment.capabilities[index])) {
      continue;
    }
    await db
      .updateTable('match_assignments')
      .set({ capabilities: JSON.stringify(capabilities) })
      .where('assignment_id', '=', assignment.assignment_id)
      .execute();
  }
}
