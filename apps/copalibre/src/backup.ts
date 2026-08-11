import { parseArgs } from 'node:util';
import { isAbsolute, normalize, relative } from 'node:path';
import semver from 'semver';

const BACKUP_DIRECTORY = 'backups';
const PACKET_PREFIX = 'copalibre-';
const PACKET_SUFFIX = '.tar.gz';
const DEFAULT_RETAIN = 5;

export interface BackupOptions {
  readonly file: string;
  readonly retain: number;
  readonly dryRun: boolean;
}

export interface RestoreOptions {
  readonly file: string;
  readonly dryRun: boolean;
  readonly confirmed: boolean;
  readonly allowNewerBackup: boolean;
}

export interface BackupManifest {
  readonly createdAt: string;
  readonly copalibreVersion: string;
}

export function parseBackupOptions(arguments_: readonly string[]): BackupOptions {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      file: { type: 'string' },
      retain: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });
  const retain = parseRetain(parsed.values.retain);
  return {
    file: parsed.values.file ?? defaultPacketFileName(),
    retain,
    dryRun: parsed.values['dry-run'] ?? false,
  };
}

function parseRetain(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_RETAIN;
  const retain = Number(raw);
  if (!Number.isInteger(retain) || retain < 1) {
    throw new Error(`--retain must be a positive integer, got "${raw}"`);
  }
  return retain;
}

export function parseRestoreOptions(arguments_: readonly string[]): RestoreOptions {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      confirm: { type: 'boolean', default: false },
      'allow-newer-backup': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!parsed.values.file) throw new Error('--file is required');
  return {
    file: parsed.values.file,
    dryRun: parsed.values['dry-run'] ?? false,
    confirmed: parsed.values.confirm ?? false,
    allowNewerBackup: parsed.values['allow-newer-backup'] ?? false,
  };
}

/** `backups/copalibre-<colon-free ISO timestamp>.tar.gz` — sorts chronologically as a string. */
export function defaultPacketFileName(now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `${BACKUP_DIRECTORY}/${PACKET_PREFIX}${timestamp}${PACKET_SUFFIX}`;
}

export function buildManifest(version: string, createdAt: Date = new Date()): BackupManifest {
  return { createdAt: createdAt.toISOString(), copalibreVersion: version };
}

/**
 * Which of the given packet filenames (basenames, not paths) a retention count would delete —
 * pure, no filesystem access (0046 design: unit-testable without a temp directory). Only names
 * matching this command's own packet pattern are ever candidates; anything else present under
 * `backups/` is left alone. Sorts lexicographically, which matches chronological order because
 * `defaultPacketFileName`'s timestamp is zero-padded and colon-free.
 */
export function selectPacketsToPrune(
  existingPacketNames: readonly string[],
  retain: number,
): readonly string[] {
  const packets = existingPacketNames
    .filter((name) => name.startsWith(PACKET_PREFIX) && name.endsWith(PACKET_SUFFIX))
    .sort()
    .reverse();
  return packets.slice(retain);
}

export interface RestoreCompatibility {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Pure — no filesystem or process access (0050 design, matching 0045's
 * `evaluateCoreVersionCompatibility` split). A backup newer than the running
 * code is refused by default: the running code has no migration code for
 * schema changes a later release introduced, so restoring it "succeeding"
 * would only move the desync from restore time to the next query. Older or
 * equal is always the ordinary, supported case.
 */
export function evaluateRestoreCompatibility(
  backupVersion: string,
  runningVersion: string,
  allowNewerBackup: boolean,
): RestoreCompatibility {
  if (allowNewerBackup || !semver.gt(backupVersion, runningVersion)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `Backup was produced by CopaLibre ${backupVersion}, newer than the running ` +
      `${runningVersion}. Restoring it here could leave the database using a schema this ` +
      `installation does not understand. Upgrade CopaLibre to at least ${backupVersion} first, ` +
      'or pass --allow-newer-backup to restore anyway.',
  };
}

export function pgDumpCommand(containerDumpPath: string): readonly string[] {
  return ['pg_dump', '--format=custom', '--file', containerDumpPath];
}

export function pgRestoreCommand(database: string, containerDumpPath: string): readonly string[] {
  return [
    'pg_restore',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--dbname',
    database,
    containerDumpPath,
  ];
}

/**
 * Backups run in the Compose `database-tools` service, which bind-mounts only the release
 * checkout's `backups/` directory. Restricting file paths to that mount keeps
 * the image runtime isolated from host source and dependencies.
 */
export function assertBackupFile(file: string): void {
  const normalised = normalize(file);
  const relativeToBackups = relative(BACKUP_DIRECTORY, normalised);
  if (isAbsolute(normalised) || relativeToBackups === '' || relativeToBackups.startsWith('..')) {
    throw new Error('--file must name a file within the backups/ directory');
  }
}

export function backupDryRunMessage(options: BackupOptions): string {
  return `Backup plan: pg_dump custom format, packed and compressed -> ${options.file} (retaining ${options.retain} most recent packet(s))`;
}

export function restoreDryRunMessage(options: RestoreOptions): string {
  return (
    `Restore plan: extract ${options.file} and pg_restore --clean --if-exists its database dump, ` +
    'then run pending migrations and confirm the schema matches this installation'
  );
}
