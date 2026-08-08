import { rm } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import semver from 'semver';
import type { DisciplineDescriptorDocument, TournamentProfileDocument } from '@copalibre/domain';
import {
  CURATED_MODULE_REPOSITORY,
  ModuleAliasConflictError,
  ModuleFetchError,
  ModuleValidationError,
  UnsatisfiedModuleCapabilitiesError,
  alternateModuleSource,
  fetchModule,
  importValidatedModule,
  listPublishedVersions,
  validateModulePackageOrThrow,
  verifyInstalledModule,
  type ModuleSource,
} from '@copalibre/module-distribution';
import {
  InstalledModuleRepository,
  SYSTEM_ORGANIZATION,
  TournamentProfileRepository,
  TournamentRepository,
  createDatabase,
  createObjectStorageAdapter,
  databaseConfigFromEnv,
  objectStorageConfigFromEnv,
  withTransaction,
  type Database,
  type InstalledModule,
  type ObjectStorageAdapter,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';

/** `apps/*`'s own `role.ts` files read the same variable the same way. */
function runningCopalibreVersion(environment: NodeJS.ProcessEnv): string {
  return environment.COPALIBRE_VERSION ?? '0.0.0';
}

/**
 * Alternate sources permitted via `--source` (task 4.2): a per-invocation
 * flag alone is not enough — an operator must also have allow-listed it, so
 * a typo'd or malicious `--source` cannot silently reach a real fetch.
 */
function allowListedSources(environment: NodeJS.ProcessEnv): readonly string[] {
  return (environment.COPALIBRE_MODULE_SOURCE_ALLOWLIST ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

function resolveSource(
  sourceFlag: string | undefined,
  environment: NodeJS.ProcessEnv,
): ModuleSource {
  if (!sourceFlag) return CURATED_MODULE_REPOSITORY;
  if (!allowListedSources(environment).includes(sourceFlag)) {
    throw new Error(
      `Source "${sourceFlag}" is not the curated repository and is not allow-listed via ` +
        'COPALIBRE_MODULE_SOURCE_ALLOWLIST — an alternate source must be opted into explicitly',
    );
  }
  return alternateModuleSource(sourceFlag);
}

function sourceFor(
  installed: Pick<InstalledModule, 'sourceKind' | 'sourceRepositoryUrl'>,
): ModuleSource {
  return installed.sourceKind === 'curated'
    ? CURATED_MODULE_REPOSITORY
    : alternateModuleSource(installed.sourceRepositoryUrl);
}

function openDatabase(environment: NodeJS.ProcessEnv): Kysely<Database> {
  return createDatabase(databaseConfigFromEnv(environment));
}

function openStorage(environment: NodeJS.ProcessEnv): ObjectStorageAdapter | undefined {
  const config = objectStorageConfigFromEnv(environment);
  return config ? createObjectStorageAdapter(config) : undefined;
}

function parseAliasRange(spec: string): {
  readonly alias: string;
  readonly range: string | undefined;
} {
  const at = spec.indexOf('@');
  if (at === -1) return { alias: spec, range: undefined };
  return { alias: spec.slice(0, at), range: spec.slice(at + 1) };
}

/** `copalibre module add <alias>[@range]` (task 4.1). */
export async function moduleAdd(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      source: { type: 'string' },
      'allow-unsatisfied-capabilities': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: true,
  });
  const spec = parsed.positionals[0];
  if (!spec) throw new Error('Usage: copalibre module add <alias>[@range] [--source <url>]');
  const { alias, range } = parseAliasRange(spec);
  const source = resolveSource(parsed.values.source, environment);

  const db = openDatabase(environment);
  try {
    const fetched = await fetchModule(source, alias, range);
    try {
      const validated = await validateModulePackageOrThrow(fetched.directory, {
        runningCopalibreVersion: runningCopalibreVersion(environment),
      });
      const report = await importValidatedModule(
        db,
        openStorage(environment),
        fetched.directory,
        validated,
        {
          source,
          actor: environment.USER ?? 'copalibre-cli',
          overrideUnsatisfiedCapabilities: parsed.values['allow-unsatisfied-capabilities'],
        },
      );
      process.stdout.write(
        `Installed ${report.kind} "${report.alias}"@${report.version} from ${source.repositoryUrl}\n`,
      );
      if (report.unsatisfiedRequiredCapabilities.length > 0) {
        process.stdout.write(
          `  Unsatisfied required capabilities (override given): ${report.unsatisfiedRequiredCapabilities.join(', ')}\n`,
        );
      }
    } finally {
      await rm(fetched.checkoutRoot, { recursive: true, force: true });
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${describeModuleError(error)}\n`);
    return 1;
  } finally {
    await db.destroy();
  }
}

/** `copalibre module list [--outdated]` (tasks 4.3-4.4). */
export async function moduleList(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const parsed = parseArgs({
    args: [...arguments_],
    options: { outdated: { type: 'boolean', default: false } },
    strict: true,
  });

  const db = openDatabase(environment);
  try {
    const modules = await new InstalledModuleRepository(db).list();
    if (!parsed.values.outdated) {
      for (const module_ of modules) {
        process.stdout.write(
          `${module_.alias}@${module_.version}\t${module_.kind}\tsource=${module_.sourceKind}\t${module_.attribution.author}\n`,
        );
      }
      return 0;
    }

    const latestInstalledByAlias = latestPerAlias(modules);
    for (const module_ of latestInstalledByAlias) {
      const versions = await listPublishedVersions(sourceFor(module_), module_.alias);
      const latestPublished = [...versions].sort(semver.rcompare)[0];
      if (!latestPublished || !semver.gt(latestPublished, module_.version)) continue;
      const upgrade = semver.diff(module_.version, latestPublished) ?? 'unknown';
      process.stdout.write(
        `${module_.alias}: ${module_.version} -> ${latestPublished} (${upgrade})\n`,
      );
    }
    return 0;
  } finally {
    await db.destroy();
  }
}

function latestPerAlias(modules: readonly InstalledModule[]): readonly InstalledModule[] {
  const byAlias = new Map<string, InstalledModule>();
  for (const module_ of modules) {
    const current = byAlias.get(module_.alias);
    if (!current || semver.gt(module_.version, current.version))
      byAlias.set(module_.alias, module_);
  }
  return [...byAlias.values()];
}

/** `copalibre module remove <alias>` (task 4.5). */
export async function moduleRemove(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const alias = arguments_[0];
  if (!alias) throw new Error('Usage: copalibre module remove <alias>');

  const db = openDatabase(environment);
  const storage = openStorage(environment);
  try {
    const modules = new InstalledModuleRepository(db);
    const tournaments = new TournamentRepository(db);
    const installed = await modules.findByAlias(alias);
    if (installed.length === 0) {
      process.stderr.write(`No installed module named "${alias}"\n`);
      return 1;
    }

    const referencing = new Set<string>();
    for (const module_ of installed) {
      const aliases =
        module_.kind === 'discipline'
          ? await tournaments.findStartedTournamentAliasesReferencingDescriptor(
              module_.documentId,
              module_.version,
            )
          : await tournaments.findStartedTournamentAliasesReferencingProfile(
              module_.documentId,
              module_.version,
            );
      for (const tournamentAlias of aliases) referencing.add(tournamentAlias);
    }
    if (referencing.size > 0) {
      process.stderr.write(
        `Cannot remove "${alias}": referenced by started tournament(s): ${[...referencing].join(', ')}\n`,
      );
      return 1;
    }

    const actor = environment.USER ?? 'copalibre-cli';
    for (const module_ of installed) {
      const assets = await modules.findAssetsByModuleId(module_.moduleId);
      await Promise.all(
        assets.map((asset) =>
          storage?.delete({ bucket: asset.storageBucket, key: asset.storageKey }),
        ),
      );
      await withTransaction(db, (uow) =>
        modules.remove(uow, module_.moduleId, {
          module: module_,
          organizationId: SYSTEM_ORGANIZATION,
          actor,
          authorizationContext: 'system:module.remove',
        }),
      );
    }
    process.stdout.write(`Removed "${alias}" (${installed.length} version(s))\n`);
    return 0;
  } finally {
    await db.destroy();
  }
}

/** `copalibre module verify` (task 4.6). */
export async function moduleVerify(
  _arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const db = openDatabase(environment);
  const storage = openStorage(environment);
  try {
    const modules = new InstalledModuleRepository(db);
    const installed = await modules.list();
    let ok = true;
    for (const module_ of installed) {
      const document = await documentFor(db, module_);
      if (!document) {
        process.stdout.write(
          `FAIL ${module_.alias}@${module_.version}: installed document is missing\n`,
        );
        ok = false;
        continue;
      }
      const assets = await modules.findAssetsByModuleId(module_.moduleId);
      const failures = await verifyInstalledModule(
        storage,
        runningCopalibreVersion(environment),
        module_,
        document,
        assets,
      );
      if (failures.length === 0) {
        process.stdout.write(`PASS ${module_.alias}@${module_.version}\n`);
      } else {
        ok = false;
        process.stdout.write(`FAIL ${module_.alias}@${module_.version}\n`);
        for (const failure of failures) {
          process.stdout.write(`  [${failure.stage}] ${failure.message}\n`);
        }
      }
    }
    return ok ? 0 : 1;
  } finally {
    await db.destroy();
  }
}

async function documentFor(
  db: Kysely<Database>,
  module_: InstalledModule,
): Promise<DisciplineDescriptorDocument | TournamentProfileDocument | undefined> {
  if (module_.kind === 'discipline') {
    return new TournamentRepository(db).findDescriptor(module_.documentId, module_.version);
  }
  return new TournamentProfileRepository(db).find(module_.documentId, module_.version);
}

function describeModuleError(error: unknown): string {
  if (error instanceof ModuleValidationError) {
    return `Validation failed:\n${error.failures.map((failure) => `  [${failure.stage}] ${failure.message}`).join('\n')}`;
  }
  if (error instanceof ModuleAliasConflictError) return error.message;
  if (error instanceof UnsatisfiedModuleCapabilitiesError) {
    return `${error.message}\nRe-run with --allow-unsatisfied-capabilities to install anyway.`;
  }
  if (error instanceof ModuleFetchError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
