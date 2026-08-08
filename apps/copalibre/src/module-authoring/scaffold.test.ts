import { jest } from '@jest/globals';
import { validateModulePackage } from '@copalibre/module-distribution';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { scaffoldModule } from './scaffold.js';
import type { ProcessRunner } from '../process-runner.js';

const execFileAsync = promisify(execFile);

/** Runs real `git` for the scaffold's own commit/tag steps, matching `-C <cwd>`. */
const realGitProcesses: ProcessRunner = {
  run: async (command, arguments_) => {
    await execFileAsync(command, [...arguments_]);
    return 0;
  },
};

describe('scaffoldModule (0049)', () => {
  it.each(['discipline', 'tournament-profile'] as const)(
    'produces a %s package that passes validateModulePackage unmodified',
    async (kind) => {
      const directory = await mkdtemp(join(tmpdir(), 'copalibre-scaffold-test-'));
      try {
        const alias = kind === 'discipline' ? 'test-sport' : 'test-format';
        const result = await scaffoldModule(
          {
            kind,
            alias,
            author: 'Test Author',
            licence: 'AGPL-3.0-only',
            outputDirectory: join(directory, alias),
          },
          realGitProcesses,
        );

        expect(result.tag).toBe(`${alias}@0.1.0`);
        const validation = await validateModulePackage(result.moduleDirectory, {
          runningCopalibreVersion: '1.0.0',
        });
        expect(validation.ok).toBe(true);

        const readme = await readFile(join(result.repositoryDirectory, 'README.md'), 'utf8');
        expect(readme).toContain(alias);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    15000,
  );

  it('fails when the git commands fail', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-scaffold-test-'));
    try {
      const run = jest.fn<ProcessRunner['run']>(async () => 1);
      await expect(
        scaffoldModule(
          {
            kind: 'discipline',
            alias: 'test-sport',
            author: 'Test Author',
            licence: 'AGPL-3.0-only',
            outputDirectory: join(directory, 'test-sport'),
          },
          { run },
        ),
      ).rejects.toThrow('failed with exit code 1');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
