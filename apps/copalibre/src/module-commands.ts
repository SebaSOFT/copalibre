import { rm } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import semver from 'semver';
import {
  ModuleAliasConflictError,
  ModuleFetchError,
  ModuleValidationError,
  UnsatisfiedModuleCapabilitiesError,
  allowListedSources,
  documentFor,
  fetchModule,
  importValidatedModule,
  latestPerAlias,
  listPublishedVersions,
  resolveSource,
  runningCopalibreVersion,
  sourceFor,
  validateModulePackageOrThrow,
  verifyInstalledModule,
  type ModuleSource,
} from '@copalibre/module-distribution';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import {
  InstalledModuleRepository,
  SYSTEM_ORGANIZATION,
  TournamentRepository,
  createDatabase,
  databaseConfigFromEnv,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { readCredential } from './credentials.js';
import {
  installModuleOverHttp,
  listModulesOverHttp,
  removeModuleOverHttp,
  verifyModulesOverHttp,
} from './module-commands-http.js';

export { allowListedSources, resolveSource, runningCopalibreVersion };

function openDatabase(environment: NodeJS.ProcessEnv): Kysely<Database> {
  return createDatabase(databaseConfigFromEnv(environment));
}

function openStorage(environment: NodeJS.ProcessEnv) {
  return createObjectStorageAdapter(objectStorageConfigFromEnv(environment));
}

function parseAliasRange(spec: string): {
  readonly alias: string;
  readonly range: string | undefined;
} {
  const at = spec.indexOf('@');
  if (at === -1) return { alias: spec, range: undefined };
  return { alias: spec.slice(0, at), range: spec.slice(at + 1) };
}

/**
 * The single place every `module` subcommand decides HTTP vs.
 * direct-database (0085's dual-path, auto-detected exactly like
 * `StatisticsRebuildCommand`'s): a stored credential in the current
 * directory's `.copalibre/credentials.json` (`login`'s write target) means
 * HTTP; its absence means an existing checkout/`DATABASE_URL` workflow never
 * has to opt into anything for this change to reach it.
 */
async function credentialFor(): Promise<
  { readonly apiUrl: string; readonly token: string } | undefined
> {
  const stored = await readCredential(process.cwd());
  return stored ? { apiUrl: stored.apiUrl, token: stored.token } : undefined;
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
  const credential = await credentialFor();

  // Resolved (and, for the direct path, validated) before the try/catch
  // below on purpose: an invalid `--source` is a usage error, not a
  // fetch/import failure — it propagates uncaught to the top-level command
  // handler, exactly like it did before the dual-path split
  // (module-commands.integration.test.ts's allow-list refusal case depends
  // on this). The HTTP path never resolves `--source` against the CLI's own
  // environment at all — the allowlist that matters there is the server's,
  // checked server-side by the same `resolveSource` call.
  const source = credential ? undefined : resolveSource(parsed.values.source, environment);

  try {
    const report = credential
      ? await installModuleOverHttp(credential.apiUrl, credential.token, {
          alias,
          ...(range === undefined ? {} : { range }),
          ...(parsed.values.source === undefined ? {} : { source: parsed.values.source }),
          allowUnsatisfiedCapabilities: parsed.values['allow-unsatisfied-capabilities'],
        })
      : await moduleAddDirect(
          alias,
          range,
          source as ModuleSource,
          environment,
          parsed.values['allow-unsatisfied-capabilities'],
        );
    process.stdout.write(`Installed ${report.kind} "${report.alias}"@${report.version}\n`);
    if (report.unsatisfiedRequiredCapabilities.length > 0) {
      process.stdout.write(
        `  Unsatisfied required capabilities (override given): ${report.unsatisfiedRequiredCapabilities.join(', ')}\n`,
      );
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${describeModuleError(error)}\n`);
    return 1;
  }
}

async function moduleAddDirect(
  alias: string,
  range: string | undefined,
  source: ModuleSource,
  environment: NodeJS.ProcessEnv,
  allowUnsatisfiedCapabilities: boolean,
): Promise<{
  readonly kind: string;
  readonly alias: string;
  readonly version: string;
  readonly unsatisfiedRequiredCapabilities: readonly string[];
}> {
  const db = openDatabase(environment);
  try {
    const fetched = await fetchModule(source, alias, range);
    try {
      const validated = await validateModulePackageOrThrow(fetched.directory, {
        runningCopalibreVersion: runningCopalibreVersion(environment),
      });
      return await importValidatedModule(
        db,
        openStorage(environment),
        fetched.directory,
        validated,
        {
          source,
          actor: environment.USER ?? 'copalibre-cli',
          overrideUnsatisfiedCapabilities: allowUnsatisfiedCapabilities,
        },
      );
    } finally {
      await rm(fetched.checkoutRoot, { recursive: true, force: true });
    }
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

  const credential = await credentialFor();
  if (credential) {
    const entries = await listModulesOverHttp(
      credential.apiUrl,
      credential.token,
      parsed.values.outdated,
    );
    if (!parsed.values.outdated) {
      for (const entry of entries as readonly {
        readonly alias: string;
        readonly version: string;
        readonly kind: string;
        readonly sourceKind: string;
        readonly attributionAuthor: string;
      }[]) {
        process.stdout.write(
          `${entry.alias}@${entry.version}\t${entry.kind}\tsource=${entry.sourceKind}\t${entry.attributionAuthor}\n`,
        );
      }
      return 0;
    }
    for (const entry of entries as readonly {
      readonly alias: string;
      readonly currentVersion: string;
      readonly latestVersion: string;
      readonly upgrade: string;
    }[]) {
      process.stdout.write(
        `${entry.alias}: ${entry.currentVersion} -> ${entry.latestVersion} (${entry.upgrade})\n`,
      );
    }
    return 0;
  }

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

/** `copalibre module remove <alias>` (task 4.5). */
export async function moduleRemove(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const alias = arguments_[0];
  if (!alias) throw new Error('Usage: copalibre module remove <alias>');

  const credential = await credentialFor();
  if (credential) {
    try {
      const report = await removeModuleOverHttp(credential.apiUrl, credential.token, alias);
      process.stdout.write(`Removed "${report.alias}" (${report.removedCount} version(s))\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

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
      await Promise.all(assets.map((asset) => storage.delete({ key: asset.storageKey })));
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
  const credential = await credentialFor();
  if (credential) {
    const results = await verifyModulesOverHttp(credential.apiUrl, credential.token);
    let ok = true;
    for (const result of results) {
      if (result.ok) {
        process.stdout.write(`PASS ${result.alias}@${result.version}\n`);
        continue;
      }
      ok = false;
      process.stdout.write(`FAIL ${result.alias}@${result.version}\n`);
      for (const failure of result.failures) {
        process.stdout.write(`  [${failure.stage}] ${failure.message}\n`);
      }
    }
    return ok ? 0 : 1;
  }

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

export function describeModuleError(error: unknown): string {
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
