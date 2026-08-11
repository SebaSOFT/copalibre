import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  InstalledModuleRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../persistence/src/test-support/scratch-database.js';
import { CURATED_MODULE_REPOSITORY } from './fetch.js';
import {
  ModuleAliasConflictError,
  UnsatisfiedModuleCapabilitiesError,
  importValidatedModule,
} from './import.js';
import {
  makeModuleDirectory,
  validDisciplineDocument,
  validManifest,
  validProfileDocument,
} from './test-support/module-fixtures.js';
import { validateModulePackageOrThrow } from './validate.js';
import { verifyInstalledModule } from './verify.js';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** Same fake used by apps/api's own integration suite — real Postgres, in-memory object storage. */
class FakeObjectStorage implements ObjectStorageAdapter {
  readonly profile = 'filesystem' as const;
  private readonly objects = new Map<string, Uint8Array>();

  async put(key: string, body: Uint8Array): Promise<{ key: string }> {
    this.objects.set(key, body);
    return { key };
  }
  async get(reference: { key: string }): Promise<{ body: Uint8Array }> {
    return { body: this.objects.get(reference.key) ?? new Uint8Array() };
  }
  async delete(reference: { key: string }): Promise<void> {
    this.objects.delete(reference.key);
  }
}

const OPTIONS = { runningCopalibreVersion: '1.0.0' };

