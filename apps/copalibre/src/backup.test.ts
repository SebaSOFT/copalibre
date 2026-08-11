import {
  assertBackupFile,
  backupDryRunMessage,
  buildManifest,
  defaultPacketFileName,
  evaluateRestoreCompatibility,
  parseBackupOptions,
  parseRestoreOptions,
  pgDumpCommand,
  pgRestoreCommand,
  restoreDryRunMessage,
  selectPacketsToPrune,
} from './backup.js';

describe('backup and restore options', () => {
  it('parses an explicit packet target, retention, and dry-run mode', () => {
    expect(
      parseBackupOptions(['--file', 'backups/copalibre.tar.gz', '--retain', '3', '--dry-run']),
    ).toEqual({
      file: 'backups/copalibre.tar.gz',
      retain: 3,
      dryRun: true,
    });
  });

  it('defaults --file to a timestamped packet name and --retain to 5', () => {
    const options = parseBackupOptions([]);
    expect(options.file).toMatch(/^backups\/copalibre-.+\.tar\.gz$/);
    expect(options.retain).toBe(5);
    expect(options.dryRun).toBe(false);
  });

  it('rejects a non-positive --retain', () => {
    expect(() => parseBackupOptions(['--retain', '0'])).toThrow(
      '--retain must be a positive integer',
    );
    expect(() => parseBackupOptions(['--retain=-1'])).toThrow(
      '--retain must be a positive integer',
    );
    expect(() => parseBackupOptions(['--retain', 'nope'])).toThrow(
      '--retain must be a positive integer',
    );
  });

  it('requires a restore file', () => {
    expect(() => parseRestoreOptions([])).toThrow('--file is required');
  });

  it('requires confirmation for a non-dry-run restore at the command boundary', () => {
    expect(parseRestoreOptions(['--file', 'backups/copalibre.tar.gz'])).toEqual({
      file: 'backups/copalibre.tar.gz',
      dryRun: false,
      confirmed: false,
      allowNewerBackup: false,
    });
  });

  it('parses confirmed restore dry-run mode', () => {
    expect(
      parseRestoreOptions(['--file', 'backups/copalibre.tar.gz', '--dry-run', '--confirm']),
    ).toEqual({
      file: 'backups/copalibre.tar.gz',
      dryRun: true,
      confirmed: true,
      allowNewerBackup: false,
    });
  });

  it('parses --allow-newer-backup', () => {
    expect(
      parseRestoreOptions(['--file', 'backups/copalibre.tar.gz', '--allow-newer-backup']),
    ).toMatchObject({ allowNewerBackup: true });
  });

  it('renders PostgreSQL commands without shell interpolation', () => {
    expect(pgDumpCommand('/backups/staging/database.dump')).toEqual([
      'pg_dump',
      '--format=custom',
      '--file',
      '/backups/staging/database.dump',
    ]);
    expect(pgRestoreCommand('copalibre', '/backups/staging/database.dump')).toContain('--clean');
  });

  it('keeps backup paths within the dedicated mount and hides connection strings in plans', () => {
    expect(() => assertBackupFile('/tmp/copalibre.tar.gz')).toThrow(
      'within the backups/ directory',
    );
    expect(() => assertBackupFile('../copalibre.tar.gz')).toThrow('within the backups/ directory');
    expect(() => assertBackupFile('copalibre.tar.gz')).toThrow('within the backups/ directory');
    expect(() => assertBackupFile('backups')).toThrow('within the backups/ directory');
    expect(() => assertBackupFile('backups/copalibre.tar.gz')).not.toThrow();
    expect(backupDryRunMessage({ file: 'backups/copalibre.tar.gz', retain: 5, dryRun: true })).toBe(
      'Backup plan: pg_dump custom format, packed and compressed -> backups/copalibre.tar.gz ' +
        '(retaining 5 most recent packet(s))',
    );
    expect(
      restoreDryRunMessage({
        file: 'backups/copalibre.tar.gz',
        dryRun: true,
        confirmed: false,
        allowNewerBackup: false,
      }),
    ).toBe(
      'Restore plan: extract backups/copalibre.tar.gz and pg_restore --clean --if-exists its ' +
        'database dump, then run pending migrations and confirm the schema matches this installation',
    );
  });
});

describe('defaultPacketFileName (0046)', () => {
  it('produces a colon-free, chronologically sortable packet name', () => {
    const first = defaultPacketFileName(new Date('2026-01-01T00:00:00.000Z'));
    const second = defaultPacketFileName(new Date('2026-06-01T00:00:00.000Z'));
    expect(first).toBe('backups/copalibre-2026-01-01T00-00-00-000Z.tar.gz');
    expect([first, second].sort()).toEqual([first, second]);
  });
});

describe('buildManifest (0046)', () => {
  it('records the given version and timestamp', () => {
    expect(buildManifest('1.2.3', new Date('2026-01-01T00:00:00.000Z'))).toEqual({
      createdAt: '2026-01-01T00:00:00.000Z',
      copalibreVersion: '1.2.3',
    });
  });
});

describe('selectPacketsToPrune (0046)', () => {
  it('keeps the newest N packets and returns the rest for deletion', () => {
    const packets = [
      'copalibre-2026-01-01T00-00-00-000Z.tar.gz',
      'copalibre-2026-01-02T00-00-00-000Z.tar.gz',
      'copalibre-2026-01-03T00-00-00-000Z.tar.gz',
    ];
    expect(selectPacketsToPrune(packets, 2)).toEqual(['copalibre-2026-01-01T00-00-00-000Z.tar.gz']);
  });

  it('never selects a file that does not match the packet naming pattern', () => {
    const entries = [
      'copalibre-2026-01-01T00-00-00-000Z.tar.gz',
      'operator-notes.txt',
      'copalibre.dump',
    ];
    expect(selectPacketsToPrune(entries, 0)).toEqual(['copalibre-2026-01-01T00-00-00-000Z.tar.gz']);
  });

  it('returns nothing to prune when fewer packets exist than the retention count', () => {
    const packets = ['copalibre-2026-01-01T00-00-00-000Z.tar.gz'];
    expect(selectPacketsToPrune(packets, 5)).toEqual([]);
  });
});

describe('evaluateRestoreCompatibility (0050)', () => {
  it('allows a backup older than the running version', () => {
    expect(evaluateRestoreCompatibility('1.0.0', '2.0.0', false)).toEqual({ ok: true });
  });

  it('allows a backup at the same version as the running version', () => {
    expect(evaluateRestoreCompatibility('2.0.0', '2.0.0', false)).toEqual({ ok: true });
  });

  it('refuses a backup newer than the running version, naming both versions', () => {
    const result = evaluateRestoreCompatibility('2.1.0', '2.0.0', false);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('2.1.0');
    expect(result.reason).toContain('2.0.0');
    expect(result.reason).toContain('--allow-newer-backup');
  });

  it('allows a newer backup when explicitly overridden', () => {
    expect(evaluateRestoreCompatibility('2.1.0', '2.0.0', true)).toEqual({ ok: true });
  });
});
