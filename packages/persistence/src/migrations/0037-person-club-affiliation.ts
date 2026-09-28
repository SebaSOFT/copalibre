import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `persons.club_id` — nullable, additive, real FK into `clubs.club_id` (this
 * schema's existing convention for every other `club_id` column: `teams.club_id`,
 * `organization_role_assignments.club_id`, `organization_invites.club_id`).
 *
 * A person's only prior link to a club was indirect and transitive, through a
 * `players` row on a team that itself carries `club_id`. That is not enough to
 * let a club administrator maintain a member directory before any team or
 * tournament exists (openspec 0301) — this column is the direct affiliation
 * that workflow needs. Every existing person keeps `club_id = null` and is
 * otherwise unaffected; nothing to backfill.
 */
export const personClubAffiliation: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('persons')
      .addColumn('club_id', 'uuid', (col) => col.references('clubs.club_id'))
      .execute();
    await db.schema.createIndex('persons_club_idx').on('persons').columns(['club_id']).execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('persons_club_idx').ifExists().execute();
    await db.schema.alterTable('persons').dropColumn('club_id').execute();
  },
};
