import semver from 'semver';
import {
  latestPerAlias,
  listPublishedVersions,
  sourceFor,
  type ModuleSource,
} from '@copalibre/module-distribution';
import {
  InstalledModuleRepository,
  createDatabase,
  databaseConfigFromEnv,
  type InstalledModule,
} from '@copalibre/persistence';

export interface OutdatedModuleInfo {
  readonly alias: string;
  readonly kind: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly upgradeType: string;
  readonly sourceKind: string;
}

/**
 * Pure evaluation: compares installed module versions against published registry versions.
 */
export async function evaluateOutdatedModules(
  installedModules: readonly InstalledModule[],
  versionFetcher: (
    source: ModuleSource,
    alias: string,
  ) => Promise<readonly string[]> = listPublishedVersions,
): Promise<readonly OutdatedModuleInfo[]> {
  const latestInstalled = latestPerAlias(installedModules);
  const outdated: OutdatedModuleInfo[] = [];

  for (const module_ of latestInstalled) {
    try {
      const source = sourceFor(module_);
      const versions = await versionFetcher(source, module_.alias);
      const latestPublished = [...versions].sort(semver.rcompare)[0];
      if (latestPublished && semver.gt(latestPublished, module_.version)) {
        const upgradeType = semver.diff(module_.version, latestPublished) ?? 'unknown';
        outdated.push({
          alias: module_.alias,
          kind: module_.kind,
          currentVersion: module_.version,
          latestVersion: latestPublished,
          upgradeType,
          sourceKind: module_.sourceKind,
        });
      }
    } catch {
      // Ignore network/source discovery failures for single modules during upgrade check
    }
  }

  return outdated;
}

/**
 * Formats a user-facing recommendation list of outdated modules.
 */
export function formatOutdatedModules(modules: readonly OutdatedModuleInfo[]): string {
  if (modules.length === 0) {
    return 'All installed modules are up to date.\n';
  }
  const lines = [
    'Outdated modules detected:',
    ...modules.map(
      (m) =>
        `  - ${m.alias} (${m.kind}): ${m.currentVersion} -> ${m.latestVersion} (${m.upgradeType} update)`,
    ),
    '',
    'To upgrade installed modules, run:',
    ...modules.map((m) => `  copalibre module add ${m.alias}@${m.latestVersion}`),
    '',
  ];
  return lines.join('\n');
}

/**
 * Inspects database for installed modules and checks for newer published versions in the registry.
 */
export async function runModuleUpgradeCheck(
  environment: NodeJS.ProcessEnv,
  versionFetcher?: (source: ModuleSource, alias: string) => Promise<readonly string[]>,
): Promise<readonly OutdatedModuleInfo[]> {
  const db = createDatabase(databaseConfigFromEnv(environment));
  try {
    const installed = await new InstalledModuleRepository(db).list();
    return await evaluateOutdatedModules(installed, versionFetcher);
  } finally {
    await db.destroy();
  }
}
