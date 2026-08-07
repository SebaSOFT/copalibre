import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CURATED_MODULE_REPOSITORY,
  ModuleFetchError,
  fetchModule,
  listPublishedVersions,
} from './fetch.js';

/**
 * Exercises fetch.ts's git I/O against the real curated repository (task
 * 5 built and tagged `orbital-frisbee@1.0.0`/`weekend-cup@1.0.0` there) — the
 * same real-infrastructure verification this repo's other integration
 * suites give a real PostgreSQL, given here to a real `git clone`. Requires
 * network access; skipped in the plain unit run via jest.config.cjs's
 * testPathIgnorePatterns.
 */
describe('fetchModule / listPublishedVersions (integration, real repository)', () => {
  const checkoutRoots: string[] = [];
  let workspaceDirectory: string;

  beforeAll(async () => {
    workspaceDirectory = await mkdtemp(join(tmpdir(), 'copalibre-module-fetch-test-'));
  });

  afterAll(async () => {
    await rm(workspaceDirectory, { recursive: true, force: true });
  });

  afterEach(async () => {
    await Promise.all(
      checkoutRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('lists the published versions of a real discipline module', async () => {
    const versions = await listPublishedVersions(CURATED_MODULE_REPOSITORY, 'orbital-frisbee');
    expect(versions).toContain('1.0.0');
  });

  it('lists the published versions of a real tournament-profile module', async () => {
    const versions = await listPublishedVersions(CURATED_MODULE_REPOSITORY, 'weekend-cup');
    expect(versions).toContain('1.0.0');
  });

  it('lists no versions for an alias nothing has ever published', async () => {
    const versions = await listPublishedVersions(
      CURATED_MODULE_REPOSITORY,
      'no-such-module-alias',
    );
    expect(versions).toEqual([]);
  });

  it('fetches and checks out a real discipline module by tag', async () => {
    const fetched = await fetchModule(
      CURATED_MODULE_REPOSITORY,
      'orbital-frisbee',
      undefined,
      workspaceDirectory,
    );
    checkoutRoots.push(fetched.checkoutRoot);

    expect(fetched.resolvedVersion).toBe('1.0.0');
    expect(fetched.directory.endsWith(join('disciplines', 'orbital-frisbee'))).toBe(true);
    await expect(access(join(fetched.directory, 'manifest.json'))).resolves.toBeUndefined();
    await expect(access(join(fetched.directory, 'artifact.json'))).resolves.toBeUndefined();
  });

  it('fetches and checks out a real tournament-profile module by tag', async () => {
    const fetched = await fetchModule(
      CURATED_MODULE_REPOSITORY,
      'weekend-cup',
      undefined,
      workspaceDirectory,
    );
    checkoutRoots.push(fetched.checkoutRoot);

    expect(fetched.resolvedVersion).toBe('1.0.0');
    expect(fetched.directory.endsWith(join('profiles', 'weekend-cup'))).toBe(true);
    await expect(access(join(fetched.directory, 'manifest.json'))).resolves.toBeUndefined();
  });

  it('rejects a version range no published version satisfies, leaving no checkout behind', async () => {
    await expect(
      fetchModule(CURATED_MODULE_REPOSITORY, 'orbital-frisbee', '^99.0.0', workspaceDirectory),
    ).rejects.toBeInstanceOf(ModuleFetchError);
  });

  it('rejects an alias nothing has ever published', async () => {
    await expect(
      fetchModule(CURATED_MODULE_REPOSITORY, 'no-such-module-alias', undefined, workspaceDirectory),
    ).rejects.toThrow(/No published version/);
  });
});
