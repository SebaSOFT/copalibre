import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilesystemAdapter, UnsafeObjectKeyError } from './filesystem-profile.js';
import { describeObjectStorageAdapterContract } from './test-support/adapter-contract-suite.js';

describe('createFilesystemAdapter', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  async function makeRoot(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'copalibre-object-storage-fs-'));
    directories.push(directory);
    return directory;
  }

  describeObjectStorageAdapterContract('filesystem', async () => {
    const rootDirectory = await makeRoot();
    return createFilesystemAdapter({ profile: 'filesystem', rootDirectory });
  });

  it('creates nested directories implied by a key', async () => {
    const rootDirectory = await makeRoot();
    const adapter = createFilesystemAdapter({ profile: 'filesystem', rootDirectory });

    const reference = await adapter.put(
      'a/b/c/nested.txt',
      new TextEncoder().encode('nested'),
      'text/plain',
    );
    expect(new TextDecoder().decode((await adapter.get(reference)).body)).toBe('nested');
  });

  it('rejects a key that escapes the configured root', async () => {
    const rootDirectory = await makeRoot();
    const adapter = createFilesystemAdapter({ profile: 'filesystem', rootDirectory });

    await expect(
      adapter.put('../escape.txt', new TextEncoder().encode('x'), 'text/plain'),
    ).rejects.toBeInstanceOf(UnsafeObjectKeyError);
  });

  it('rejects a deeply nested traversal key', async () => {
    const rootDirectory = await makeRoot();
    const adapter = createFilesystemAdapter({ profile: 'filesystem', rootDirectory });

    await expect(
      adapter.put('a/../../escape.txt', new TextEncoder().encode('x'), 'text/plain'),
    ).rejects.toBeInstanceOf(UnsafeObjectKeyError);
  });

  it('delete is a no-op for a key that was never stored', async () => {
    const rootDirectory = await makeRoot();
    const adapter = createFilesystemAdapter({ profile: 'filesystem', rootDirectory });

    await expect(adapter.delete({ key: 'never-stored.txt' })).resolves.toBeUndefined();
  });

  it('inspects nested stored objects without following symlinks outside storage', async () => {
    const rootDirectory = await makeRoot();
    const adapter = createFilesystemAdapter({ profile: 'filesystem', rootDirectory });
    const inspect = adapter.inspect;
    if (!inspect) throw new Error('inspect required');
    await adapter.put('a/b/one', new Uint8Array(3), 'application/octet-stream');
    await adapter.put('two', new Uint8Array(5), 'application/octet-stream');
    await symlink(tmpdir(), join(rootDirectory, 'outside'));
    await expect(inspect(new AbortController().signal)).resolves.toEqual({
      totalObjects: 2,
      totalBytes: 8,
    });
  });

  it('initializes an empty storage root and honors cancellation', async () => {
    const rootDirectory = join(await makeRoot(), 'new');
    const adapter = createFilesystemAdapter({ profile: 'filesystem', rootDirectory });
    const inspect = adapter.inspect;
    if (!inspect) throw new Error('inspect required');
    await expect(inspect(new AbortController().signal)).resolves.toEqual({
      totalObjects: 0,
      totalBytes: 0,
    });
    await expect(inspect(AbortSignal.abort())).rejects.toThrow();
  });
});