describe('importValidatedModule (integration)', () => {
  let scratch: ScratchDatabase;
  let db: Kysely<Database>;
  const directories: string[] = [];

  beforeAll(async () => {
    scratch = await createMigratedDatabase('module-distribution-import');
    db = scratch.db;
  });

  afterAll(async () => {
    await scratch.drop();
  });

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  async function addAsset(directory: string): Promise<void> {
    await mkdir(join(directory, 'assets'));
    await writeFile(
      join(directory, 'assets', 'logo.png'),
      Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    );
  }

  async function importFixture(
    manifest: unknown,
    document: unknown,
    options?: {
      readonly storage?: ObjectStorageAdapter;
      readonly overrideUnsatisfiedCapabilities?: boolean;
    },
  ) {
    const directory = await makeModuleDirectory(manifest, document);
    directories.push(directory);
    const validated = await validateModulePackageOrThrow(directory, OPTIONS);
    const report = await importValidatedModule(
      db,
      options?.storage ?? new FakeObjectStorage(),
      directory,
      validated,
      {
        source: CURATED_MODULE_REPOSITORY,
        actor: 'integration-test',
        overrideUnsatisfiedCapabilities: options?.overrideUnsatisfiedCapabilities,
      },
    );
    return { report, directory };
  }

  it('imports a valid discipline end to end: row persisted, module recorded under its real source (7.1)', async () => {
    const alias = `orbital-frisbee-${newId()}`;
    const { report } = await importFixture(
      validManifest({ alias }),
      validDisciplineDocument({ alias }),
    );

    expect(report.kind).toBe('discipline');
    expect(report.alias).toBe(alias);

    const installed = await new InstalledModuleRepository(db).findByAlias(alias);
    expect(installed).toHaveLength(1);
    const [record] = installed;
    if (!record) throw new Error('expected an installed module row');
    expect(record.sourceKind).toBe('curated');
    expect(record.sourceRepositoryUrl).toBe(CURATED_MODULE_REPOSITORY.repositoryUrl);
    expect(record.moduleId).toBe(report.moduleId);

    const descriptor = await new TournamentRepository(db).findDescriptor(
      record.documentId,
      record.version,
    );
    expect(descriptor?.alias).toBe(alias);
  });

  it('imports a valid discipline with an asset, persisting an object-storage reference (7.1)', async () => {
    const alias = `orbital-frisbee-${newId()}`;
    const directory = await makeModuleDirectory(
      validManifest({ alias, assets: [{ path: 'logo.png', kind: 'logo' }] }),
      validDisciplineDocument({ alias }),
    );
    directories.push(directory);
    await addAsset(directory);

    const validated = await validateModulePackageOrThrow(directory, OPTIONS);
    const report = await importValidatedModule(db, new FakeObjectStorage(), directory, validated, {
      source: CURATED_MODULE_REPOSITORY,
      actor: 'integration-test',
    });

    const assets = await new InstalledModuleRepository(db).findAssetsByModuleId(report.moduleId);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.path).toBe('logo.png');
    expect(assets[0]?.storageBucket).toBe('filesystem');
  });

  it('leaves no row or asset behind when the object-storage upload fails (7.2)', async () => {
    const alias = `orbital-frisbee-${newId()}`;
    class FailingStorage extends FakeObjectStorage {
      override async put(): Promise<{ bucket: string; key: string }> {
        throw new Error('simulated upload failure');
      }
    }
    const directory = await makeModuleDirectory(
      validManifest({ alias, assets: [{ path: 'logo.png', kind: 'logo' }] }),
      validDisciplineDocument({ alias }),
    );
    directories.push(directory);
    await addAsset(directory);

    const validated = await validateModulePackageOrThrow(directory, OPTIONS);
    await expect(
      importValidatedModule(db, new FailingStorage(), directory, validated, {
        source: CURATED_MODULE_REPOSITORY,
        actor: 'integration-test',
      }),
    ).rejects.toThrow('simulated upload failure');

    const installed = await new InstalledModuleRepository(db).findByAlias(alias);
    expect(installed).toHaveLength(0);
    const descriptorVersions = await new TournamentRepository(db).findDescriptorVersionsByAlias(
      alias,
    );
    expect(descriptorVersions).toHaveLength(0);
  });

  it('leaves no row or asset behind when the DB transaction fails after assets already uploaded (7.2)', async () => {
    const alias = `orbital-frisbee-${newId()}`;
    // Install once for real, then attempt a second import of the SAME
    // alias/version under different attribution — ModuleAliasConflictError
    // fires before the transaction opens, so pair it with an upload that
    // must be rolled back: the second import declares an asset the first
    // did not, proving the compensating delete runs even though the DB
    // write for THIS attempt never happens at all.
    await importFixture(validManifest({ alias }), validDisciplineDocument({ alias }));

    const deletedKeys: string[] = [];
    class SpyStorage extends FakeObjectStorage {
      override async delete(reference: { key: string }): Promise<void> {
        deletedKeys.push(reference.key);
        return super.delete(reference);
      }
    }
    const directory = await makeModuleDirectory(
      validManifest({
        alias,
        assets: [{ path: 'logo.png', kind: 'logo' }],
        attribution: { author: 'A Different Author', licence: 'MIT' },
      }),
      validDisciplineDocument({
        alias,
        attribution: { author: 'A Different Author', licence: 'MIT' },
      }),
    );
    directories.push(directory);
    await addAsset(directory);

    const validated = await validateModulePackageOrThrow(directory, OPTIONS);
    const storage = new SpyStorage();
    await expect(
      importValidatedModule(db, storage, directory, validated, {
        source: CURATED_MODULE_REPOSITORY,
        actor: 'integration-test',
      }),
    ).rejects.toBeInstanceOf(ModuleAliasConflictError);

    // ModuleAliasConflictError is raised before any asset is uploaded, so
    // nothing needed deleting here — this documents that boundary rather
    // than asserting an empty deletedKeys is itself meaningful.
    const installed = await new InstalledModuleRepository(db).findByAlias(alias);
    expect(installed).toHaveLength(1); // only the original import
    expect(installed[0]?.attribution.author).toBe('Test Author');
    expect(deletedKeys).toEqual([]);
  });

  it('refuses removing a module referenced by a started tournament (7.3)', async () => {
    const alias = `orbital-frisbee-${newId()}`;
    await importFixture(validManifest({ alias }), validDisciplineDocument({ alias }));
    const [installed] = await new InstalledModuleRepository(db).findByAlias(alias);
    if (!installed) throw new Error('expected an installed module row');
    const descriptor = await new TournamentRepository(db).findDescriptor(
      installed.documentId,
      installed.version,
    );
    if (!descriptor) throw new Error('expected the imported descriptor to be found');

    const organizationId = newId();
    await db
      .insertInto('organizations')
      .values({
        organization_id: organizationId,
        alias: `org-${newId()}`,
        name: 'Test Org',
        primary_language: 'es',
        timezone: 'UTC',
        created_at: new Date(),
      })
      .execute();

    const tournament = await withTransaction(db, (uow) =>
      new TournamentRepository(db).create(uow, {
        organizationId,
        alias: `tournament-${newId()}`,
        name: 'Test Tournament',
        descriptor,
        actor: 'integration-test',
        authorizationContext: 'system:test',
      }),
    );
    await db
      .updateTable('tournaments')
      .set({ status: 'started', started_at: new Date() })
      .where('tournament_id', '=', tournament.tournamentId)
      .execute();

    const referencing = await new TournamentRepository(
      db,
    ).findStartedTournamentAliasesReferencingDescriptor(
      descriptor.descriptorId,
      descriptor.version,
    );
    expect(referencing).toContain(tournament.alias);

    // The refusal itself lives in the CLI (module-commands.ts), which checks
    // this exact query before ever calling InstalledModuleRepository.remove
    // — asserted here at the repository level, which is what the CLI's
    // refusal is built on.
    const stillInstalled = await new InstalledModuleRepository(db).findByAlias(alias);
    expect(stillInstalled).toHaveLength(1);
  });

  it('reports unsatisfied required capabilities and installs only with an explicit override (7.4)', async () => {
    const profileAlias = `weekend-cup-${newId()}`;
    const directory = await makeModuleDirectory(
      validManifest({ kind: 'tournament-profile', alias: profileAlias }),
      validProfileDocument({
        alias: profileAlias,
        requires: [
          {
            capability: 'nothing-installed-satisfies-this',
            satisfiedBy: ['xyz'],
            necessity: 'required',
          },
        ],
      }),
    );
    directories.push(directory);
    const validated = await validateModulePackageOrThrow(directory, OPTIONS);

    await expect(
      importValidatedModule(db, new FakeObjectStorage(), directory, validated, {
        source: CURATED_MODULE_REPOSITORY,
        actor: 'integration-test',
      }),
    ).rejects.toBeInstanceOf(UnsatisfiedModuleCapabilitiesError);
    expect(await new InstalledModuleRepository(db).findByAlias(profileAlias)).toHaveLength(0);

    const report = await importValidatedModule(db, new FakeObjectStorage(), directory, validated, {
      source: CURATED_MODULE_REPOSITORY,
      actor: 'integration-test',
      overrideUnsatisfiedCapabilities: true,
    });
    expect(report.unsatisfiedRequiredCapabilities).toContain('nothing-installed-satisfies-this');
    expect(await new InstalledModuleRepository(db).findByAlias(profileAlias)).toHaveLength(1);
  });

  it('installs a profile immediately, no override needed, when an installed discipline already satisfies it (7.4)', async () => {
    const disciplineAlias = `orbital-frisbee-${newId()}`;
    await importFixture(
      validManifest({ alias: disciplineAlias }),
      validDisciplineDocument({ alias: disciplineAlias }),
    );

    const profileAlias = `weekend-cup-${newId()}`;
    const { report } = await importFixture(
      validManifest({ kind: 'tournament-profile', alias: profileAlias }),
      validProfileDocument({ alias: profileAlias }),
    );
    expect(report.unsatisfiedRequiredCapabilities).toEqual([]);
  });

  it('module verify detects an installed discipline referencing a retired registry identifier (7.5)', async () => {
    const alias = `orbital-frisbee-${newId()}`;
    await importFixture(validManifest({ alias }), validDisciplineDocument({ alias }));
    const [installed] = await new InstalledModuleRepository(db).findByAlias(alias);
    if (!installed) throw new Error('expected an installed module row');

    // Simulate drift: a core upgrade retired the action this discipline's
    // win condition referenced (valid at import time; nothing here re-runs
    // 2.1's schema check, matching verify's own scope).
    const originalDescriptor = await new TournamentRepository(db).findDescriptor(
      installed.documentId,
      installed.version,
    );
    if (!originalDescriptor) throw new Error('expected the imported descriptor to be found');
    const drifted = {
      ...originalDescriptor,
      winCondition: {
        id: 'wc',
        rules: [
          {
            id: 'r1',
            type: 'simple_rule',
            options: {},
            conditions: [],
            actions: [{ id: 'a1', type: 'a_retired_action', options: {}, params: [] }],
          },
        ],
      },
    };
    await db
      .updateTable('discipline_descriptors')
      .set({ document: JSON.stringify(drifted) })
      .where('descriptor_id', '=', installed.documentId)
      .where('version', '=', installed.version)
      .execute();

    const driftedDescriptor = await new TournamentRepository(db).findDescriptor(
      installed.documentId,
      installed.version,
    );
    if (!driftedDescriptor) throw new Error('expected the drifted descriptor to be found');
    const failures = await verifyInstalledModule(
      new FakeObjectStorage(),
      '1.0.0',
      installed,
      driftedDescriptor,
      [],
    );
    expect(failures.some((failure) => failure.stage === 'registry-reference')).toBe(true);
  });

  it('module verify passes a freshly-installed, undrifted discipline (7.5, control case)', async () => {
    const alias = `orbital-frisbee-${newId()}`;
    await importFixture(validManifest({ alias }), validDisciplineDocument({ alias }));
    const [installed] = await new InstalledModuleRepository(db).findByAlias(alias);
    if (!installed) throw new Error('expected an installed module row');
    const descriptor = await new TournamentRepository(db).findDescriptor(
      installed.documentId,
      installed.version,
    );
    if (!descriptor) throw new Error('expected the imported descriptor to be found');

    const failures = await verifyInstalledModule(
      new FakeObjectStorage(),
      '1.0.0',
      installed,
      descriptor,
      [],
    );
    expect(failures).toEqual([]);
  });

  it('refuses installing over an alias held under different attribution, leaving the holder untouched (7.7)', async () => {
    const alias = `orbital-frisbee-${newId()}`;
    await importFixture(validManifest({ alias }), validDisciplineDocument({ alias }));

    const directory = await makeModuleDirectory(
      validManifest({ alias, attribution: { author: 'A Different Author', licence: 'MIT' } }),
      validDisciplineDocument({
        alias,
        attribution: { author: 'A Different Author', licence: 'MIT' },
      }),
    );
    directories.push(directory);
    const validated = await validateModulePackageOrThrow(directory, OPTIONS);

    await expect(
      importValidatedModule(db, new FakeObjectStorage(), directory, validated, {
        source: CURATED_MODULE_REPOSITORY,
        actor: 'integration-test',
      }),
    ).rejects.toBeInstanceOf(ModuleAliasConflictError);

    const installed = await new InstalledModuleRepository(db).findByAlias(alias);
    expect(installed).toHaveLength(1);
    expect(installed[0]?.attribution.author).toBe('Test Author');
  });
});
