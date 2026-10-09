import type { ObjectStorageAdapter, StorageProfile } from '@copalibre/object-storage';
import type { InstalledModuleAsset } from '@copalibre/persistence';
import { evaluateCoreVersionCompatibility, verifyAssets } from './verify.js';

function installed(requiresCopalibre: string) {
  return { alias: 'football', version: '1.0.0', requiresCopalibre };
}

describe('evaluateCoreVersionCompatibility', () => {
  it('returns undefined when the version satisfies the declared range', () => {
    expect(evaluateCoreVersionCompatibility('2.3.0', installed('^2.0.0'))).toBeUndefined();
  });

  it('returns a core-version failure naming the range and the given version', () => {
    const failure = evaluateCoreVersionCompatibility('1.9.0', installed('^2.0.0'));
    expect(failure).toEqual({
      stage: 'core-version',
      message: 'requires CopaLibre ^2.0.0, but this installation runs 1.9.0',
    });
  });

  it('evaluates a target version the installation is not currently running', () => {
    // The same function call shape used for a pre-upgrade check: the version
    // passed in need not be the version currently installed.
    expect(evaluateCoreVersionCompatibility('3.0.0', installed('^2.0.0'))).toEqual({
      stage: 'core-version',
      message: 'requires CopaLibre ^2.0.0, but this installation runs 3.0.0',
    });
  });

  it('includes prereleases, matching the running-version check', () => {
    expect(
      evaluateCoreVersionCompatibility('2.0.0-beta.1', installed('^2.0.0-beta.0')),
    ).toBeUndefined();
  });
});

/** The smallest possible valid PNG: a real, parseable 1x1 transparent pixel. */
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);

function asset(path: string, storageBucket: string): InstalledModuleAsset {
  return {
    assetId: `a-${path}`,
    moduleId: 'm-1',
    path,
    kind: 'logo',
    contentType: 'image/png',
    sizeBytes: MINIMAL_PNG.byteLength,
    storageBucket,
    storageKey: `modules/rink-hockey/1.0.0/${path}`,
  };
}

function storage(profile: StorageProfile, present: readonly string[]): ObjectStorageAdapter {
  return {
    profile,
    put: async (key) => ({ key }),
    delete: async () => undefined,
    get: async ({ key }) => {
      if (!present.some((path) => key.endsWith(path))) throw new Error('NoSuchKey: secret-host');
      return { body: MINIMAL_PNG };
    },
  };
}

describe('verifyAssets', () => {
  it('passes when every asset is recorded under the active profile and readable', async () => {
    expect(await verifyAssets(storage('s3', ['logo.png']), [asset('logo.png', 's3')])).toEqual([]);
  });

  it('names the asset and both profiles when it was imported under another profile', async () => {
    const failures = await verifyAssets(storage('s3', ['logo.png']), [
      asset('logo.png', 'filesystem'),
    ]);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ stage: 'asset', field: 'logo.png' });
    expect(failures[0]?.message).toContain('"filesystem"');
    expect(failures[0]?.message).toContain('"s3"');
    expect(failures[0]?.message).toContain('add the module again');
  });

  it('reports a missing object as a failure instead of throwing', async () => {
    const failures = await verifyAssets(storage('s3', []), [asset('logo.png', 's3')]);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('logo.png');
    expect(failures[0]?.message).toContain('missing or unreadable');
    // The reason is the error's class, never its message, which can carry a host or a credential.
    expect(failures[0]?.message).not.toContain('secret-host');
  });

  it('continues past a failing asset and still validates the others', async () => {
    const failures = await verifyAssets(storage('s3', ['b.png']), [
      asset('a.png', 's3'),
      asset('b.png', 's3'),
      asset('c.png', 'filesystem'),
    ]);

    expect(failures.map((failure) => failure.field)).toEqual(['a.png', 'c.png']);
  });
});
