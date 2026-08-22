import { loadDefaultModuleCatalogue, type ModuleCatalogue } from '@copalibre/module-catalogue';
import type {
  ObjectReference,
  ObjectStorageAdapter,
  StoredObject,
} from '@copalibre/object-storage';
import {
  AuditReader,
  newId,
  OrganizationRepository,
  OutboxReader,
  SYSTEM_ORGANIZATION,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../packages/persistence/src/test-support/scratch-database.js';
import { ReservedModuleAliasConflictError, seedModuleCatalogue } from './catalogue-seeder.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

describe('module catalogue seeding (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let catalogue: ModuleCatalogue;
  let storage: MemoryObjectStorage;

  beforeEach(async () => {
    scratch = await createMigratedDatabase('module-catalogue-seed');
    catalogue = await loadDefaultModuleCatalogue();
    storage = new MemoryObjectStorage();
  });

  afterEach(async () => {
    await scratch?.drop();
  });

  it('keeps catalogue tables empty when migrations run without the seed role', async () => {
    await expect(installedRows(scratch.db)).resolves.toEqual({
      descriptors: [],
      profiles: [],
      audit: 0,
    });
  });

  it('installs every module in a fresh installation with audit and outbox records', async () => {
    const report = await seedModuleCatalogue(scratch.db, catalogue, storage);
    const descriptors = await scratch.db.selectFrom('discipline_descriptors').selectAll().execute();
    const profiles = await scratch.db.selectFrom('tournament_profiles').selectAll().execute();
    const audit = new AuditReader(scratch.db);
    const outbox = new OutboxReader(scratch.db);

    expect(report.modules).toHaveLength(5);
    expect(report.modules.every((module) => module.status === 'installed')).toBe(true);
    expect(descriptors).toHaveLength(2);
    expect(profiles).toHaveLength(3);
    expect(storage.keys()).toEqual(catalogue.assets.map((asset) => asset.reference.key).sort());
    for (const descriptor of descriptors) {
      await expect(
        audit.historyFor('discipline-descriptor', descriptor.descriptor_id),
      ).resolves.toHaveLength(1);
      await expect(outbox.countFor(descriptor.descriptor_id)).resolves.toBe(1);
    }
    for (const profile of profiles) {
      await expect(
        audit.historyFor('tournament-profile', profile.profile_id),
      ).resolves.toHaveLength(1);
      await expect(outbox.countFor(profile.profile_id)).resolves.toBe(1);
    }
  });

  it('skips every installed alias/version without generating another identifier or audit record', async () => {
    await seedModuleCatalogue(scratch.db, catalogue, storage);
    const before = await installedRows(scratch.db);

    const second = await seedModuleCatalogue(scratch.db, catalogue, storage);
    const after = await installedRows(scratch.db);

    expect(second.modules.every((module) => module.status === 'skipped')).toBe(true);
    expect(after).toEqual(before);
    expect(storage.putCount).toBe(catalogue.assets.length);
  });

  it('installs a newer version beside its predecessor and keeps the pinned tournament resolvable', async () => {
    await seedModuleCatalogue(scratch.db, catalogue, storage);
    const tournaments = new TournamentRepository(scratch.db);
    const oldFootball = await tournaments.findDescriptorByAlias('football', '1.1.0');
    if (!oldFootball) throw new Error('Expected seeded football descriptor');

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'catalogue-tests',
        name: 'Catalogue tests',
        ...AUDIT,
      }),
    );
    const tournament = await withTransaction(scratch.db, async (uow) => {
      const created = await tournaments.create(uow, {
        organizationId: organization.organizationId,
        alias: 'football-archive',
        name: 'Football archive',
        descriptor: oldFootball,
        ...AUDIT,
      });
      await tournaments.createRuleset(uow, {
        tournamentId: created.tournamentId,
        organizationId: organization.organizationId,
        descriptor: oldFootball,
        overrides: {},
        ...AUDIT,
      });
      return created;
    });

    const newer = withNewerFootball(catalogue, '1.2.0');
    const report = await seedModuleCatalogue(scratch.db, newer, storage);
    const newFootball = await tournaments.findDescriptorByAlias('football', '1.2.0');
    const pinned = await tournaments.findById(tournament.tournamentId);

    expect(report.modules).toContainEqual({
      kind: 'discipline',
      alias: 'football',
      version: '1.2.0',
      status: 'installed',
    });
    expect(newFootball?.descriptorId).toBe(oldFootball.descriptorId);
    expect(pinned?.disciplineRef).toEqual({
      descriptorId: oldFootball.descriptorId,
      version: '1.1.0',
    });
    await expect(tournaments.findDescriptor(oldFootball.descriptorId, '1.1.0')).resolves.toEqual(
      oldFootball,
    );
  });

  it('keeps a tournament started before the foul/throw-in vocabulary on its frozen descriptor version (0115 task 3.3)', async () => {
    const preFoulCatalogue = withoutFoulVocabulary(catalogue, '1.0.0');
    await seedModuleCatalogue(scratch.db, preFoulCatalogue, storage);
    const tournaments = new TournamentRepository(scratch.db);
    const preFoulFootball = await tournaments.findDescriptorByAlias('football', '1.0.0');
    if (!preFoulFootball) throw new Error('Expected seeded pre-foul football descriptor');
    expect(preFoulFootball.eventDefinitions.map((definition) => definition.code)).not.toContain(
      'foul',
    );

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'catalogue-tests-pre-foul',
        name: 'Catalogue tests (pre-foul)',
        ...AUDIT,
      }),
    );
    const tournament = await withTransaction(scratch.db, (uow) =>
      tournaments.create(uow, {
        organizationId: organization.organizationId,
        alias: 'started-before-foul',
        name: 'Started before foul vocabulary',
        descriptor: preFoulFootball,
        ...AUDIT,
      }),
    );

    // 0094's module freeze: installing the real catalogue (foul/throw-in
    // included, at its real 1.1.0) alongside the pinned 1.0.0 must not touch
    // what the already-started tournament resolves to.
    await seedModuleCatalogue(scratch.db, catalogue, storage);
    const pinned = await tournaments.findById(tournament.tournamentId);
    expect(pinned?.disciplineRef).toEqual({
      descriptorId: preFoulFootball.descriptorId,
      version: '1.0.0',
    });
    const resolved = await tournaments.findDescriptor(preFoulFootball.descriptorId, '1.0.0');
    expect(resolved?.eventDefinitions.map((definition) => definition.code)).not.toEqual(
      expect.arrayContaining(['foul', 'throw-in']),
    );
  });

  it('does not overwrite an operator-edited installed document', async () => {
    await seedModuleCatalogue(scratch.db, catalogue, storage);
    const repository = new TournamentRepository(scratch.db);
    const installed = await repository.findDescriptorByAlias('football', '1.1.0');
    if (!installed) throw new Error('Expected seeded football descriptor');
    const edited = { ...installed, name: 'Locally edited football' };
    await scratch.db
      .updateTable('discipline_descriptors')
      .set({ document: JSON.stringify(edited) })
      .where('alias', '=', 'football')
      .where('version', '=', '1.1.0')
      .execute();

    await seedModuleCatalogue(scratch.db, catalogue, storage);

    await expect(repository.findDescriptorByAlias('football', '1.1.0')).resolves.toEqual(edited);
  });

  it('rejects one invalid document before writing any catalogue state', async () => {
    const invalid = {
      ...catalogue,
      disciplines: [{ ...catalogue.disciplines[0], alias: 'Invalid Alias' }],
    } as unknown as ModuleCatalogue;

    await expect(seedModuleCatalogue(scratch.db, invalid, storage)).rejects.toMatchObject({
      name: 'ModuleCatalogueValidationError',
      failures: expect.arrayContaining([
        expect.objectContaining({ document: 'disciplines/Invalid Alias.json', field: 'alias' }),
      ]),
    });
    await expect(installedRows(scratch.db)).resolves.toEqual({
      descriptors: [],
      profiles: [],
      audit: 0,
    });
  });

  it('refuses a reserved alias held by a different attribution without touching it', async () => {
    const repository = new TournamentRepository(scratch.db);
    const external = catalogue.disciplines.find((document) => document.alias === 'football');
    if (!external) throw new Error('Expected football catalogue document');
    await withTransaction(scratch.db, (uow) =>
      repository.saveDescriptor(
        uow,
        {
          ...external,
          descriptorId: newId(),
          version: '0.9.0',
          attribution: { author: 'Private module', licence: 'MIT' },
        },
        { organizationId: SYSTEM_ORGANIZATION, ...AUDIT },
      ),
    );
    const before = await installedRows(scratch.db);

    await expect(seedModuleCatalogue(scratch.db, catalogue, storage)).rejects.toBeInstanceOf(
      ReservedModuleAliasConflictError,
    );

    await expect(installedRows(scratch.db)).resolves.toEqual(before);
  });

  it('removes newly uploaded assets and writes no descriptors when an upload fails', async () => {
    const secondKey = catalogue.assets[1]?.reference.key;
    if (!secondKey) throw new Error('Expected at least two catalogue assets');
    storage.failPutKey = secondKey;

    await expect(seedModuleCatalogue(scratch.db, catalogue, storage)).rejects.toThrow(
      'simulated upload failure',
    );

    expect(storage.keys()).toEqual([]);
    await expect(installedRows(scratch.db)).resolves.toEqual({
      descriptors: [],
      profiles: [],
      audit: 0,
    });
  });
});

