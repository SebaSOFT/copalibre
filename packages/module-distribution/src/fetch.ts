import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
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

export type ModuleSourceKind = 'curated' | 'alternate' | 'authored';

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

/**
 * A module authored locally through the control-panel builder (openspec
 * 0164) — never fetched from anywhere, so it carries no repository URL.
 * `sourceFor()` returns this for an installed `'authored'`-kind module
 * rather than attempting to resolve one, since there is nothing to check
 * for updates against until (and unless) it is later submitted and merged
 * upstream, which installs as an ordinary `'curated'` update instead.
 */
export const AUTHORED_MODULE_SOURCE: ModuleSource = { kind: 'authored', repositoryUrl: '' };

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
export interface FetchModuleDependencies {
  readonly runGit?: (args: readonly string[]) => Promise<{ stdout: string }>;
  readonly listPublishedVersions?: (
    source: ModuleSource,
    alias: string,
  ) => Promise<readonly string[]>;
  readonly pathExists?: (path: string) => Promise<boolean>;
  readonly readManifestFile?: (path: string) => Promise<string>;
}

async function tryManifestFallback(
  source: ModuleSource,
  alias: string,
  range: string | undefined,
  workspaceDirectory: string,
  gitRunner: (args: readonly string[]) => Promise<{ stdout: string }>,
  checkPath: (path: string) => Promise<boolean>,
  readManifest: (path: string) => Promise<string>,
): Promise<FetchedModule | undefined> {
  const checkoutRoot = await mkdtemp(join(workspaceDirectory, 'copalibre-module-fallback-'));
  try {
    await gitRunner(['clone', '--quiet', '--depth', '1', source.repositoryUrl, checkoutRoot]);
    for (const category of ['disciplines', 'profiles']) {
      const candidate = join(checkoutRoot, category, alias);
      const manifestPath = join(candidate, 'manifest.json');
      if (await checkPath(manifestPath)) {
        const manifestRaw = await readManifest(manifestPath);
        const manifest = JSON.parse(manifestRaw) as { version?: string };
        const version = manifest.version;
        if (version && (!range || semver.satisfies(version, range, { includePrerelease: true }))) {
          process.stderr.write(
            `[diagnostic] Module "${alias}": Git tag was absent in ${source.repositoryUrl}; resolved version ${version} via default branch manifest verification fallback.\n`,
          );
          return { directory: candidate, checkoutRoot, resolvedVersion: version, source };
        }
      }
    }
  } catch {
    // fallback failed
  }
  await rm(checkoutRoot, { recursive: true, force: true });
  return undefined;
}

/**
 * Resolves `alias`[`@range`] against `source` and checks out that tag's
 * module directory into a fresh temp directory under `workspaceDirectory`
 * (task 3.1). Tries `disciplines/<alias>` then `profiles/<alias>` within the
 * checkout — the layout `copalibre-modules` uses (task 5.2) — since the
 * fetch itself does not yet know the module's kind.
 *
 * If an exact Git tag is missing from the repository, attempts manifest
 * verification fallback against the default branch.
 */
export async function fetchModule(
  source: ModuleSource,
  alias: string,
  range: string | undefined,
  workspaceDirectory: string = tmpdir(),
  dependencies: FetchModuleDependencies = {},
): Promise<FetchedModule> {
  const gitRunner = dependencies.runGit ?? runGit;
  const listVersions = dependencies.listPublishedVersions ?? listPublishedVersions;
  const checkPath = dependencies.pathExists ?? pathExists;
  const readManifest = dependencies.readManifestFile ?? ((p: string) => readFile(p, 'utf8'));

  const versions = await listVersions(source, alias);
  const resolvedVersion = resolveModuleVersion(versions, range);
  if (!resolvedVersion) {
    const fallback = await tryManifestFallback(
      source,
      alias,
      range,
      workspaceDirectory,
      gitRunner,
      checkPath,
      readManifest,
    );
    if (fallback) return fallback;

    throw new ModuleFetchError(
      `No published version of "${alias}" in ${source.repositoryUrl} satisfies ${range ?? 'any version'}` +
        (versions.length > 0 ? ` (published: ${versions.join(', ')})` : ' (no versions published)'),
    );
  }

  const checkoutRoot = await mkdtemp(join(workspaceDirectory, 'copalibre-module-fetch-'));
  try {
    await gitRunner([
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
    // Remote git tag clone failed: try manifest fallback on default branch
    const fallback = await tryManifestFallback(
      source,
      alias,
      range,
      workspaceDirectory,
      gitRunner,
      checkPath,
      readManifest,
    );
    if (fallback) return fallback;

    throw new ModuleFetchError(
      `Failed to fetch ${alias}@${resolvedVersion} from ${source.repositoryUrl}: ${String(error)}`,
    );
  }

  for (const category of ['disciplines', 'profiles']) {
    const candidate = join(checkoutRoot, category, alias);
    if (await checkPath(join(candidate, 'manifest.json'))) {
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
