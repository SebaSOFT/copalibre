import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ModuleManifest } from './manifest.js';

const execFileAsync = promisify(execFile);

const DEFAULT_UPSTREAM_REPOSITORY = 'SebaSOFT/copalibre-modules';
const DEFAULT_BASE_BRANCH = 'main';

/**
 * Runs `git`/`gh` and returns captured stdout — unlike `apps/copalibre`'s
 * `ProcessRunner` (exit code only, used by `scaffold.ts` via `git -C`),
 * `submit.ts` needs both a per-call working directory (`gh repo fork`'s
 * clone target, `gh pr create` run from inside that clone) and stdout (the
 * created pull request's URL), so it defines its own small seam here rather
 * than widening `ProcessRunner`'s contract for every other caller.
 */
export interface GitCommandRunner {
  run(command: string, args: readonly string[], cwd?: string): Promise<{ readonly stdout: string }>;
}

export const systemGitCommandRunner: GitCommandRunner = {
  async run(command, args, cwd) {
    const result = await execFileAsync(command, [...args], {
      ...(cwd === undefined ? {} : { cwd }),
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: result.stdout };
  },
};

export interface SubmitOptions {
  /** Local path to a module directory (`disciplines/<alias>` or `profiles/<alias>`), e.g. a `scaffoldModule` result's `moduleDirectory`. */
  readonly modulePath: string;
  readonly upstreamRepository?: string;
  readonly baseBranch?: string;
}

export interface SubmitResult {
  readonly pullRequestUrl: string;
  readonly branch: string;
}

/**
 * Forks `copalibre-modules`, copies the local module package onto a new
 * branch, pushes, and opens a pull request. Copies, never moves —
 * the local package stays usable for a further `module add --source` install
 * afterward.
 */
export async function submitModule(
  options: SubmitOptions,
  git: GitCommandRunner = systemGitCommandRunner,
): Promise<SubmitResult> {
  const upstream = options.upstreamRepository ?? DEFAULT_UPSTREAM_REPOSITORY;
  const base = options.baseBranch ?? DEFAULT_BASE_BRANCH;
  const manifest = JSON.parse(
    await readFile(join(options.modulePath, 'manifest.json'), 'utf8'),
  ) as ModuleManifest;
  const category = manifest.kind === 'discipline' ? 'disciplines' : 'profiles';
  const branch = `add-${manifest.kind}-${manifest.alias}`;

  const checkoutDirectory = await mkdtemp(join(tmpdir(), 'copalibre-module-submit-'));
  try {
    await git.run('gh', ['repo', 'fork', upstream, '--clone', '--remote', '--', checkoutDirectory]);
    await git.run('git', ['checkout', '-b', branch], checkoutDirectory);
    await cp(options.modulePath, join(checkoutDirectory, category, manifest.alias), {
      recursive: true,
    });
    await git.run('git', ['add', '-A'], checkoutDirectory);
    await git.run(
      'git',
      ['commit', '-m', `Add ${manifest.kind} module "${manifest.alias}"`],
      checkoutDirectory,
    );
    await git.run('git', ['push', '--set-upstream', 'origin', branch], checkoutDirectory);
    const { stdout } = await git.run(
      'gh',
      [
        'pr',
        'create',
        '--repo',
        upstream,
        '--base',
        base,
        '--head',
        branch,
        '--title',
        `Add ${manifest.kind} module "${manifest.alias}"`,
        '--body',
        `Adds the "${manifest.alias}" ${manifest.kind} module, authored with \`copalibre module scaffold\`.`,
      ],
      checkoutDirectory,
    );
    return { pullRequestUrl: stdout.trim(), branch };
  } finally {
    await rm(checkoutDirectory, { recursive: true, force: true });
  }
}
