import { execFile } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import semver from 'semver';

const execFileAsync = promisify(execFile);

/**
 * Modules live in Git, fetched by tag — never a bespoke registry (design.md's
 * "Git repositories, not a bespoke registry" decision). A tag names one
 * module's one published version as `<alias>@<version>` — the monorepo
 * layout `copalibre-modules` uses (task 5.2) needs a per-module tag scheme
 * to avoid two modules' versions colliding on one tag name.
 */

export type ModuleSourceKind = 'curated' | 'alternate';

export interface ModuleSource {
  readonly kind: ModuleSourceKind;
  readonly repositoryUrl: string;
}

/** The project's one curated module repository — never a URL an operator supplies for the default path. */
export const CURATED_MODULE_REPOSITORY: ModuleSource = {
  kind: 'curated',
  repositoryUrl: 'https://github.com/SebaSOFT/copalibre-modules.git',
};

export function alternateModuleSource(repositoryUrl: string): ModuleSource {
  return { kind: 'alternate', repositoryUrl };
}

export class ModuleFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleFetchError';
  }
}

function tagPrefix(alias: string): string {
  return `${alias}@`;
}

/**
 * Parses `git ls-remote --tags` output lines into the versions published for
 * `alias`. Pure — no I/O. A tag also appears dereferenced as `<tag>^{}`
 * (pointing at the commit an annotated tag's object wraps); both lines name
 * the same version, so the result is deduplicated.
 */
export function parseModuleTagVersions(alias: string, lsRemoteOutput: string): readonly string[] {
  const prefix = tagPrefix(alias);
  const versions = new Set<string>();
  for (const line of lsRemoteOutput.split('\n')) {
    const match = /refs\/tags\/(.+?)(\^\{\})?$/.exec(line.trim());
    const ref = match?.[1];
    if (!ref?.startsWith(prefix)) continue;
    const version = ref.slice(prefix.length);
    if (semver.valid(version)) versions.add(version);
  }
  return [...versions];
}

/** The highest published version satisfying `range` (default `*`, any published version). Pure. */
export function resolveModuleVersion(
  versions: readonly string[],
  range: string | undefined,
): string | undefined {
  return (
    semver.maxSatisfying([...versions], range ?? '*', { includePrerelease: true }) ?? undefined
  );
}

export interface FetchedModule {
  /** The checked-out module directory, containing manifest.json/artifact.json/assets/. */
  readonly directory: string;
  /** The temp checkout `directory` lives under — remove this (not just `directory`) to clean up fully. */
  readonly checkoutRoot: string;
  readonly resolvedVersion: string;
  readonly source: ModuleSource;
}

/** Every version of `alias` published to `source` — `module list --outdated` (task 4.3) uses this without checking anything out. */
export async function listPublishedVersions(
  source: ModuleSource,
  alias: string,
): Promise<readonly string[]> {
  const { stdout } = await runGit([
    'ls-remote',
    '--tags',
    source.repositoryUrl,
    `${tagPrefix(alias)}*`,
  ]);
  return parseModuleTagVersions(alias, stdout);
}

/**
 * Resolves `alias`[`@range`] against `source` and checks out that tag's
 * module directory into a fresh temp directory under `workspaceDirectory`
 * (task 3.1). Tries `disciplines/<alias>` then `profiles/<alias>` within the
 * checkout — the layout `copalibre-modules` uses (task 5.2) — since the
 * fetch itself does not yet know the module's kind.
 */
export async function fetchModule(
  source: ModuleSource,
  alias: string,
  range: string | undefined,
  workspaceDirectory: string = tmpdir(),
): Promise<FetchedModule> {
  const versions = await listPublishedVersions(source, alias);
  const resolvedVersion = resolveModuleVersion(versions, range);
  if (!resolvedVersion) {
    throw new ModuleFetchError(
      `No published version of "${alias}" in ${source.repositoryUrl} satisfies ${range ?? 'any version'}` +
        (versions.length > 0 ? ` (published: ${versions.join(', ')})` : ' (no versions published)'),
    );
  }

  const checkoutRoot = await mkdtemp(join(workspaceDirectory, 'copalibre-module-fetch-'));
  try {
    await runGit([
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--branch',
      `${alias}@${resolvedVersion}`,
      source.repositoryUrl,
      checkoutRoot,
    ]);
  } catch (error) {
    await rm(checkoutRoot, { recursive: true, force: true });
    throw new ModuleFetchError(
      `Failed to fetch ${alias}@${resolvedVersion} from ${source.repositoryUrl}: ${String(error)}`,
    );
  }

  for (const category of ['disciplines', 'profiles']) {
    const candidate = join(checkoutRoot, category, alias);
    if (await pathExists(join(candidate, 'manifest.json'))) {
      return { directory: candidate, checkoutRoot, resolvedVersion, source };
    }
  }
  await rm(checkoutRoot, { recursive: true, force: true });
  throw new ModuleFetchError(
    `Tag ${alias}@${resolvedVersion} in ${source.repositoryUrl} does not contain a disciplines/${alias} or profiles/${alias} module directory`,
  );
}

async function runGit(args: readonly string[]): Promise<{ readonly stdout: string }> {
  const result = await execFileAsync('git', [...args], { maxBuffer: 10 * 1024 * 1024 });
  return { stdout: result.stdout };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
