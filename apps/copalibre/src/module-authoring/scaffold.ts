import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Attribution,
  DisciplineDescriptorDocument,
  TournamentProfileDocument,
} from '@copalibre/domain';
import { loadDefaultModuleCatalogue } from '@copalibre/module-catalogue';
import type { ModuleKind, ModuleManifest } from '@copalibre/module-distribution';
import type { ProcessRunner } from '../process-runner.js';

const DISCIPLINE_TEMPLATE_ALIAS = 'football';
const PROFILE_TEMPLATE_ALIAS = 'copa-eliminacion';
const SCAFFOLD_VERSION = '0.1.0';

export interface ScaffoldOptions {
  readonly kind: ModuleKind;
  readonly alias: string;
  readonly name?: string;
  readonly author: string;
  readonly licence: string;
  readonly sourceUrl?: string;
  readonly outputDirectory: string;
}

export interface ScaffoldResult {
  readonly repositoryDirectory: string;
  readonly moduleDirectory: string;
  readonly tag: string;
}

function categoryFor(kind: ModuleKind): 'disciplines' | 'profiles' {
  return kind === 'discipline' ? 'disciplines' : 'profiles';
}

function attributionFor(options: ScaffoldOptions): Attribution {
  return {
    author: options.author,
    licence: options.licence,
    ...(options.sourceUrl === undefined ? {} : { sourceUrl: options.sourceUrl }),
  };
}

async function loadTemplate(
  kind: ModuleKind,
): Promise<DisciplineDescriptorDocument | TournamentProfileDocument> {
  const catalogue = await loadDefaultModuleCatalogue();
  const templateAlias = kind === 'discipline' ? DISCIPLINE_TEMPLATE_ALIAS : PROFILE_TEMPLATE_ALIAS;
  const pool = kind === 'discipline' ? catalogue.disciplines : catalogue.profiles;
  const template = pool.find((document) => document.alias === templateAlias);
  if (!template) {
    throw new Error(`Catalogue template "${templateAlias}" for kind "${kind}" was not found`);
  }
  return template;
}

function readmeFor(options: ScaffoldOptions, category: 'disciplines' | 'profiles'): string {
  return `# ${options.name ?? options.alias}

Scaffolded by \`copalibre module scaffold ${options.kind} ${options.alias}\` from the release's own
\`${category === 'disciplines' ? DISCIPLINE_TEMPLATE_ALIAS : PROFILE_TEMPLATE_ALIAS}\` catalogue
document — a real, already-valid example to edit from, not a blank schema. See
[\`docs/MODULES.md\`](https://github.com/SebaSOFT/copalibre/blob/develop/docs/MODULES.md) for what
each field in \`${category}/${options.alias}/artifact.json\` means.

## Next steps

1. Edit \`${category}/${options.alias}/artifact.json\` and \`${category}/${options.alias}/manifest.json\`
   to describe the real ${options.kind === 'discipline' ? 'sport' : 'tournament format'}.
2. \`copalibre module validate-local ${category}/${options.alias}\` — checks it without installing
   anything.
3. Allow-list this repository and install it into a local dev database to try it for real:
   \`COPALIBRE_MODULE_SOURCE_ALLOWLIST=file://$(pwd) copalibre module add ${options.alias} --source file://$(pwd)\`
4. \`copalibre module submit ${category}/${options.alias}\` — forks \`copalibre-modules\`, opens a
   pull request.
`;
}

/**
 * Produces a tagged local Git repository in exactly the layout `fetchModule`
 * (module-distribution) already expects, so installing it locally needs no
 * new code path — `module add --source file://...` (0036) installs it
 * unmodified (0049 design).
 */
export async function scaffoldModule(
  options: ScaffoldOptions,
  processes: ProcessRunner,
): Promise<ScaffoldResult> {
  const template = await loadTemplate(options.kind);
  const attribution = attributionFor(options);
  const artifact = {
    ...template,
    alias: options.alias,
    version: SCAFFOLD_VERSION,
    name: options.name ?? options.alias,
    attribution,
    // The shipped discipline fixtures declare `notificationRuleCapabilities:
    // ["threshold-count"]`, but nothing in @copalibre/rules currently calls
    // `registerNotificationCapability` for it — a pre-existing gap, not
    // something this scaffold should reproduce (0049 design). An empty
    // array is valid, structurally honest content: "this discipline
    // declares no notification-rule capabilities yet."
    ...(options.kind === 'discipline' ? { notificationRuleCapabilities: [] } : {}),
  };
  const manifest: ModuleManifest = {
    kind: options.kind,
    alias: options.alias,
    version: SCAFFOLD_VERSION,
    attribution,
    requiresCopalibre: '*',
    assets: [],
  };

  const category = categoryFor(options.kind);
  const repositoryDirectory = options.outputDirectory;
  const moduleDirectory = join(repositoryDirectory, category, options.alias);
  await mkdir(moduleDirectory, { recursive: true });
  await writeFile(join(moduleDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(moduleDirectory, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  await writeFile(join(repositoryDirectory, 'README.md'), readmeFor(options, category));

  const tag = `${options.alias}@${SCAFFOLD_VERSION}`;
  await runGit(processes, repositoryDirectory, ['init', '--quiet']);
  await runGit(processes, repositoryDirectory, ['add', '-A']);
  await runGit(processes, repositoryDirectory, [
    // Local, ephemeral identity (`-c`, not `--global`): the scaffold must
    // commit on any host, including one with no git identity configured at
    // all (a fresh CI runner, a minimal container) — never rely on ambient
    // global git config existing.
    '-c',
    'user.name=CopaLibre Module Scaffold',
    '-c',
    'user.email=scaffold@copalibre.invalid',
    'commit',
    '--quiet',
    '-m',
    `Scaffold ${options.kind} module "${options.alias}"`,
  ]);
  await runGit(processes, repositoryDirectory, ['tag', tag]);

  return { repositoryDirectory, moduleDirectory, tag };
}

async function runGit(
  processes: ProcessRunner,
  cwd: string,
  args: readonly string[],
): Promise<void> {
  const result = await processes.run('git', ['-C', cwd, ...args]);
  if (result !== 0) throw new Error(`git ${args.join(' ')} failed with exit code ${result}`);
}
