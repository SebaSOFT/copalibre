import { jest } from '@jest/globals';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackupPacket } from './backup-packet.js';
import { renderBanner } from './banner.js';
import { CliRunner } from './cli-runner.js';
import { COMMAND_HELP, MODULE_SUBCOMMAND_HELP } from './help-text.js';
import type { ProcessRunner } from './process-runner.js';

/** Mirrors `backup-packet.test.ts`'s temp-cwd helper (0050): `restore` reads `backups/` relatively. */
async function withTemporaryWorkingDirectory<T>(run: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-cli-runner-'));
  process.chdir(directory);
  try {
    await mkdir('backups', { recursive: true });
    return await run();
  } finally {
    process.chdir(originalCwd);
    await rm(directory, { recursive: true, force: true });
  }
}

/** Stages a real, extractable packet via `createBackupPacket` (0046), naming its manifest version. */
async function stageRestorablePacket(copalibreVersion: string): Promise<string> {
  const setupRun = jest.fn<ProcessRunner['run']>(async (_command, arguments_) => {
    const dumpArgumentIndex = (arguments_ as readonly string[]).indexOf('--file');
    const containerPath = (arguments_ as readonly string[])[dumpArgumentIndex + 1] as string;
    const hostPath = containerPath.replace(/^\/backups\//, 'backups/');
    await mkdir(join(hostPath, '..'), { recursive: true });
    await writeFile(hostPath, 'fake dump bytes');
    return 0;
  });
  const result = await createBackupPacket(
    { run: setupRun },
    { file: 'backups/copalibre-test.tar.gz', retain: 5 },
    copalibreVersion,
  );
  return result.file;
}

/** Shared by every "banner prints first" case (task 3.1): records write order across both streams. */
function spyOnOutputOrder(): {
  readonly writes: { readonly stream: 'stdout' | 'stderr'; readonly chunk: string }[];
  restore(): void;
} {
  const writes: { readonly stream: 'stdout' | 'stderr'; readonly chunk: string }[] = [];
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push({ stream: 'stdout', chunk: String(chunk) });
    return true;
  });
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    writes.push({ stream: 'stderr', chunk: String(chunk) });
    return true;
  });
  return {
    writes,
    restore() {
      stdout.mockRestore();
      stderr.mockRestore();
    },
  };
}

