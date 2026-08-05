import {
  assertBackupFile,
  backupDryRunMessage,
  backupCommand,
  parseBackupOptions,
  parseRestoreOptions,
  restoreCommand,
  restoreDryRunMessage,
} from './backup.js';

describe('backup and restore options', () => {
  it('parses an explicit backup target and dry-run mode', () => {
    expect(parseBackupOptions(['--file', 'backups/copalibre.dump', '--dry-run'])).toEqual({
      file: 'backups/copalibre.dump',
      dryRun: true,
    });
  });

  it('requires a backup file', () => {
    expect(() => parseBackupOptions([])).toThrow('--file is required');
    expect(() => parseRestoreOptions([])).toThrow('--file is required');
  });

  it('defaults backup mode to an execution rather than a dry run', () => {
    expect(parseBackupOptions(['--file', 'backups/copalibre.dump'])).toMatchObject({
      dryRun: false,
    });
  });

  it('requires confirmation for a non-dry-run restore at the command boundary', () => {
    expect(parseRestoreOptions(['--file', 'backups/copalibre.dump'])).toEqual({
      file: 'backups/copalibre.dump',
      dryRun: false,
      confirmed: false,
    });
  });

  it('parses confirmed restore dry-run mode', () => {
    expect(
      parseRestoreOptions(['--file', 'backups/copalibre.dump', '--dry-run', '--confirm']),
    ).toEqual({
      file: 'backups/copalibre.dump',
      dryRun: true,
      confirmed: true,
    });
  });

  it('renders PostgreSQL commands without shell interpolation', () => {
    expect(backupCommand({ file: 'backups/copalibre.dump', dryRun: true })).toEqual([
      'pg_dump',
      '--format=custom',
      '--file',
      'backups/copalibre.dump',
    ]);
    expect(
      restoreCommand('copalibre', {
        file: 'backups/copalibre.dump',
        dryRun: false,
        confirmed: true,
      }),
    ).toContain('--clean');
  });

  it('keeps backup paths within the dedicated mount and hides connection strings in plans', () => {
    expect(() => assertBackupFile('/tmp/copalibre.dump')).toThrow('within the backups/ directory');
    expect(() => assertBackupFile('../copalibre.dump')).toThrow('within the backups/ directory');
    expect(() => assertBackupFile('copalibre.dump')).toThrow('within the backups/ directory');
    expect(() => assertBackupFile('backups')).toThrow('within the backups/ directory');
    expect(() => assertBackupFile('backups/copalibre.dump')).not.toThrow();
    expect(backupDryRunMessage({ file: 'backups/copalibre.dump', dryRun: true })).toBe(
      'Backup plan: pg_dump custom format -> backups/copalibre.dump',
    );
    expect(
      restoreDryRunMessage({
        file: 'backups/copalibre.dump',
        dryRun: true,
        confirmed: false,
      }),
    ).toBe('Restore plan: pg_restore --clean --if-exists <- backups/copalibre.dump');
  });
});
