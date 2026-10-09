import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../cli.js';
import { writeInstallationMarker } from '../installation-marker.js';
import type { ProcessRunner } from '../process-runner.js';

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-stop-test-'));
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

describe('copalibre stop', () => {
  it('stops Compose services by default without requesting volume removal', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['stop'], {}, { run })).resolves.toBe(0);
        expect(run).toHaveBeenCalledWith('docker', ['compose', 'stop']);
      } finally {
        restore();
      }
    });
  });

  it('uses down without deleting volumes when --down is provided', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['stop', '--down'], {}, { run })).resolves.toBe(0);
        expect(run).toHaveBeenCalledWith('docker', ['compose', 'down']);
      } finally {
        restore();
      }
    });
  });

  it('stops development Compose profiles without touching host processes', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, 'docker-compose.dev.yml'), 'services: {}\n');
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['stop', '--dev'], {}, { run })).resolves.toBe(0);
        expect(run).toHaveBeenCalledWith('docker', [
          'compose',
          '-f',
          'docker-compose.dev.yml',
          '--profile',
          'infrastructure',
          'stop',
        ]);
      } finally {
        restore();
      }
    });
  });

  it('refuses Kubernetes mode with native lifecycle guidance', async () => {
    await withDirectory(async (directory) => {
      await writeInstallationMarker(directory, '1.2.6', {
        release: 'copalibre',
        namespace: 'production',
      });
      const run = jest.fn<ProcessRunner['run']>(async () => 0);
      const restore = muteOutput();
      try {
        await expect(runCli(['stop'], {}, { run })).resolves.toBe(1);
        expect(run).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });
});
