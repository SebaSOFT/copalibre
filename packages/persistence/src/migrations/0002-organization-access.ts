import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Organization membership and opaque invitations introduced by change 0026. */
export const organizationAccess: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('identity_principals')
      .addColumn('principal_id', 'uuid', (col) => col.primaryKey())
      .addColumn('email', 'text', (col) => col.notNull().unique())
      .addColumn('oidc_subject_id', 'text', (col) => col.unique())
      .addColumn('name', 'text')
      .addColumn('picture', 'text')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('updated_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createTable('organization_role_assignments')
      .addColumn('assignment_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('principal_id', 'uuid', (col) =>
        col.notNull().references('identity_principals.principal_id'),
      )
      .addColumn('email', 'text', (col) => col.notNull())
      .addColumn('role', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('updated_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('deleted_at', 'timestamptz')
      .addUniqueConstraint('organization_role_assignments_org_subject_unique', [
        'organization_id',
        'principal_id',
      ])
      .addCheckConstraint(
        'organization_role_assignments_role',
        sql`role in ('admin', 'referee', 'broadcaster', 'viewer')`,
      )
      .addCheckConstraint(
        'organization_role_assignments_status',
        sql`status in ('active', 'inactive')`,
      )
      .execute();

    await db.schema
      .createIndex('organization_role_assignments_principal_idx')
      .on('organization_role_assignments')
      .columns(['organization_id', 'principal_id'])
      .execute();

    await db.schema
      .createTable('organization_invites')
      .addColumn('invitation_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('recipient_email', 'text', (col) => col.notNull())
      .addColumn('role', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('accepted_at', 'timestamptz')
      .addColumn('accepted_principal_id', 'uuid', (col) =>
        col.references('identity_principals.principal_id'),
      )
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addCheckConstraint(
        'organization_invites_role',
        sql`role in ('admin', 'referee', 'broadcaster', 'viewer')`,
      )
      .addCheckConstraint('organization_invites_status', sql`status in ('active', 'inactive')`)
      .execute();

    await db.schema
      .createTable('participant_identity_links')
      .addColumn('principal_id', 'uuid', (col) =>
        col.notNull().references('identity_principals.principal_id'),
      )
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('person_id', 'uuid', (col) => col.notNull().references('persons.person_id'))
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('created_by', 'text', (col) => col.notNull())
      .addPrimaryKeyConstraint('participant_identity_links_pk', ['principal_id', 'organization_id'])
      .addUniqueConstraint('participant_identity_links_person_unique', [
        'organization_id',
        'person_id',
      ])
      .execute();

    await db.schema
      .createIndex('organization_invites_pending_recipient_idx')
      .on('organization_invites')
      .columns(['organization_id', 'recipient_email', 'expires_at'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('participant_identity_links').ifExists().execute();
    await db.schema.dropTable('organization_invites').ifExists().execute();
    await db.schema.dropTable('organization_role_assignments').ifExists().execute();
    await db.schema.dropTable('identity_principals').ifExists().execute();
  },
};
