import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../cli.js';
import { writeInstallationMarker } from '../installation-marker.js';
import type { ProcessRunner } from '../process-runner.js';

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-start-test-'));
  process.chdir(directory);
  try {
    return await run(directory);
  } finally {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
}

function muteOutput(): () => void {
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return () => {
    stdout.mockRestore();
    stderr.mockRestore();
  };
}

describe('copalibre start', () => {
  it('starts the development Compose profile in the background with --dev', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.dev.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['start', '--dev'], {}, { run })).resolves.toBe(0);
        expect(run).toHaveBeenCalledWith('docker', [
          'compose',
          '-f',
          'docker-compose.dev.yml',
          '--profile',
          'containerized',
          'up',
          '--detach',
          '--wait',
        ]);
      } finally {
        restore();
      }
    });
  });

  it('refuses Kubernetes mode before attempting Compose', async () => {
    await withDirectory(async (directory) => {
      await writeInstallationMarker(directory, '1.2.6', {
        release: 'copalibre',
        namespace: 'production',
      });
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['start'], {}, { run })).resolves.toBe(1);
        expect(run).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  it('preserves PostgreSQL, doctor, application ordering in Compose mode', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['start'], {}, { run })).resolves.toBe(0);
        expect(run.mock.calls.map((call) => call[1])).toEqual([
          ['compose', 'up', '--detach', 'postgres'],
          ['compose', 'run', '--rm', '--env', 'COPALIBRE_DOCTOR_BEFORE_START=true', 'doctor'],
          ['compose', 'up', '--detach', '--wait'],
          ['compose', 'rm', '--force', 'database-setup', 'migrate'],
        ]);
      } finally {
        restore();
      }
    });
  });

  it('removes the development migration container and the storage initialiser after --dev is up', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.dev.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      const prefix = ['compose', '-f', 'docker-compose.dev.yml', '--profile', 'containerized'];
      try {
        await expect(runCli(['start', '--dev'], {}, { run })).resolves.toBe(0);
        expect(run.mock.calls.map((call) => call[1].slice(prefix.length))).toEqual([
          ['up', '--detach', '--wait'],
          ['rm', '--force', 'migrate'],
          ['rm', '--stop', '--force', 'object-storage-init'],
        ]);
      } finally {
        restore();
      }
    });
  });

  it('removes nothing when the application did not come up, and keeps its exit status', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const run = jest
        .fn<ProcessRunner['run']>()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(3);
      const restore = muteOutput();
      try {
        await expect(runCli(['start'], {}, { run })).resolves.toBe(3);
        expect(run).toHaveBeenCalledTimes(3);
      } finally {
        restore();
      }
    });
  });

  it('exits 0 with one notice when Compose refuses the removal', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async (_command, arguments_) =>
        arguments_.includes('rm') ? 1 : 0,
      );
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        await expect(runCli(['start'], {}, { run })).resolves.toBe(0);
        const notices = stderr.mock.calls
          .map((call) => String(call[0]))
          .filter((text) => text.startsWith('Notice:'));
        expect(notices).toEqual([
          'Notice: could not remove the one-time containers database-setup, migrate. They are stopped and harmless; the next start retries.\n',
        ]);
      } finally {
        stdout.mockRestore();
        stderr.mockRestore();
      }
    });
  });

  it('removes nothing when the CLI runs inside a container', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['start'], { COPALIBRE_IN_CONTAINER: 'true' }, { run })).resolves.toBe(
          0,
        );
        expect(run.mock.calls.map((call) => call[1])).toEqual([
          ['compose', 'up', '--detach', 'postgres'],
          ['compose', 'run', '--rm', '--env', 'COPALIBRE_DOCTOR_BEFORE_START=true', 'doctor'],
          ['compose', 'up', '--detach', '--wait'],
        ]);
      } finally {
        restore();
      }
    });
  });
});
