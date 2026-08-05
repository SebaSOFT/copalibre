import { parseArgs } from 'node:util';
import { isAbsolute, normalize, relative } from 'node:path';

const BACKUP_DIRECTORY = 'backups';

export interface BackupOptions {
  readonly file: string;
  readonly dryRun: boolean;
}

export interface RestoreOptions extends BackupOptions {
  readonly confirmed: boolean;
}

export function parseBackupOptions(arguments_: readonly string[]): BackupOptions {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!parsed.values.file) throw new Error('--file is required');
  return { file: parsed.values.file, dryRun: parsed.values['dry-run'] ?? false };
}

export function parseRestoreOptions(arguments_: readonly string[]): RestoreOptions {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      confirm: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!parsed.values.file) throw new Error('--file is required');
  return {
    file: parsed.values.file,
    dryRun: parsed.values['dry-run'] ?? false,
    confirmed: parsed.values.confirm ?? false,
  };
}

export function backupCommand(options: BackupOptions): readonly string[] {
  return ['pg_dump', '--format=custom', '--file', options.file];
}

export function restoreCommand(database: string, options: RestoreOptions): readonly string[] {
  return ['pg_restore', '--clean', '--if-exists', '--no-owner', '--dbname', database, options.file];
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
  return `Backup plan: pg_dump custom format -> ${options.file}`;
}

export function restoreDryRunMessage(options: RestoreOptions): string {
  return `Restore plan: pg_restore --clean --if-exists <- ${options.file}`;
}
