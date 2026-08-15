import semver from 'semver';
import type { DisciplineDescriptorDocument, TournamentProfileDocument } from '@copalibre/domain';
import {
  TournamentProfileRepository,
  TournamentRepository,
  type Database,
  type InstalledModule,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { CURATED_MODULE_REPOSITORY, alternateModuleSource, type ModuleSource } from './fetch.js';

/**
 * Shared between `apps/copalibre`'s direct-database CLI path and `apps/api`'s
 * admin HTTP surface — each process reads its own environment's
 * `COPALIBRE_VERSION`/`COPALIBRE_MODULE_SOURCE_ALLOWLIST`, so this cannot
 * live in either app without the other duplicating it.
 */
export function runningCopalibreVersion(environment: NodeJS.ProcessEnv): string {
  return environment.COPALIBRE_VERSION ?? '0.0.0';
}

/**
 * Alternate sources permitted via `--source`/a request body `source` field:
 * a per-invocation value alone is not enough — an operator must also have
 * allow-listed it, so a typo'd or malicious source can never silently reach
 * a real fetch. The same gate for both the CLI's direct-database path and
 * the HTTP admin path — a security gate, never duplicated.
 */
export function allowListedSources(environment: NodeJS.ProcessEnv): readonly string[] {
  return (environment.COPALIBRE_MODULE_SOURCE_ALLOWLIST ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

export function resolveSource(
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

export function sourceFor(
  installed: Pick<InstalledModule, 'sourceKind' | 'sourceRepositoryUrl'>,
): ModuleSource {
  return installed.sourceKind === 'curated'
    ? CURATED_MODULE_REPOSITORY
    : alternateModuleSource(installed.sourceRepositoryUrl);
}

export function latestPerAlias(modules: readonly InstalledModule[]): readonly InstalledModule[] {
  const byAlias = new Map<string, InstalledModule>();
  for (const module_ of modules) {
    const current = byAlias.get(module_.alias);
    if (!current || semver.gt(module_.version, current.version))
      byAlias.set(module_.alias, module_);
  }
  return [...byAlias.values()];
}

export async function documentFor(
  db: Kysely<Database>,
  module_: InstalledModule,
): Promise<DisciplineDescriptorDocument | TournamentProfileDocument | undefined> {
  if (module_.kind === 'discipline') {
    return new TournamentRepository(db).findDescriptor(module_.documentId, module_.version);
  }
  return new TournamentProfileRepository(db).find(module_.documentId, module_.version);
}