async function installedRows(db: Awaited<ReturnType<typeof createMigratedDatabase>>['db']) {
  const [descriptors, profiles, audit] = await Promise.all([
    db
      .selectFrom('discipline_descriptors')
      .select(['descriptor_id', 'alias', 'version', 'document'])
      .orderBy('alias')
      .orderBy('version')
      .execute(),
    db
      .selectFrom('tournament_profiles')
      .select(['profile_id', 'alias', 'version', 'document'])
      .orderBy('alias')
      .orderBy('version')
      .execute(),
    db
      .selectFrom('audit_log')
      .select((expression) => expression.fn.countAll<string>().as('count'))
      .executeTakeFirst(),
  ]);
  return { descriptors, profiles, audit: Number(audit?.count ?? 0) };
}

function withNewerFootball(catalogue: ModuleCatalogue, version: string): ModuleCatalogue {
  return withDisciplineVersion(catalogue, 'football', version);
}

/**
 * Simulates the football descriptor as it was before 0115: same document,
 * minus the foul/throw-in vocabulary and everything it alone introduced
 * (`foul-play-on`, `free-kick-awarded`, `penalty-awarded`, `throw-in-taken`,
 * `foul-throw`) — reused card/goal/substitution events stay, since those
 * predate 0115.
 */
const FOUL_VOCABULARY_CODES = new Set([
  'foul',
  'foul-play-on',
  'free-kick-awarded',
  'penalty-awarded',
  'throw-in',
  'throw-in-taken',
  'foul-throw',
]);

