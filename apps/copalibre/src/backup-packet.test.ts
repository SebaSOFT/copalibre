import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import { createBackupPacket, restoreBackupPacket } from './backup-packet.js';
import type { ProcessRunner } from './process-runner.js';

/**
 * `createBackupPacket`/`restoreBackupPacket` stage under a relative
 * `backups/` directory, matching the real Compose bind mount (0046 design).
 * Tests run inside their own temporary working directory rather than the
 * repo's real `backups/`, restoring `process.cwd()` afterwards.
 */
async function withTemporaryWorkingDirectory<T>(run: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-backup-packet-'));
  process.chdir(directory);
  try {
    await mkdir('backups', { recursive: true });
    return await run();
  } finally {
    process.chdir(originalCwd);
    await rm(directory, { recursive: true, force: true });
  }
}

describe('createBackupPacket (0046)', () => {
  it('runs pg_dump into a staging directory, packs it, and cleans up staging', async () => {
    await withTemporaryWorkingDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async (_command, arguments_) => {
        // Simulate database-tools actually writing the dump pg_dump was asked for.
        const dumpArgumentIndex = (arguments_ as readonly string[]).indexOf('--file');
        const containerPath = (arguments_ as readonly string[])[dumpArgumentIndex + 1] as string;
        const hostPath = containerPath.replace(/^\/backups\//, 'backups/');
        await mkdir(join(hostPath, '..'), { recursive: true });
        await writeFile(hostPath, 'fake dump bytes');
        return 0;
      });

      const result = await createBackupPacket(
        { run },
        { file: 'backups/copalibre-test.tar.gz', retain: 5 },
        '1.2.3',
      );

      expect(result.file).toBe('backups/copalibre-test.tar.gz');
      expect(run).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['compose', 'run', '--rm', 'database-tools', 'pg_dump']),
      );

      const remaining = await readdir('backups');
      expect(remaining).toEqual(['copalibre-test.tar.gz']);

      const extractDirectory = await mkdtemp(join(tmpdir(), 'copalibre-extract-'));
      try {
        await tar.extract({ file: 'backups/copalibre-test.tar.gz', cwd: extractDirectory });
        const entries = (await readdir(extractDirectory)).sort();
        expect(entries).toEqual(['database.dump', 'manifest.json']);
      } finally {
        await rm(extractDirectory, { recursive: true, force: true });
      }
    });
  });

  it('prunes older packets beyond the retention count', async () => {
    await withTemporaryWorkingDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      // Two packets already present, one older than the other.
      await writeFile('backups/copalibre-2020-01-01T00-00-00-000Z.tar.gz', 'old');
      await writeFile('backups/copalibre-2020-06-01T00-00-00-000Z.tar.gz', 'newer');

      const result = await createBackupPacket(
        { run },
        { file: 'backups/copalibre-2020-12-01T00-00-00-000Z.tar.gz', retain: 2 },
        '1.2.3',
      );

      expect(result.pruned).toEqual(['backups/copalibre-2020-01-01T00-00-00-000Z.tar.gz']);
      const remaining = (await readdir('backups')).sort();
      expect(remaining).toEqual([
        'copalibre-2020-06-01T00-00-00-000Z.tar.gz',
        'copalibre-2020-12-01T00-00-00-000Z.tar.gz',
      ]);
    });
  });

  it('removes the staging directory even when pg_dump fails', async () => {
    await withTemporaryWorkingDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 1);

      await expect(
        createBackupPacket({ run }, { file: 'backups/copalibre-test.tar.gz', retain: 5 }, '1.2.3'),
      ).rejects.toThrow('pg_dump failed with exit code 1');

      const remaining = await readdir('backups');
      expect(remaining).toEqual([]);
    });
  });
});

describe('restoreBackupPacket (0046)', () => {
  it('extracts the packet and runs pg_restore, then cleans up staging', async () => {
    await withTemporaryWorkingDirectory(async () => {
      const setupRun = jest.fn<ProcessRunner['run']>(async (_command, arguments_) => {
        const dumpArgumentIndex = (arguments_ as readonly string[]).indexOf('--file');
        const containerPath = (arguments_ as readonly string[])[dumpArgumentIndex + 1] as string;
        const hostPath = containerPath.replace(/^\/backups\//, 'backups/');
        await mkdir(join(hostPath, '..'), { recursive: true });
        await writeFile(hostPath, 'fake dump bytes');
        return 0;
      });
      await createBackupPacket(
        { run: setupRun },
        { file: 'backups/copalibre-test.tar.gz', retain: 5 },
        '1.2.3',
      );

      const restoreRun = jest.fn<ProcessRunner['run']>(async () => 0);
      await restoreBackupPacket(
        { run: restoreRun },
        { file: 'backups/copalibre-test.tar.gz', database: 'copalibre' },
      );

      expect(restoreRun).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['compose', 'run', '--rm', 'database-tools', 'pg_restore']),
      );

      const remaining = await readdir('backups');
      expect(remaining).toEqual(['copalibre-test.tar.gz']);
    });
  });

  it('removes the staging directory even when pg_restore fails', async () => {
    await withTemporaryWorkingDirectory(async () => {
      const setupRun = jest.fn<ProcessRunner['run']>(async (_command, arguments_) => {
        const dumpArgumentIndex = (arguments_ as readonly string[]).indexOf('--file');
        const containerPath = (arguments_ as readonly string[])[dumpArgumentIndex + 1] as string;
        const hostPath = containerPath.replace(/^\/backups\//, 'backups/');
        await mkdir(join(hostPath, '..'), { recursive: true });
        await writeFile(hostPath, 'fake dump bytes');
        return 0;
      });
      await createBackupPacket(
        { run: setupRun },
        { file: 'backups/copalibre-test.tar.gz', retain: 5 },
        '1.2.3',
      );

      const restoreRun = jest.fn<ProcessRunner['run']>(async () => 1);
      await expect(
        restoreBackupPacket(
          { run: restoreRun },
          { file: 'backups/copalibre-test.tar.gz', database: 'copalibre' },
        ),
      ).rejects.toThrow('pg_restore failed with exit code 1');

      const remaining = await readdir('backups');
      expect(remaining).toEqual(['copalibre-test.tar.gz']);
    });
  });
});
