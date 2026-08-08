import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as tar from 'tar';
import { buildManifest, pgDumpCommand, pgRestoreCommand, selectPacketsToPrune } from './backup.js';
import type { ProcessRunner } from './process-runner.js';

const STAGING_ROOT = 'backups';
const DUMP_FILENAME = 'database.dump';
const MANIFEST_FILENAME = 'manifest.json';

export interface CreatePacketResult {
  readonly file: string;
  readonly pruned: readonly string[];
}

/**
 * Stages `pg_dump`'s output plus a manifest, then tars/gzips the staging
 * directory into `options.file` before applying retention (0046). `pg_dump`
 * runs via the existing `database-tools` Compose service — staging happens
 * under `backups/`, the only host directory that container can see.
 */
export async function createBackupPacket(
  processes: ProcessRunner,
  options: { readonly file: string; readonly retain: number },
  copalibreVersion: string,
): Promise<CreatePacketResult> {
  const stagingName = `.staging-backup-${Date.now()}`;
  const stagingPath = join(STAGING_ROOT, stagingName);
  await mkdir(stagingPath, { recursive: true });
  try {
    const dumpResult = await processes.run('docker', [
      'compose',
      'run',
      '--rm',
      'database-tools',
      ...pgDumpCommand(`/backups/${stagingName}/${DUMP_FILENAME}`),
    ]);
    if (dumpResult !== 0) {
      throw new Error(`pg_dump failed with exit code ${dumpResult}`);
    }

    await writeFile(
      join(stagingPath, MANIFEST_FILENAME),
      JSON.stringify(buildManifest(copalibreVersion), null, 2),
    );

    await tar.create({ gzip: true, file: options.file, cwd: stagingPath }, ['.']);
  } finally {
    await rm(stagingPath, { recursive: true, force: true });
  }

  const pruned = await pruneOldPackets(dirname(options.file), options.retain);
  return { file: options.file, pruned };
}

/** Extracts and restores a packet created by `createBackupPacket` (0046). */
export async function restoreBackupPacket(
  processes: ProcessRunner,
  options: { readonly file: string; readonly database: string },
): Promise<void> {
  const stagingName = `.staging-restore-${Date.now()}`;
  const stagingPath = join(STAGING_ROOT, stagingName);
  await mkdir(stagingPath, { recursive: true });
  try {
    await tar.extract({ file: options.file, cwd: stagingPath });
    const restoreResult = await processes.run('docker', [
      'compose',
      'run',
      '--rm',
      'database-tools',
      ...pgRestoreCommand(options.database, `/backups/${stagingName}/${DUMP_FILENAME}`),
    ]);
    if (restoreResult !== 0) {
      throw new Error(`pg_restore failed with exit code ${restoreResult}`);
    }
  } finally {
    await rm(stagingPath, { recursive: true, force: true });
  }
}

async function pruneOldPackets(directory: string, retain: number): Promise<readonly string[]> {
  const entries = await readdir(directory).catch(() => [] as string[]);
  const toDelete = selectPacketsToPrune(entries, retain);
  await Promise.all(toDelete.map((name) => rm(join(directory, name), { force: true })));
  return toDelete.map((name) => join(directory, name));
}
