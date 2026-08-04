import type { Kysely } from 'kysely';
// kysely 0.29 moved the migration API to its own subpath; nodenext resolution
// can see it, which the previous commonjs/node setup could not.
import {
  Migrator,
  type Migration,
  type MigrationProvider,
  type MigrationResultSet,
} from 'kysely/migration';
import type { Database } from '../schema.js';
import { initialSchema } from './0001-initial-schema.js';
import { organizationAccess } from './0002-organization-access.js';
import { liveMatchConsole } from './0003-live-match-console.js';
import { rosterTerminology } from './0004-roster-terminology.js';

/**
 * Migrations are explicit, ordered, and code-defined (no filesystem scanning),
 * so the applied set is reviewable in a pull request and identical in every
 * deployment artifact. Every migration ships a `down` — the architecture doc's
 * "migration ordering and rollback/forward-fix policy" requirement.
 */
export const MIGRATIONS: Readonly<Record<string, Migration>> = {
  '0001-initial-schema': initialSchema,
  '0002-organization-access': organizationAccess,
  '0003-live-match-console': liveMatchConsole,
  '0004-roster-terminology': rosterTerminology,
};

/** The version `apps/api`'s readiness check expects to find applied. */
export const EXPECTED_SCHEMA_VERSION = Object.keys(MIGRATIONS).at(-1) as string;

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { ...MIGRATIONS };
  }
}

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({ db, provider: new StaticMigrationProvider() });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  const result = await createMigrator(db).migrateToLatest();
  if (!result.error) {
    await recordSchemaVersion(db);
  }
  return result;
}

export async function migrateDownOneStep(db: Kysely<Database>): Promise<MigrationResultSet> {
  const result = await createMigrator(db).migrateDown();
  if (!result.error) {
    await recordSchemaVersion(db);
  }
  return result;
}

/**
 * Mirrors Kysely's internal migration table into `schema_version`, which is the
 * table `apps/api`'s readiness check queries — application code must not depend
 * on Kysely's internal bookkeeping table.
 */
async function recordSchemaVersion(db: Kysely<Database>): Promise<void> {
  const tableExists = await db.introspection
    .getTables()
    .then((tables) => tables.some((table) => table.name === 'schema_version'));
  if (!tableExists) return;

  const applied = await createMigrator(db)
    .getMigrations()
    .then((migrations) => migrations.filter((migration) => migration.executedAt !== undefined));

  await db.deleteFrom('schema_version').execute();
  if (applied.length > 0) {
    await db
      .insertInto('schema_version')
      .values(applied.map((migration) => ({ version: migration.name, applied_at: new Date() })))
      .execute();
  }
}

/** Latest applied migration name, or null on an unmigrated database. */
export async function readAppliedSchemaVersion(db: Kysely<Database>): Promise<string | null> {
  try {
    const row = await db
      .selectFrom('schema_version')
      .select('version')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.version ?? null;
  } catch {
    // Table absent: the database has never been migrated.
    return null;
  }
}

/**
 * Readiness contract consumed by `apps/api` (task 4.3): refuse to serve
 * traffic unless the database is migrated to the version this release expects.
 */
export async function isSchemaReady(db: Kysely<Database>): Promise<boolean> {
  return (await readAppliedSchemaVersion(db)) === EXPECTED_SCHEMA_VERSION;
}
