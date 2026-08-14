import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCredential, writeCredential } from './credentials.js';

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-credentials-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('credentials (0085)', () => {
  it('round-trips through write and read for the directory it was written into', async () => {
    await withTemporaryDirectory(async (directory) => {
      const written = await writeCredential(directory, 'https://copalibre.example', 'clpat_abc123');
      const read = await readCredential(directory);
      expect(read).toEqual(written);
      expect(written.apiUrl).toBe('https://copalibre.example');
      expect(written.token).toBe('clpat_abc123');
      expect(new Date(written.savedAt).toString()).not.toBe('Invalid Date');
    });
  });

  it('reads as undefined when no credential has been written into the directory', async () => {
    await withTemporaryDirectory(async (directory) => {
      expect(await readCredential(directory)).toBeUndefined();
    });
  });

  it('keeps distinct credentials for distinct directories', async () => {
    await withTemporaryDirectory(async (one) => {
      await withTemporaryDirectory(async (two) => {
        await writeCredential(one, 'https://one.example', 'clpat_one');
        await writeCredential(two, 'https://two.example', 'clpat_two');
        expect((await readCredential(one))?.token).toBe('clpat_one');
        expect((await readCredential(two))?.token).toBe('clpat_two');
      });
    });
  });

  it('replaces an existing credential in the same directory on re-write (unlike 0084s marker)', async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeCredential(directory, 'https://copalibre.example', 'clpat_old');
      await writeCredential(directory, 'https://copalibre.example', 'clpat_new');
      expect((await readCredential(directory))?.token).toBe('clpat_new');
    });
  });

  it('writes the credentials file with 0600 permissions', async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeCredential(directory, 'https://copalibre.example', 'clpat_abc123');
      const info = await stat(join(directory, '.copalibre', 'credentials.json'));
      expect(info.mode & 0o777).toBe(0o600);
    });
  });

  it('stores the raw token and the API URL it was validated against', async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeCredential(directory, 'https://copalibre.example', 'clpat_secret_value');
      const contents = await readFile(join(directory, '.copalibre', 'credentials.json'), 'utf8');
      expect(JSON.parse(contents)).toEqual({
        apiUrl: 'https://copalibre.example',
        token: 'clpat_secret_value',
        savedAt: expect.any(String),
      });
    });
  });

  it('lives alongside (not inside) 0084s installation marker, in the same .copalibre/ directory', async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeCredential(directory, 'https://copalibre.example', 'clpat_abc123');
      const files = await import('node:fs/promises').then((fs) =>
        fs.readdir(join(directory, '.copalibre')),
      );
      expect(files).toContain('credentials.json');
    });
  });
});
