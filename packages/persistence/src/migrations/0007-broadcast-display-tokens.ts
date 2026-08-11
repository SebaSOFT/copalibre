import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** Device-scoped display tokens for `/tv/**` surfaces, introduced by change 0031. */
export const broadcastDisplayTokens: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('display_tokens')
      .addColumn('display_token_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('tournament_id', 'uuid', (col) =>
        col.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('match_id', 'uuid', (col) => col.references('matches.match_id'))
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('label', 'text')
      .addColumn('revoked_at', 'timestamptz')
      .addColumn('last_seen_at', 'timestamptz')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('created_by', 'text', (col) => col.notNull())
      .execute();

    await db.schema
      .createIndex('display_tokens_organization_idx')
      .on('display_tokens')
      .columns(['organization_id', 'tournament_id'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('display_tokens').ifExists().execute();
  },
};
