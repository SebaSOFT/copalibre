import { jest } from '@jest/globals';
import { renderBanner } from './banner.js';
import { CliRunner } from './cli-runner.js';
import { COMMAND_HELP, MODULE_SUBCOMMAND_HELP } from './help-text.js';
import type { ProcessRunner } from './process-runner.js';

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
