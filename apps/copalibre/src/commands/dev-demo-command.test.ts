import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../cli.js';
import { writeInstallationMarker } from '../installation-marker.js';
import type { ProcessOutput, ProcessRunner } from '../process-runner.js';
import { DEV_OBJECT_STORAGE } from './dev-demo-command.js';

async function withDirectory<T>(
  run: (directory: string) => Promise<T>,
  options: { composeFile?: boolean } = {},
): Promise<T> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-dev-demo-test-'));
  if (options.composeFile !== false) {
    await writeFile(join(directory, 'docker-compose.dev.yml'), 'services: {}\n');
  }
  process.chdir(directory);
  try {
    return await run(directory);
  } finally {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
}

function output(): { restore: () => void; stderr: () => string } {
  let captured = '';
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    captured += String(chunk);
    return true;
  });
  return {
    restore: () => {
      stdout.mockRestore();
      stderr.mockRestore();
    },
    stderr: () => captured,
  };
}

function composePs(
  ...services: { Service: string; State: string; Health?: string }[]
): ProcessOutput {
  return { code: 0, stderr: '', stdout: JSON.stringify(services) };
}

const STACK_UP = composePs(
  { Service: 'postgres', State: 'running', Health: 'healthy' },
  { Service: 'object-storage', State: 'running', Health: 'healthy' },
  { Service: 'object-storage-init', State: 'running', Health: 'healthy' },
);

