import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../cli.js';
import { writeInstallationMarker } from '../installation-marker.js';
import type { ProcessRunner } from '../process-runner.js';

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-restart-test-'));
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

describe('copalibre restart', () => {
  it('stops, starts PostgreSQL, runs doctor, then starts services with health waiting', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['restart'], {}, { run })).resolves.toBe(0);
        expect(run.mock.calls.map((call) => call[1])).toEqual([
          ['compose', 'stop'],
          ['compose', 'up', '--detach', '--wait', 'postgres'],
          ['compose', 'run', '--rm', 'doctor'],
          ['compose', 'up', '--detach', '--wait'],
        ]);
      } finally {
        restore();
      }
    });
  });

  it('skips doctor only when --no-doctor is provided', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['restart', '--no-doctor'], {}, { run })).resolves.toBe(0);
        expect(run.mock.calls.map((call) => call[1])).toEqual([
          ['compose', 'stop'],
          ['compose', 'up', '--detach', '--wait', 'postgres'],
          ['compose', 'up', '--detach', '--wait'],
        ]);
      } finally {
        restore();
      }
    });
  });

  it('stops and restarts development Compose profiles without managing host processes', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.dev.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      const profile = ['compose', '-f', 'docker-compose.dev.yml', '--profile', 'infrastructure'];
      try {
        await expect(runCli(['restart', '--dev'], {}, { run })).resolves.toBe(0);
        expect(run.mock.calls.map((call) => call[1])).toEqual([
          [...profile, 'stop'],
          [...profile, 'up', '--detach', '--wait'],
        ]);
      } finally {
        restore();
      }
    });
  });

  it('refuses Kubernetes mode with a rollout alternative', async () => {
    await withDirectory(async (directory) => {
      await writeInstallationMarker(directory, '1.2.6', {
        release: 'copalibre',
        namespace: 'production',
      });
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['restart'], {}, { run })).resolves.toBe(1);
        expect(run).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });
});