describe('CliRunner', () => {
  describe('startup banner (0042)', () => {
    it.each([
      ['--help', ['--help']],
      ['no arguments', []],
      ['an unknown command', ['not-a-real-command']],
    ] as const)('prints to stderr before any other output, for %s', async (_label, arguments_) => {
      const spy = spyOnOutputOrder();
      try {
        await new CliRunner({ run: jest.fn(async () => 0) }).run([...arguments_], {});

        expect(spy.writes.length).toBeGreaterThan(0);
        expect(spy.writes[0]).toMatchObject({ stream: 'stderr', chunk: renderBanner() });
      } finally {
        spy.restore();
      }
    });

    it('prints to stderr before a normal command fails with its own error', async () => {
      const spy = spyOnOutputOrder();
      try {
        await new CliRunner({ run: jest.fn(async () => 0) }).run(['create-admin'], {});

        expect(spy.writes[0]).toMatchObject({ stream: 'stderr', chunk: renderBanner() });
        expect(spy.writes.some((write) => write.chunk.includes('create-admin failed'))).toBe(true);
      } finally {
        spy.restore();
      }
    });

    it('never writes the banner to stdout', async () => {
      const spy = spyOnOutputOrder();
      try {
        await new CliRunner({ run: jest.fn(async () => 0) }).run([], {});

        expect(
          spy.writes.some(
            (write) => write.stream === 'stdout' && write.chunk.includes('CopaLibre'),
          ),
        ).toBe(false);
      } finally {
        spy.restore();
      }
    });
  });

  describe('comprehensive help (0044)', () => {
    it.each([
      ['--help', ['--help']],
      ['-h', ['-h']],
      ['no arguments', []],
    ] as const)('%s lists every command', async (_label, arguments_) => {
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        const result = await new CliRunner({ run: jest.fn(async () => 0) }).run(
          [...arguments_],
          {},
        );
        expect(result).toBe(0);
        const printed = stdout.mock.calls.map((call) => String(call[0])).join('');
        for (const command of COMMAND_HELP) {
          expect(printed).toContain(command.name);
        }
      } finally {
        stdout.mockRestore();
      }
    });

    it.each(COMMAND_HELP.map((command) => command.name))(
      '"%s --help" prints usage and exits 0 without running the command',
      async (command) => {
        const run = jest.fn<ProcessRunner['run']>(async () => 0);
        const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
          const result = await new CliRunner({ run }).run([command, '--help'], {});
          expect(result).toBe(0);
          expect(run).not.toHaveBeenCalled();
        } finally {
          stdout.mockRestore();
        }
      },
    );

    it('"module --help" lists every module subcommand', async () => {
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        const result = await new CliRunner({ run: jest.fn(async () => 0) }).run(
          ['module', '--help'],
          {},
        );
        expect(result).toBe(0);
        const printed = stdout.mock.calls.map((call) => String(call[0])).join('');
        for (const subcommand of MODULE_SUBCOMMAND_HELP) {
          expect(printed).toContain(subcommand.name);
        }
      } finally {
        stdout.mockRestore();
      }
    });

    it.each(MODULE_SUBCOMMAND_HELP.map((subcommand) => subcommand.name))(
      '"module %s --help" prints usage and exits 0 without running the subcommand',
      async (subcommand) => {
        const run = jest.fn<ProcessRunner['run']>(async () => 0);
        const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
          const result = await new CliRunner({ run }).run(['module', subcommand, '--help'], {});
          expect(result).toBe(0);
          expect(run).not.toHaveBeenCalled();
        } finally {
          stdout.mockRestore();
        }
      },
    );
  });

  describe('backup/restore dry-run (0046)', () => {
    it('backup --dry-run prints the plan without touching the filesystem or docker', async () => {
      const run = jest.fn<ProcessRunner['run']>();
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        const result = await new CliRunner({ run }).run(
          ['backup', '--file', 'backups/example.tar.gz', '--dry-run'],
          {},
        );
        expect(result).toBe(0);
        expect(run).not.toHaveBeenCalled();
        expect(stdout.mock.calls.some((call) => String(call[0]).includes('Backup plan'))).toBe(
          true,
        );
      } finally {
        stdout.mockRestore();
      }
    });

    it('restore --dry-run prints the plan without touching the filesystem or docker', async () => {
      const run = jest.fn<ProcessRunner['run']>();
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        const result = await new CliRunner({ run }).run(
          ['restore', '--file', 'backups/example.tar.gz', '--dry-run'],
          {},
        );
        expect(result).toBe(0);
        expect(run).not.toHaveBeenCalled();
        expect(stdout.mock.calls.some((call) => String(call[0]).includes('Restore plan'))).toBe(
          true,
        );
      } finally {
        stdout.mockRestore();
      }
    });
  });

  describe('restore migrate-then-verify sequencing (0050)', () => {
    it('refuses a backup newer than the running version before any migrate invocation', async () => {
      await withTemporaryWorkingDirectory(async () => {
        // Deliberately far ahead of any real released version (0058), so this
        // stays "newer than running" across future version bumps rather than
        // needing to be re-picked at each release.
        const packetFile = await stageRestorablePacket('99.0.0');
        const run = jest.fn<ProcessRunner['run']>(async () => 0);
        const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
          const result = await new CliRunner({ run }).run(
            ['restore', '--file', packetFile, '--confirm'],
            {},
          );
          expect(result).toBe(1);
          expect(
            stderr.mock.calls.some((call) => String(call[0]).includes('--allow-newer-backup')),
          ).toBe(true);
          expect(run).not.toHaveBeenCalled();
        } finally {
          stderr.mockRestore();
        }
      });
    });

    it('reports a migrate failure after a successful restore, without claiming success', async () => {
      await withTemporaryWorkingDirectory(async () => {
        const packetFile = await stageRestorablePacket('0.0.0');
        const run = jest.fn<ProcessRunner['run']>(async (_command, arguments_) => {
          const args = arguments_ as readonly string[];
          if (args.includes('migrate')) return 3;
          return 0;
        });
        const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
          const result = await new CliRunner({ run }).run(
            ['restore', '--file', packetFile, '--confirm'],
            {},
          );
          expect(result).toBe(3);
          expect(run).toHaveBeenCalledWith(
            'docker',
            expect.arrayContaining(['compose', 'run', '--rm', 'migrate']),
          );
          expect(
            stderr.mock.calls.some(
              (call) =>
                String(call[0]).includes('copalibre migrate') &&
                String(call[0]).includes('copalibre doctor'),
            ),
          ).toBe(true);
        } finally {
          stderr.mockRestore();
        }
      });
    });
  });

  describe('upgrade-check (0045)', () => {
    it('proxies to a one-off container outside a container, like doctor', async () => {
      const run = jest.fn<ProcessRunner['run']>().mockResolvedValueOnce(0);
      const result = await new CliRunner({ run }).run(
        ['upgrade-check', '--target-version', '2.0.0'],
        {},
      );

      expect(result).toBe(0);
      expect(run).toHaveBeenCalledWith('docker', [
        'compose',
        'run',
        '--rm',
        'upgrade-check',
        '--target-version',
        '2.0.0',
      ]);
    });

    it('requires --target-version inside a container', async () => {
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const result = await new CliRunner({ run: jest.fn(async () => 0) }).run(['upgrade-check'], {
          COPALIBRE_IN_CONTAINER: 'true',
        });
        expect(result).toBe(1);
        expect(stderr).toHaveBeenCalledWith(
          'copalibre upgrade-check failed: --target-version is required\n',
        );
      } finally {
        stderr.mockRestore();
      }
    });
  });

  describe('statistics-rebuild (0082)', () => {
    it('requires --organization before ever opening a database connection', async () => {
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const result = await new CliRunner({ run: jest.fn(async () => 0) }).run(
          ['statistics-rebuild'],
          {},
        );
        expect(result).toBe(1);
        expect(stderr).toHaveBeenCalledWith(
          'copalibre statistics-rebuild failed: --organization is required\n',
        );
      } finally {
        stderr.mockRestore();
      }
    });
  });

  it('waits for development infrastructure before running hybrid migrations', async () => {
    const run = jest.fn<ProcessRunner['run']>().mockResolvedValueOnce(0).mockResolvedValueOnce(7);
    const result = await new CliRunner({ run }).run(['dev', '--hybrid'], {});

    expect(result).toBe(7);
    expect(run).toHaveBeenNthCalledWith(1, 'docker', [
      'compose',
      '-f',
      'docker-compose.dev.yml',
      '--profile',
      'infrastructure',
      'up',
      '--detach',
      '--wait',
    ]);
    expect(run).toHaveBeenNthCalledWith(
      2,
      'yarn',
      ['workspace', '@copalibre/migrate', 'run', 'start'],
      expect.objectContaining({
        DATABASE_URL: 'postgres://copalibre:copalibre_dev_only@localhost:5432/copalibre',
      }),
    );
  });

  it('turns rejected asynchronous commands into concise operator errors', async () => {
    const processes: ProcessRunner = {
      run: jest.fn(async () => 0),
    };
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(new CliRunner(processes).run(['create-admin'], {})).resolves.toBe(1);
      expect(stderr).toHaveBeenCalledWith(
        'copalibre create-admin failed: --organization-alias is required\n',
      );
    } finally {
      stderr.mockRestore();
    }
  });
});
