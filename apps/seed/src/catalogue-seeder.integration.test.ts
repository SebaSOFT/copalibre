import { loadDefaultModuleCatalogue, type ModuleCatalogue } from '@copalibre/module-catalogue';
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

  beforeEach(async () => {
    scratch = await createMigratedDatabase('module-catalogue-seed');
    catalogue = await loadDefaultModuleCatalogue();
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
    const report = await seedModuleCatalogue(scratch.db, catalogue);
    const descriptors = await scratch.db.selectFrom('discipline_descriptors').selectAll().execute();
    const profiles = await scratch.db.selectFrom('tournament_profiles').selectAll().execute();
    const audit = new AuditReader(scratch.db);
    const outbox = new OutboxReader(scratch.db);

    expect(report.modules).toHaveLength(5);
    expect(report.modules.every((module) => module.status === 'installed')).toBe(true);
    expect(descriptors).toHaveLength(2);
    expect(profiles).toHaveLength(3);
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
    await seedModuleCatalogue(scratch.db, catalogue);
    const before = await installedRows(scratch.db);

    const second = await seedModuleCatalogue(scratch.db, catalogue);
    const after = await installedRows(scratch.db);

    expect(second.modules.every((module) => module.status === 'skipped')).toBe(true);
    expect(after).toEqual(before);
  });

  it('installs a newer version beside its predecessor and keeps the pinned tournament resolvable', async () => {
    await seedModuleCatalogue(scratch.db, catalogue);
    const tournaments = new TournamentRepository(scratch.db);
    const oldFootball = await tournaments.findDescriptorByAlias('football', '1.0.0');
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

    const newer = withNewerFootball(catalogue, '1.1.0');
    const report = await seedModuleCatalogue(scratch.db, newer);
    const newFootball = await tournaments.findDescriptorByAlias('football', '1.1.0');
    const pinned = await tournaments.findById(tournament.tournamentId);

    expect(report.modules).toContainEqual({
      kind: 'discipline',
      alias: 'football',
      version: '1.1.0',
      status: 'installed',
    });
    expect(newFootball?.descriptorId).toBe(oldFootball.descriptorId);
    expect(pinned?.disciplineRef).toEqual({
      descriptorId: oldFootball.descriptorId,
      version: '1.0.0',
    });
    await expect(tournaments.findDescriptor(oldFootball.descriptorId, '1.0.0')).resolves.toEqual(
      oldFootball,
    );
  });

  it('does not overwrite an operator-edited installed document', async () => {
    await seedModuleCatalogue(scratch.db, catalogue);
    const repository = new TournamentRepository(scratch.db);
    const installed = await repository.findDescriptorByAlias('football', '1.0.0');
    if (!installed) throw new Error('Expected seeded football descriptor');
    const edited = { ...installed, name: 'Locally edited football' };
    await scratch.db
      .updateTable('discipline_descriptors')
      .set({ document: JSON.stringify(edited) })
      .where('alias', '=', 'football')
      .where('version', '=', '1.0.0')
      .execute();

    await seedModuleCatalogue(scratch.db, catalogue);

    await expect(repository.findDescriptorByAlias('football', '1.0.0')).resolves.toEqual(edited);
  });

  it('rejects one invalid document before writing any catalogue state', async () => {
    const invalid = {
      ...catalogue,
      disciplines: [{ ...catalogue.disciplines[0], alias: 'Invalid Alias' }],
    } as unknown as ModuleCatalogue;

    await expect(seedModuleCatalogue(scratch.db, invalid)).rejects.toMatchObject({
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

    await expect(seedModuleCatalogue(scratch.db, catalogue)).rejects.toBeInstanceOf(
      ReservedModuleAliasConflictError,
    );

    await expect(installedRows(scratch.db)).resolves.toEqual(before);
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
  return {
    ...catalogue,
    disciplines: catalogue.disciplines.map((document) =>
      document.alias === 'football' ? { ...document, version } : document,
    ),
  };
}
