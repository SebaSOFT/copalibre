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

  it('lists published versions for newly added tournament profile modules', async () => {
    const profiles = [
      'double-elimination-bracket',
      'heats-and-finals',
      'open-grand-prix',
      'esports-gsl-groups-to-playoffs',
      'single-leg-league',
      'ice-hockey-three-point-cup',
      'rugby-bonus-point-championship',
      'cricket-championship-cup',
      'baseball-pool-playoff',
      'arena-ffa-deathmatch',
    ];
    const results = await Promise.all(
      profiles.map(async (alias) => {
        const versions = await listPublishedVersions(CURATED_MODULE_REPOSITORY, alias);
        return { alias, versions };
      }),
    );
    for (const { versions } of results) {
      expect(versions).toContain('1.0.0');
    }
  }, 30_000);

  it('lists no versions for an alias nothing has ever published', async () => {
    const versions = await listPublishedVersions(CURATED_MODULE_REPOSITORY, 'no-such-module-alias');
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
  }, 30_000);

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
    await expect(access(join(fetched.directory, 'artifact.json'))).resolves.toBeUndefined();
  }, 30_000);

  it('fetches and checks out newly published tournament profiles (double-elimination and heats)', async () => {
    const doubleElim = await fetchModule(
      CURATED_MODULE_REPOSITORY,
      'double-elimination-bracket',
      undefined,
      workspaceDirectory,
    );
    checkoutRoots.push(doubleElim.checkoutRoot);
    expect(doubleElim.resolvedVersion).toBe('1.0.0');
    expect(doubleElim.directory.endsWith(join('profiles', 'double-elimination-bracket'))).toBe(
      true,
    );
    await expect(access(join(doubleElim.directory, 'manifest.json'))).resolves.toBeUndefined();
    await expect(access(join(doubleElim.directory, 'artifact.json'))).resolves.toBeUndefined();

    const heats = await fetchModule(
      CURATED_MODULE_REPOSITORY,
      'heats-and-finals',
      undefined,
      workspaceDirectory,
    );
    checkoutRoots.push(heats.checkoutRoot);
    expect(heats.resolvedVersion).toBe('1.0.0');
    expect(heats.directory.endsWith(join('profiles', 'heats-and-finals'))).toBe(true);
    await expect(access(join(heats.directory, 'manifest.json'))).resolves.toBeUndefined();
    await expect(access(join(heats.directory, 'artifact.json'))).resolves.toBeUndefined();
  }, 30_000);

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