function withoutFoulVocabulary(catalogue: ModuleCatalogue, version: string): ModuleCatalogue {
  const versioned = withDisciplineVersion(catalogue, 'football', version);
  return {
    ...versioned,
    disciplines: versioned.disciplines.map((document) =>
      document.alias === 'football'
        ? {
            ...document,
            version,
            eventDefinitions: document.eventDefinitions.filter(
              (definition) => !FOUL_VOCABULARY_CODES.has(definition.code),
            ),
          }
        : document,
    ),
  };
}

function withDisciplineVersion(
  catalogue: ModuleCatalogue,
  alias: string,
  version: string,
): ModuleCatalogue {
  const document = catalogue.disciplines.find((candidate) => candidate.alias === alias);
  if (!document) throw new Error(`Expected ${alias} catalogue document`);
  const previousPrefix = `modules/${alias}/${document.version}/`;
  const nextPrefix = `modules/${alias}/${version}/`;
  return {
    ...catalogue,
    disciplines: catalogue.disciplines.map((candidate) =>
      candidate.alias === alias
        ? {
            ...candidate,
            version,
            images: candidate.images?.map((reference) => ({
              key: reference.key.replace(previousPrefix, nextPrefix),
            })),
          }
        : candidate,
    ),
    assets: catalogue.assets.map((asset) =>
      asset.reference.key.startsWith(previousPrefix)
        ? {
            ...asset,
            reference: { key: asset.reference.key.replace(previousPrefix, nextPrefix) },
          }
        : asset,
    ),
  };
}

class MemoryObjectStorage implements ObjectStorageAdapter {
  readonly profile = 'filesystem' as const;
  private readonly objects = new Map<string, StoredObject>();
  putCount = 0;
  failPutKey?: string;

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<ObjectReference> {
    if (key === this.failPutKey) throw new Error('simulated upload failure');
    this.putCount += 1;
    this.objects.set(key, { body, contentType });
    return { key };
  }

  async get(reference: ObjectReference): Promise<StoredObject> {
    const stored = this.objects.get(reference.key);
    if (!stored) throw Object.assign(new Error('missing object'), { code: 'ENOENT' });
    return stored;
  }

  async delete(reference: ObjectReference): Promise<void> {
    this.objects.delete(reference.key);
  }
}
