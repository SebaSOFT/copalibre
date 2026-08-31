import type { Kysely } from 'kysely';
import {
  evaluateCoreVersionCompatibility,
  type ModuleValidationFailure,
} from '@copalibre/module-distribution';
import {
  InstalledModuleRepository,
  createDatabase,
  createMigrator,
  databaseConfigFromEnv,
  type Database,
  type InstalledModule,
} from '@copalibre/persistence';

export interface UpgradeCheckReport {
  readonly moduleFailures: readonly ModuleValidationFailure[];
  readonly pendingMigrations: readonly string[];
  readonly ok: boolean;
}

/**
 * Pure combination step: no database access, so it is unit-testable
 * without a real or fake `Kysely` instance. `runUpgradeCheck` below supplies
 * its two inputs from the real database.
 */
export function evaluateUpgrade(
  targetVersion: string,
  installedModules: readonly Pick<InstalledModule, 'alias' | 'version' | 'requiresCopalibre'>[],
  pendingMigrations: readonly string[],
): UpgradeCheckReport {
  const moduleFailures: ModuleValidationFailure[] = [];
  for (const module_ of installedModules) {
    const failure = evaluateCoreVersionCompatibility(targetVersion, module_);
    if (failure) {
      moduleFailures.push({ ...failure, field: `${module_.alias}@${module_.version}` });
    }
  }
  return { moduleFailures, pendingMigrations, ok: moduleFailures.length === 0 };
}

/** Migrations not yet applied, without applying any of them. */
async function pendingMigrationNames(db: Kysely<Database>): Promise<readonly string[]> {
  const migrations = await createMigrator(db).getMigrations();
  return migrations
    .filter((migration) => migration.executedAt === undefined)
    .map((migration) => migration.name);
}

/**
 * Opens its own database connection and closes it before returning, mirroring
 * `moduleVerify`'s self-contained style in `module-commands.ts`.
 */
export async function runUpgradeCheck(
  targetVersion: string,
  environment: NodeJS.ProcessEnv,
): Promise<UpgradeCheckReport> {
  const db = createDatabase(databaseConfigFromEnv(environment));
  try {
    const [installedModules, pendingMigrations] = await Promise.all([
      new InstalledModuleRepository(db).list(),
      pendingMigrationNames(db),
    ]);
    return evaluateUpgrade(targetVersion, installedModules, pendingMigrations);
  } finally {
    await db.destroy();
  }
}
