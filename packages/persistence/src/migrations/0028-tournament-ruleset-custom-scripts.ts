import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Required tournament scripts plus their durable, idempotent effect ledger.
 */
export const tournamentRulesetCustomScripts: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('tournament_rulesets')
      .addColumn('custom_scripts', 'jsonb', (column) => column.notNull().defaultTo(sql`'[]'`))
      .execute();

    await db.schema
      .createTable('declared_effects')
      .addColumn('identity_key', 'text', (column) => column.primaryKey())
      .addColumn('organization_id', 'uuid', (column) =>
        column.notNull().references('organizations.organization_id'),
      )
      .addColumn('match_id', 'uuid', (column) => column.notNull().references('matches.match_id'))
      .addColumn('cause_event_id', 'uuid', (column) =>
        column.notNull().references('match_events.event_id'),
      )
      .addColumn('hook', 'text', (column) => column.notNull())
      .addColumn('script_id', 'text', (column) => column.notNull())
      .addColumn('script_version', 'integer', (column) => column.notNull())
      .addColumn('rule_id', 'text', (column) => column.notNull())
      .addColumn('action_id', 'text', (column) => column.notNull())
      .addColumn('kind', 'text', (column) => column.notNull())
      .addColumn('payload', 'jsonb', (column) => column.notNull())
      .addColumn('created_at', 'timestamptz', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('declared_effects_match_cause_idx')
      .on('declared_effects')
      .columns(['match_id', 'cause_event_id'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('declared_effects').execute();
    await db.schema.alterTable('tournament_rulesets').dropColumn('custom_scripts').execute();
  },
};
