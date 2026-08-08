import { CURATED_MODULE_REPOSITORY } from '@copalibre/module-distribution';
import { InstalledModuleRepository, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../packages/persistence/src/test-support/scratch-database.js';
import { moduleAdd } from './module-commands.js';

/**
 * Task 7.6: the `--source` allow-list gate (module-commands.ts's own
 * resolveSource, not module-distribution's import pipeline, which has no
 * concept of "curated vs. alternate" beyond recording whichever ModuleSource
 * it is given). Reuses the real curated repository's URL as a stand-in
 * "alternate" source — `--source` always means alternate regardless of which
 * URL it names, so this exercises the real gate without needing a second
 * hosted repository.
 */
describe('module add --source allow-list (integration)', () => {
  let scratch: ScratchDatabase;
  let db: Kysely<Database>;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('module-commands-source-allowlist');
    db = scratch.db;
  });

  afterAll(async () => {
    await scratch.drop();
  });

  function baseEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      DATABASE_URL: scratch.connectionString,
      COPALIBRE_MODULE_SOURCE_ALLOWLIST: '',
    };
  }

  it('refuses an alternate source that is not allow-listed, installing nothing', async () => {
    await expect(
      moduleAdd(
        ['orbital-frisbee', '--source', CURATED_MODULE_REPOSITORY.repositoryUrl],
        baseEnvironment(),
      ),
    ).rejects.toThrow(/not allow-listed/);

    const installed = await new InstalledModuleRepository(db).findByAlias('orbital-frisbee');
    expect(installed).toHaveLength(0);
  });

  it('installs an allow-listed alternate source, recording it as alternate', async () => {
    const environment = {
      ...baseEnvironment(),
      COPALIBRE_MODULE_SOURCE_ALLOWLIST: CURATED_MODULE_REPOSITORY.repositoryUrl,
    };

    const exitCode = await moduleAdd(
      ['orbital-frisbee', '--source', CURATED_MODULE_REPOSITORY.repositoryUrl],
      environment,
    );
    expect(exitCode).toBe(0);

    const installed = await new InstalledModuleRepository(db).findByAlias('orbital-frisbee');
    expect(installed).toHaveLength(1);
    expect(installed[0]?.sourceKind).toBe('alternate');
    expect(installed[0]?.sourceRepositoryUrl).toBe(CURATED_MODULE_REPOSITORY.repositoryUrl);
  });
});
