import { InvariantViolationError, OrganizationRepository, withTransaction } from '../index.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

describe('organization primary language and timezone (integration)', () => {
  let scratch: ScratchDatabase;
  let organizations: OrganizationRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('org-locale');
    organizations = new OrganizationRepository(scratch.db);
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('defaults to Spanish and UTC when not specified', async () => {
    const organization = await withTransaction(scratch.db, (uow) =>
      organizations.create(uow, { alias: 'liga-default', name: 'Liga Default', ...AUDIT }),
    );
    expect(organization.primaryLanguage).toBe('es');
    expect(organization.timezone).toBe('UTC');
  });

  it('accepts an explicit primary language and timezone at creation', async () => {
    const organization = await withTransaction(scratch.db, (uow) =>
      organizations.create(uow, {
        alias: 'liga-explicit',
        name: 'Liga Explicit',
        primaryLanguage: 'de',
        timezone: 'Europe/Berlin',
        ...AUDIT,
      }),
    );
    expect(organization.primaryLanguage).toBe('de');
    expect(organization.timezone).toBe('Europe/Berlin');
  });

  it('rejects an unsupported primary language at creation', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        organizations.create(uow, {
          alias: 'liga-bad-language',
          name: 'Liga Bad Language',
          primaryLanguage: 'ja',
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('rejects an invalid IANA timezone at creation', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        organizations.create(uow, {
          alias: 'liga-bad-timezone',
          name: 'Liga Bad Timezone',
          timezone: 'Not/A_Zone',
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('updates only the fields supplied, leaving the other unchanged', async () => {
    const organization = await withTransaction(scratch.db, (uow) =>
      organizations.create(uow, {
        alias: 'liga-update',
        name: 'Liga Update',
        primaryLanguage: 'fr',
        timezone: 'Europe/Paris',
        ...AUDIT,
      }),
    );

    const updated = await withTransaction(scratch.db, (uow) =>
      organizations.updateSettings(uow, organization.organizationId, {
        primaryLanguage: 'it',
        ...AUDIT,
      }),
    );
    expect(updated.primaryLanguage).toBe('it');
    expect(updated.timezone).toBe('Europe/Paris');

    const other = await withTransaction(scratch.db, (uow) =>
      organizations.create(uow, { alias: 'liga-untouched', name: 'Liga Untouched', ...AUDIT }),
    );
    expect(other.primaryLanguage).toBe('es');
  });

  it('rejects an invalid timezone on update without changing the stored value', async () => {
    const organization = await withTransaction(scratch.db, (uow) =>
      organizations.create(uow, {
        alias: 'liga-update-reject',
        name: 'Liga Update Reject',
        timezone: 'America/Argentina/San_Juan',
        ...AUDIT,
      }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        organizations.updateSettings(uow, organization.organizationId, {
          timezone: 'Not/A_Zone',
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);

    const unchanged = await organizations.findById(organization.organizationId);
    expect(unchanged?.timezone).toBe('America/Argentina/San_Juan');
  });
});
