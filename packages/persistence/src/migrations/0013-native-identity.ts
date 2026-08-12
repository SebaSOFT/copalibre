import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from 'kysely/migration';

export const nativeIdentity: Migration = {
  async up(db: Kysely<any>): Promise<void> {
    await db.schema.alterTable('identity_principals').addColumn('password_hash', 'text').execute();

    await db.schema
      .createTable('personal_access_tokens')
      .addColumn('token_id', 'text', (col) => col.primaryKey())
      .addColumn('principal_id', 'text', (col) =>
        col.notNull().references('identity_principals.principal_id'),
      )
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('label', 'text', (col) => col.notNull())
      .addColumn('scopes', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'`))
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('revoked_at', 'timestamptz')
      .addColumn('last_used_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    await db.schema
      .createTable('auth_verification_tokens')
      .addColumn('verification_id', 'text', (col) => col.primaryKey())
      .addColumn('principal_id', 'text', (col) =>
        col.notNull().references('identity_principals.principal_id'),
      )
      .addColumn('kind', 'text', (col) => col.notNull())
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('new_email', 'text')
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('consumed_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();
  },

  async down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('auth_verification_tokens').execute();
    await db.schema.dropTable('personal_access_tokens').execute();

    await db.schema.alterTable('identity_principals').dropColumn('password_hash').execute();
  },
};
