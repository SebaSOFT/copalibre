import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ProcessRunner } from '../process-runner.js';
import { scaffoldModule } from './scaffold.js';
import { validateLocalModule } from './validate-local.js';

const execFileAsync = promisify(execFile);
const realGitProcesses: ProcessRunner = {
  run: async (command, arguments_) => {
    await execFileAsync(command, [...arguments_]);
    return 0;
  },
};

describe('validateLocalModule (0049)', () => {
  it('reports a scaffolded package as valid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-validate-local-test-'));
    try {
      const result = await scaffoldModule(
        {
          kind: 'tournament-profile',
          alias: 'test-format',
          author: 'Test Author',
          licence: 'AGPL-3.0-only',
          outputDirectory: join(directory, 'test-format'),
        },
        realGitProcesses,
      );

      const validation = await validateLocalModule(result.moduleDirectory, '1.0.0');
      expect(validation.ok).toBe(true);
      expect(validation.lines[0]).toContain('PASS test-format@0.1.0');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15000);

  it('reports a malformed package as invalid, naming the failing stage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-validate-local-test-'));
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'manifest.json'), '{}');
      await writeFile(join(directory, 'artifact.json'), '{}');

      const validation = await validateLocalModule(directory, '1.0.0');
      expect(validation.ok).toBe(false);
      expect(validation.lines.some((line) => line.includes('[manifest]'))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
