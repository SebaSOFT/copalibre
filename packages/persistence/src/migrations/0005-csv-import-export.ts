import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { suggestAvailableAlias } from '@copalibre/domain';
import type { Database } from '../schema.js';

/** Durable worker-owned preview state for reviewed CSV participant imports. */
export const csvImportExport: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('teams').addColumn('alias', 'text').execute();
    await backfillParticipantAliases(db);
    await db.schema
      .createIndex('persons_organization_alias_unique')
      .on('persons')
      .columns(['organization_id', 'alias'])
      .unique()
      .execute();
    await db.schema
      .createIndex('teams_organization_alias_unique')
      .on('teams')
      .columns(['organization_id', 'alias'])
      .unique()
      .execute();

    await db.schema
      .createTable('csv_import_sessions')
      .addColumn('import_id', 'uuid', (column) => column.primaryKey())
      .addColumn('organization_id', 'uuid', (column) =>
        column.notNull().references('organizations.organization_id'),
      )
      .addColumn('tournament_id', 'uuid', (column) =>
        column.notNull().references('tournaments.tournament_id'),
      )
      .addColumn('target_type', 'text', (column) => column.notNull())
      .addColumn('source_csv', 'text', (column) => column.notNull())
      .addColumn('source_hash', 'text', (column) => column.notNull())
      .addColumn('status', 'text', (column) => column.notNull())
      .addColumn('preview', 'jsonb')
      .addColumn('created_by', 'text', (column) => column.notNull())
      .addColumn('created_at', 'timestamptz', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('updated_at', 'timestamptz', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('reviewed_at', 'timestamptz')
      .addColumn('committed_at', 'timestamptz')
      .execute();

    await db.schema
      .createIndex('csv_import_sessions_tournament_created_idx')
      .on('csv_import_sessions')
      .columns(['tournament_id', 'created_at'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('csv_import_sessions').ifExists().execute();
    await db.schema.dropIndex('teams_organization_alias_unique').ifExists().execute();
    await db.schema.dropIndex('persons_organization_alias_unique').ifExists().execute();
    await db.schema.alterTable('teams').dropColumn('alias').execute();
  },
};

async function backfillParticipantAliases(db: Kysely<unknown>): Promise<void> {
  const typedDb = db as unknown as Kysely<Database>;
  const persons = await typedDb
    .selectFrom('persons')
    .select(['person_id', 'organization_id', 'alias', 'display_name'])
    .orderBy('organization_id')
    .orderBy('person_id')
    .execute();
  const teams = await typedDb
    .selectFrom('teams')
    .select(['team_id', 'organization_id', 'alias', 'name'])
    .orderBy('organization_id')
    .orderBy('team_id')
    .execute();

  const usedByOrganization = new Map<string, string[]>();
  for (const row of [...persons, ...teams]) {
    if (row.alias !== null) {
      usedByOrganization.set(row.organization_id, [
        ...(usedByOrganization.get(row.organization_id) ?? []),
        row.alias,
      ]);
    }
  }

  for (const person of persons) {
    if (person.alias !== null) continue;
    const alias = nextAlias(
      person.display_name,
      person.organization_id,
      'participant',
      usedByOrganization,
    );
    await typedDb
      .updateTable('persons')
      .set({ alias })
      .where('person_id', '=', person.person_id)
      .execute();
  }

  for (const team of teams) {
    if (team.alias !== null) continue;
    const alias = nextAlias(team.name, team.organization_id, 'team', usedByOrganization);
    await typedDb.updateTable('teams').set({ alias }).where('team_id', '=', team.team_id).execute();
  }
}

function nextAlias(
  name: string,
  organizationId: string,
  fallbackPrefix: string,
  usedByOrganization: Map<string, string[]>,
): string {
  const used = usedByOrganization.get(organizationId) ?? [];
  const alias = suggestAvailableAlias(name, used) ?? fallbackAlias(fallbackPrefix, used);
  usedByOrganization.set(organizationId, [...used, alias]);
  return alias;
}

function fallbackAlias(prefix: string, used: readonly string[]): string {
  let ordinal = 1;
  while (used.includes(`${prefix}-${ordinal}`)) ordinal += 1;
  return `${prefix}-${ordinal}`;
}
