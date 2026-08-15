import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertVersionCompatible,
  readInstallationMarker,
  writeInstallationMarker,
} from './installation-marker.js';

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-marker-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('installation marker (0084)', () => {
  it('round-trips through write and read', async () => {
    await withTemporaryDirectory(async (directory) => {
      const written = await writeInstallationMarker(directory, '0.5.0-beta');
      const read = await readInstallationMarker(directory);
      expect(read).toEqual(written);
      expect(written.mode).toBe('compose');
      expect(written.version).toBe('0.5.0-beta');
      expect(written.installId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('reads as undefined when no marker exists', async () => {
    await withTemporaryDirectory(async (directory) => {
      expect(await readInstallationMarker(directory)).toBeUndefined();
    });
  });

  it('refuses to overwrite an existing marker (wx-safety)', async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeInstallationMarker(directory, '0.5.0-beta');
      await expect(writeInstallationMarker(directory, '0.6.0')).rejects.toThrow();
    });
  });

  it('assigns a distinct installId per marker', async () => {
    await withTemporaryDirectory(async (directory) => {
      const marker = await writeInstallationMarker(directory, '0.5.0-beta');
      await rm(join(directory, '.copalibre'), { recursive: true, force: true });
      const another = await writeInstallationMarker(directory, '0.5.0-beta');
      expect(another.installId).not.toBe(marker.installId);
    });
  });

  it('round-trips a kubernetes-mode marker, including an optional context', async () => {
    await withTemporaryDirectory(async (directory) => {
      const written = await writeInstallationMarker(directory, '0.5.0-beta', {
        release: 'my-copalibre',
        namespace: 'tournaments',
        context: 'prod-cluster',
      });
      const read = await readInstallationMarker(directory);
      expect(read).toEqual(written);
      expect(written.mode).toBe('kubernetes');
      expect(written).toMatchObject({
        release: 'my-copalibre',
        namespace: 'tournaments',
        context: 'prod-cluster',
      });
    });
  });

  it('writes a kubernetes-mode marker with no context field when none is given', async () => {
    await withTemporaryDirectory(async (directory) => {
      const written = await writeInstallationMarker(directory, '0.5.0-beta', {
        release: 'copalibre',
        namespace: 'default',
      });
      expect(written.mode).toBe('kubernetes');
      expect('context' in written).toBe(false);
    });
  });
});

describe('assertVersionCompatible (0084)', () => {
  const marker = {
    version: '0.5.0-beta',
    installId: '01890000-0000-7000-8000-000000000001',
    mode: 'compose' as const,
    createdAt: '2026-08-14T00:00:00.000Z',
  };

  it('is a no-op when the running version matches', () => {
    expect(() => assertVersionCompatible(marker, '0.5.0-beta')).not.toThrow();
  });

  it('refuses a running version older than the marker, naming both versions', () => {
    expect(() => assertVersionCompatible(marker, '0.4.0')).toThrow(/0\.5\.0-beta.*0\.4\.0/s);
  });

  it('refuses a running version newer than the marker, naming both versions', () => {
    expect(() => assertVersionCompatible(marker, '0.6.0')).toThrow(/0\.5\.0-beta.*0\.6\.0/s);
  });
});
