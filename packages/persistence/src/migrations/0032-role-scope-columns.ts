import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Adds the two nullable resource-scope columns the declared capability
 * mapping (openspec 0165) needs: `club_id`, required exactly for a
 * `club-admin` assignment, and `tournament_id`, required exactly for a
 * `tournament-admin` assignment — validated in the domain layer
 * (`validateOrganizationInvitation`), not by a database constraint, the same
 * way the first-assignment-must-be-admin rule already is. Every existing
 * assignment and invitation is unaffected: both columns default to null, and
 * neither `club-admin` nor `tournament-admin` could be assigned with a scope
 * before this migration, so there is nothing to backfill.
 *
 * Also widens both tables' `role` check constraint to admit `tournament-admin`
 * — new with this change (see `packages/domain`'s `ORGANIZATION_ROLES`).
 */
export const roleScopeColumns: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('organization_role_assignments')
      .addColumn('club_id', 'uuid', (col) => col.references('clubs.club_id'))
      .execute();
    await db.schema
      .alterTable('organization_role_assignments')
      .addColumn('tournament_id', 'uuid', (col) => col.references('tournaments.tournament_id'))
      .execute();
    await db.schema
      .alterTable('organization_role_assignments')
      .dropConstraint('organization_role_assignments_role')
      .execute();
    await db.schema
      .alterTable('organization_role_assignments')
      .addCheckConstraint(
        'organization_role_assignments_role',
        sql`role in ('admin', 'club-admin', 'tournament-admin', 'referee', 'broadcaster', 'viewer')`,
      )
      .execute();

    await db.schema
      .alterTable('organization_invites')
      .addColumn('club_id', 'uuid', (col) => col.references('clubs.club_id'))
      .execute();
    await db.schema
      .alterTable('organization_invites')
      .addColumn('tournament_id', 'uuid', (col) => col.references('tournaments.tournament_id'))
      .execute();
    await db.schema
      .alterTable('organization_invites')
      .dropConstraint('organization_invites_role')
      .execute();
    await db.schema
      .alterTable('organization_invites')
      .addCheckConstraint(
        'organization_invites_role',
        sql`role in ('admin', 'club-admin', 'tournament-admin', 'referee', 'broadcaster', 'viewer')`,
      )
      .execute();

    await db.schema
      .createIndex('organization_role_assignments_club_idx')
      .on('organization_role_assignments')
      .columns(['club_id'])
      .execute();
    await db.schema
      .createIndex('organization_role_assignments_tournament_idx')
      .on('organization_role_assignments')
      .columns(['tournament_id'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('organization_role_assignments_tournament_idx').ifExists().execute();
    await db.schema.dropIndex('organization_role_assignments_club_idx').ifExists().execute();

    await db.schema
      .alterTable('organization_invites')
      .dropConstraint('organization_invites_role')
      .execute();
    await db.schema
      .alterTable('organization_invites')
      .addCheckConstraint(
        'organization_invites_role',
        sql`role in ('admin', 'club-admin', 'referee', 'broadcaster', 'viewer')`,
      )
      .execute();
    await db.schema.alterTable('organization_invites').dropColumn('tournament_id').execute();
    await db.schema.alterTable('organization_invites').dropColumn('club_id').execute();

    await db.schema
      .alterTable('organization_role_assignments')
      .dropConstraint('organization_role_assignments_role')
      .execute();
    await db.schema
      .alterTable('organization_role_assignments')
      .addCheckConstraint(
        'organization_role_assignments_role',
        sql`role in ('admin', 'club-admin', 'referee', 'broadcaster', 'viewer')`,
      )
      .execute();
    await db.schema
      .alterTable('organization_role_assignments')
      .dropColumn('tournament_id')
      .execute();
    await db.schema.alterTable('organization_role_assignments').dropColumn('club_id').execute();
  },
};
