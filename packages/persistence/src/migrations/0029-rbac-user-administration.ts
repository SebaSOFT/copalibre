import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * 0140: adds `club-admin` to the organization role taxonomy and introduces
 * `installation_role_assignments` as the queryable, floor-invariant-protected
 * source of truth for "who holds installation-level `super-admin`" — see
 * design.md decision #1. No backfill step: this codebase has no existing
 * queryable source of current super-admins to backfill from (the
 * `copalibre.super-admin` scope was, until this change, either supplied
 * directly by an external OIDC provider's own token claims — unaffected by
 * this table — or never granted at all through the local-auth path). A
 * super-admin authenticated via an external OIDC token whose `scp` claim
 * already carries `copalibre.super-admin` continues to work unchanged; the
 * new `POST installation/super-admins` endpoint (gated by that same
 * pre-existing authority) is how the first row in this table gets created.
 */
export const rbacUserAdministration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
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

    await db.schema
      .createTable('installation_role_assignments')
      .addColumn('assignment_id', 'uuid', (col) => col.primaryKey())
      .addColumn('principal_id', 'uuid', (col) =>
        col.notNull().references('identity_principals.principal_id'),
      )
      .addColumn('role', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('updated_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('deleted_at', 'timestamptz')
      .addUniqueConstraint('installation_role_assignments_principal_unique', ['principal_id'])
      .addCheckConstraint('installation_role_assignments_role', sql`role in ('super-admin')`)
      .addCheckConstraint(
        'installation_role_assignments_status',
        sql`status in ('active', 'inactive')`,
      )
      .execute();

    await db.schema
      .createIndex('installation_role_assignments_principal_idx')
      .on('installation_role_assignments')
      .columns(['principal_id'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('installation_role_assignments').ifExists().execute();

    await db.schema
      .alterTable('organization_invites')
      .dropConstraint('organization_invites_role')
      .execute();
    await db.schema
      .alterTable('organization_invites')
      .addCheckConstraint(
        'organization_invites_role',
        sql`role in ('admin', 'referee', 'broadcaster', 'viewer')`,
      )
      .execute();

    await db.schema
      .alterTable('organization_role_assignments')
      .dropConstraint('organization_role_assignments_role')
      .execute();
    await db.schema
      .alterTable('organization_role_assignments')
      .addCheckConstraint(
        'organization_role_assignments_role',
        sql`role in ('admin', 'referee', 'broadcaster', 'viewer')`,
      )
      .execute();
  },
};
