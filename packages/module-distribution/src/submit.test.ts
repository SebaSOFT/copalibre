import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { submitModule, type GitCommandRunner } from './submit.js';

/**
 * `submitModule` is exercised only against a fake `GitCommandRunner` — never
 * the real `gh`/`git` — so no test run of this suite ever forks the real
 * `copalibre-modules` repository or opens a real pull request.
 */
function fakeGit(pullRequestUrl: string) {
  const calls: {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd?: string;
  }[] = [];
  const runner: GitCommandRunner = {
    run: async (command, args, cwd) => {
      calls.push({ command, args: [...args], ...(cwd === undefined ? {} : { cwd }) });
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'create') {
        return { stdout: `${pullRequestUrl}\n` };
      }
      return { stdout: '' };
    },
  };
  return { runner, calls };
}

async function writeManifest(
  directory: string,
  kind: 'discipline' | 'tournament-profile',
  alias: string,
) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      kind,
      alias,
      version: '0.1.0',
      attribution: { author: 'Test', licence: 'AGPL-3.0-only' },
      requiresCopalibre: '*',
      assets: [],
    }),
  );
}

describe('submitModule', () => {
  it('forks, branches, copies the module, pushes, and opens a PR with the right shape', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-submit-test-'));
    try {
      const modulePath = join(directory, 'disciplines', 'test-sport');
      await writeManifest(modulePath, 'discipline', 'test-sport');

      const { runner, calls } = fakeGit('https://github.com/SebaSOFT/copalibre-modules/pull/1');
      const result = await submitModule({ modulePath }, runner);

      expect(result.pullRequestUrl).toBe('https://github.com/SebaSOFT/copalibre-modules/pull/1');
      expect(result.branch).toBe('add-discipline-test-sport');

      const commands = calls.map((call) => `${call.command} ${call.args[0]}`);
      expect(commands).toEqual([
        'gh repo',
        'git checkout',
        'git add',
        'git commit',
        'git push',
        'gh pr',
      ]);
      expect(calls[0]?.args).toEqual([
        'repo',
        'fork',
        'SebaSOFT/copalibre-modules',
        '--clone',
        '--remote',
        '--',
        expect.stringContaining('copalibre-module-submit-') as unknown as string,
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('respects a custom upstream repository and base branch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-submit-test-'));
    try {
      const modulePath = join(directory, 'profiles', 'test-format');
      await writeManifest(modulePath, 'tournament-profile', 'test-format');

      const { runner, calls } = fakeGit('https://example.invalid/pull/2');
      await submitModule(
        { modulePath, upstreamRepository: 'someone/fork', baseBranch: 'develop' },
        runner,
      );

      const forkCall = calls.find((call) => call.command === 'gh' && call.args[1] === 'fork');
      expect(forkCall?.args).toContain('someone/fork');
      const prCall = calls.find((call) => call.command === 'gh' && call.args[0] === 'pr');
      expect(prCall?.args).toEqual(
        expect.arrayContaining(['--repo', 'someone/fork', '--base', 'develop']),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
