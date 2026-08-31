import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Replaces `match_rosters.person_ids` (a bare list of ids) with
 * `roster_members` (structured: number, name, tactical roles, on-field-at-
 * kickoff state) as the single stored shape for who is on a match roster.
 *
 * Not additive: no code writes `match_rosters` at all yet (roster selection
 * has no endpoint), so there is no real data to migrate and no reason to
 * carry two representations of the same fact that could drift out of sync.
 * `NOT NULL DEFAULT '[]'` — a row without an explicit roster is an empty
 * one, not a nullable field to fall back from.
 */
export const matchRosterMembers: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('match_rosters')
      .addColumn('roster_members', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'`))
      .execute();
    await db.schema.alterTable('match_rosters').dropColumn('person_ids').execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('match_rosters')
      .addColumn('person_ids', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'`))
      .execute();
    await db.schema.alterTable('match_rosters').dropColumn('roster_members').execute();
  },
};