describe('copalibre dev demo', () => {
  it('loads the dataset through the seed application with host database and Garage settings', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => STACK_UP);
      const out = output();
      try {
        await expect(
          runCli(['dev', 'demo', 'panamericano-clubes-2025'], {}, { run, capture }),
        ).resolves.toBe(0);
      } finally {
        out.restore();
      }
      expect(capture).toHaveBeenCalledWith('docker', [
        'compose',
        '-f',
        'docker-compose.dev.yml',
        '--profile',
        'infrastructure',
        'ps',
        '--format',
        'json',
      ]);
      expect(run).toHaveBeenCalledTimes(1);
      const [command, args, environment] = run.mock.calls[0] ?? [];
      expect(command).toBe('yarn');
      expect(args).toEqual([
        'workspace',
        '@copalibre/seed',
        'start',
        'demo',
        'panamericano-clubes-2025',
      ]);
      expect(environment).toMatchObject({
        DATABASE_URL: 'postgres://copalibre:copalibre_dev_only@localhost:5432/copalibre',
        ...DEV_OBJECT_STORAGE,
      });
    });
  });

  it('prefers values the caller already set', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => STACK_UP);
      const out = output();
      try {
        await runCli(
          ['dev', 'demo', 'x'],
          { COPALIBRE_OBJECT_STORAGE_BUCKET: 'mine', DATABASE_URL: 'postgres://other' },
          { run, capture },
        );
      } finally {
        out.restore();
      }
      expect(run.mock.calls[0]?.[2]).toMatchObject({
        COPALIBRE_OBJECT_STORAGE_BUCKET: 'mine',
        DATABASE_URL: 'postgres://other',
        COPALIBRE_OBJECT_STORAGE_URL: 'http://localhost:9000',
      });
    });
  });

  it('lists datasets without needing the stack to be up', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => composePs());
      const out = output();
      try {
        await expect(runCli(['dev', 'demo', '--list'], {}, { run, capture })).resolves.toBe(0);
      } finally {
        out.restore();
      }
      expect(capture).not.toHaveBeenCalled();
      expect(run.mock.calls[0]?.[1]).toEqual([
        'workspace',
        '@copalibre/seed',
        'start',
        'demo',
        '--list',
      ]);
    });
  });

  it('refuses, naming what is down, before loading anything', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () =>
        composePs(
          { Service: 'postgres', State: 'running', Health: 'healthy' },
          { Service: 'object-storage', State: 'running', Health: 'starting' },
        ),
      );
      const out = output();
      try {
        await expect(runCli(['dev', 'demo', 'x'], {}, { run, capture })).resolves.toBe(1);
      } finally {
        out.restore();
      }
      const message = out.stderr();
      expect(run).not.toHaveBeenCalled();
      expect(message).toContain(
        'the development stack is not up (object-storage, object-storage-init)',
      );
      expect(message).toContain('copalibre dev');
    });
  });

  it('treats a failing docker compose ps as the stack being down', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => ({
        code: 1,
        stdout: '',
        stderr: 'no docker',
      }));
      const out = output();
      try {
        await expect(runCli(['dev', 'demo', 'x'], {}, { run, capture })).resolves.toBe(1);
      } finally {
        out.restore();
      }
      expect(run).not.toHaveBeenCalled();
    });
  });

  it('asks for a dataset when none is named', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const out = output();
      try {
        await expect(runCli(['dev', 'demo'], {}, { run })).resolves.toBe(1);
      } finally {
        out.restore();
      }
      const message = out.stderr();
      expect(run).not.toHaveBeenCalled();
      expect(message).toContain('name a dataset to load, or pass --list');
    });
  });

  it('needs a runner that can inspect Compose', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const out = output();
      try {
        await expect(runCli(['dev', 'demo', 'x'], {}, { run })).resolves.toBe(1);
      } finally {
        out.restore();
      }
      expect(run).not.toHaveBeenCalled();
    });
  });

  it('refuses outside a checkout', async () => {
    await withDirectory(
      async () => {
        const run = jest.fn<ProcessRunner['run']>(async () => 0);
        const out = output();
        try {
          await expect(runCli(['dev', 'demo', 'x'], {}, { run })).resolves.toBe(1);
        } finally {
          out.restore();
        }
        const message = out.stderr();
        expect(run).not.toHaveBeenCalled();
        expect(message).toContain('run this from your CopaLibre checkout');
      },
      { composeFile: false },
    );
  });

  it('refuses a Kubernetes installation', async () => {
    await withDirectory(async (directory) => {
      await writeInstallationMarker(directory, '1.2.6', {
        release: 'copalibre',
        namespace: 'production',
      });
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const out = output();
      try {
        await expect(runCli(['dev', 'demo', 'x'], {}, { run })).resolves.toBe(1);
      } finally {
        out.restore();
      }
      const message = out.stderr();
      expect(run).not.toHaveBeenCalled();
      expect(message).toContain('demo data is for development stacks only');
    });
  });

  it('is not swallowed by the plain dev command', async () => {
    await withDirectory(async () => {
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const capture = jest.fn<NonNullable<ProcessRunner['capture']>>(async () => STACK_UP);
      const out = output();
      try {
        await runCli(['dev', 'demo', 'x'], {}, { run, capture });
      } finally {
        out.restore();
      }
      expect(run.mock.calls.some((call) => call[0] === 'docker')).toBe(false);
    });
  });

  it('shows the dev help for dev demo --help', async () => {
    const out = output();
    const written: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    try {
      await expect(runCli(['dev', 'demo', '--help'], {}, { run: async () => 0 })).resolves.toBe(0);
    } finally {
      spy.mockRestore();
      out.restore();
    }
    expect(written.join('')).toContain('copalibre dev demo [--list] [<dataset>]');
  });
});

describe('the dev Garage settings', () => {
  it('match docker-compose.dev.yml, which the containerised API reads', async () => {
    const compose = await readFile(
      new URL('../../../../docker-compose.dev.yml', import.meta.url),
      'utf8',
    );
    for (const key of [
      'COPALIBRE_OBJECT_STORAGE_ACCESS_KEY',
      'COPALIBRE_OBJECT_STORAGE_SECRET_KEY',
      'COPALIBRE_OBJECT_STORAGE_BUCKET',
      'COPALIBRE_OBJECT_STORAGE_REGION',
    ]) {
      expect(compose).toContain(`${key}: ${DEV_OBJECT_STORAGE[key]}`);
    }
  });
});
