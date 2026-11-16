import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../cli.js';
import type { ProcessRunner } from '../process-runner.js';

const UPGRADE = [
  'upgrade',
  '--target-version',
  '2.0.0',
  '--yes',
  '--skip-self-update',
  '--skip-modules',
];

async function withDirectory<T>(run: () => Promise<T>): Promise<T> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-upgrade-test-'));
  process.chdir(directory);
  await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
  try {
    return await run();
  } finally {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
}

function muteOutput(): { notices: () => string[]; restore: () => void } {
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return {
    notices: () =>
      stderr.mock.calls.map((call) => String(call[0])).filter((text) => text.startsWith('Notice:')),
    restore: () => {
      stdout.mockRestore();
      stderr.mockRestore();
    },
  };
}

const composeCalls = (run: jest.Mock<ProcessRunner['run']>): string[][] =>
  run.mock.calls.map((call) => [...call[1]]);

describe('copalibre upgrade', () => {
  it('removes the setup and migration containers once the stack is recreated', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const output = muteOutput();
      try {
        await expect(runCli(UPGRADE, {}, { run })).resolves.toBe(0);
        expect(composeCalls(run)).toEqual([
          ['compose', 'pull'],
          ['compose', 'run', '--rm', 'migrate'],
          ['compose', 'up', '-d', '--force-recreate'],
          ['compose', 'rm', '--force', 'database-setup', 'migrate'],
        ]);
      } finally {
        output.restore();
      }
    });
  });

  it('keeps the containers of a failed migration, and the upgrade keeps its own exit status', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async (_command, arguments_) =>
        arguments_.includes('migrate') ? 1 : 0,
      );
      const output = muteOutput();
      try {
        await expect(runCli(UPGRADE, {}, { run })).resolves.toBe(0);
        expect(composeCalls(run).some((call) => call.includes('rm'))).toBe(false);
      } finally {
        output.restore();
      }
    });
  });

  it('removes nothing after a failed recreation', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async (_command, arguments_) =>
        arguments_.includes('--force-recreate') ? 1 : 0,
      );
      const output = muteOutput();
      try {
        await runCli(UPGRADE, {}, { run });
        expect(composeCalls(run)).toHaveLength(3);
      } finally {
        output.restore();
      }
    });
  });

  it('exits 0 with one notice when Compose refuses the removal', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async (_command, arguments_) =>
        arguments_[1] === 'rm' ? 1 : 0,
      );
      const output = muteOutput();
      try {
        await expect(runCli(UPGRADE, {}, { run })).resolves.toBe(0);
        expect(output.notices()).toEqual([
          'Notice: could not remove the one-time containers database-setup, migrate. They are stopped and harmless; the next start retries.\n',
        ]);
      } finally {
        output.restore();
      }
    });
  });

  it('runs no Docker command at all with --skip-services', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const output = muteOutput();
      try {
        await expect(runCli([...UPGRADE, '--skip-services'], {}, { run })).resolves.toBe(0);
        expect(run).not.toHaveBeenCalled();
      } finally {
        output.restore();
      }
    });
  });
});
