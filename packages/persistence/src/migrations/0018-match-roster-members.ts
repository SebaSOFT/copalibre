import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Structured roster metadata (jersey number, name, tactical roles,
 * on-field-at-kickoff state) alongside `match_rosters.person_ids`. Nullable
 * and additive: `person_ids` stays the source of truth for who is on a
 * roster, and every existing row predates this column.
 */
export const matchRosterMembers: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('match_rosters').addColumn('roster_members', 'jsonb').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('match_rosters').dropColumn('roster_members').execute();
  },
};
