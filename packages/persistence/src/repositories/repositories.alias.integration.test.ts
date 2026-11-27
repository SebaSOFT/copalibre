import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { OrganizationRepository } from './organization-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { AliasRepository } from './alias-repository.js';
import { AUDIT } from './repositories.integration-fixtures.js';

describe('alias redirects (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let otherOrganizationId: string;

  const AUDIT = { actor: 'user:admin', authorizationContext: 'scope:organization.write' };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('alias-redirects');
    const organizations = new OrganizationRepository(scratch.db);
    const [first, second] = await Promise.all([
      withTransaction(scratch.db, (uow) =>
        organizations.create(uow, { alias: 'liga-uno', name: 'Liga Uno', ...AUDIT }),
      ),
      withTransaction(scratch.db, (uow) =>
        organizations.create(uow, { alias: 'liga-dos', name: 'Liga Dos', ...AUDIT }),
      ),
    ]);
    organizationId = first.organizationId;
    otherOrganizationId = second.organizationId;

    for (const [orgId, alias] of [
      [organizationId, 'clausura-2026'],
      [otherOrganizationId, 'otra-cosa'],
    ] as const) {
      await scratch.db
        .insertInto('tournaments')
        .values({
          tournament_id: newId(),
          organization_id: orgId,
          alias,
          name: alias,
          descriptor_id: newId(),
          descriptor_version: '1.0.0',
          ruleset_id: null,
          status: 'draft',
          started_at: null,
          profile_id: null,
          profile_version: null,
          created_at: new Date(),
        })
        .execute();
    }
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('redirects a renamed alias to the canonical one', async () => {
    const aliases = new AliasRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      aliases.recordRename(uow, {
        organizationId,
        scope: 'tournament',
        oldAlias: 'apertura-2026',
        newAlias: 'clausura-2026',
        ...AUDIT,
      }),
    );

    expect(await aliases.resolveTournamentAlias(organizationId, 'apertura-2026')).toEqual({
      kind: 'redirect',
      to: 'clausura-2026',
      status: 301,
    });
    expect(await aliases.resolveTournamentAlias(organizationId, 'clausura-2026')).toEqual({
      kind: 'current',
    });
  });

  it('never resolves one organization’s old alias inside another', async () => {
    const aliases = new AliasRepository(scratch.db);

    // Crossing them would hand a spectator somebody else's competition.
    expect(await aliases.resolveTournamentAlias(otherOrganizationId, 'apertura-2026')).toEqual({
      kind: 'unknown',
    });
  });

  it('reports an alias nobody ever had as unknown, not as a near match', async () => {
    const aliases = new AliasRepository(scratch.db);

    expect(await aliases.resolveTournamentAlias(organizationId, 'clausura-2027')).toEqual({
      kind: 'unknown',
    });
  });
});

describe('club alias renames (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let otherOrganizationId: string;
  let participants: EnrollmentRepository;
  let aliases: AliasRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('club-alias-renames');
    const organizations = new OrganizationRepository(scratch.db);
    participants = new EnrollmentRepository(scratch.db);
    aliases = new AliasRepository(scratch.db);
    organizationId = (
      await withTransaction(scratch.db, (uow) =>
        organizations.create(uow, { alias: 'liga-clubes', name: 'Liga Clubes', ...AUDIT }),
      )
    ).organizationId;
    otherOrganizationId = (
      await withTransaction(scratch.db, (uow) =>
        organizations.create(uow, { alias: 'otra-liga', name: 'Otra Liga', ...AUDIT }),
      )
    ).organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function createClub(orgId: string, name: string, alias?: string) {
    return withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, {
        organizationId: orgId,
        name,
        ...(alias === undefined ? {} : { alias }),
        ...AUDIT,
      }),
    );
  }

  async function freshOrganization(alias: string): Promise<string> {
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, { alias, name: alias, ...AUDIT }),
    );
    return organization.organizationId;
  }

  async function renameClub(clubId: string, orgId: string, alias: string) {
    return withTransaction(scratch.db, (uow) =>
      participants.updateClub(uow, { clubId, organizationId: orgId, alias, ...AUDIT }),
    );
  }

  async function clubRedirects(orgId: string) {
    return scratch.db
      .selectFrom('alias_redirects')
      .select(['old_alias', 'new_alias'])
      .where('organization_id', '=', orgId)
      .where('scope', '=', 'club')
      .orderBy('old_alias')
      .execute();
  }

  it('records the old alias when a club alias changes, with an audit record', async () => {
    const club = await createClub(organizationId, 'Club Hispano', 'club-hispano');
    await renameClub(club.clubId, organizationId, 'hispano');

    expect((await aliases.clubFormerAliases(organizationId)).get('hispano')).toEqual([
      'club-hispano',
    ]);
    const audit = await scratch.db
      .selectFrom('audit_log')
      .select(['action', 'resulting_state'])
      .where('organization_id', '=', organizationId)
      .where('action', '=', 'alias.renamed')
      .execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.resulting_state).toMatchObject({
      scope: 'club',
      from: 'club-hispano',
      to: 'hispano',
    });
  });

  it('records nothing when the same alias is saved again', async () => {
    const club = await createClub(organizationId, 'Club Mismo', 'club-mismo');
    await renameClub(club.clubId, organizationId, 'club-mismo');

    expect((await clubRedirects(organizationId)).map((row) => row.old_alias)).not.toContain(
      'club-mismo',
    );
  });

  it('records nothing when a club whose name folds to nothing is created', async () => {
    // The name has no Latin character, so the suggestion falls back to `club-<n>`. Being given its
    // first alias is not a rename, so no redirect is written. The backfill's own no-history rule is
    // covered by the migration integration test.
    const before = await clubRedirects(organizationId);

    const club = await createClub(organizationId, '北京俱乐部');

    expect(club.alias).toBe('club-1');
    expect(await clubRedirects(organizationId)).toEqual(before);
  });

  it('refuses an explicit club alias another club of the organization already holds', async () => {
    const organizationIdFresh = await freshOrganization('liga-alias-taken');
    const first = await createClub(organizationIdFresh, 'Club Uno', 'uno-alias');
    await expect(createClub(organizationIdFresh, 'Club Dos', 'uno-alias')).rejects.toThrow(
      InvariantViolationError,
    );
    const second = await createClub(organizationIdFresh, 'Club Tres', 'tres-alias');
    await expect(renameClub(second.clubId, organizationIdFresh, 'uno-alias')).rejects.toThrow(
      InvariantViolationError,
    );
    // A club keeps its own alias.
    await expect(renameClub(first.clubId, organizationIdFresh, 'uno-alias')).resolves.toMatchObject(
      { alias: 'uno-alias' },
    );
  });

  it('suggests past a former club alias, so the old link never opens another club', async () => {
    const organizationIdFresh = await freshOrganization('liga-former-alias');
    const club = await createClub(organizationIdFresh, 'Alfa', 'club-1');
    await renameClub(club.clubId, organizationIdFresh, 'atenas');

    const suggested = await createClub(organizationIdFresh, '北京俱乐部');

    expect(suggested.alias).toBe('club-2');
  });

  it('refuses to clear a club alias', async () => {
    const club = await createClub(organizationId, 'Lomas de Zamora', 'lomas-zamora');

    await expect(renameClub(club.clubId, organizationId, '')).rejects.toThrow(
      InvariantViolationError,
    );
    await expect(renameClub(club.clubId, organizationId, '  ')).rejects.toThrow(
      InvariantViolationError,
    );
    expect((await participants.findClub(club.clubId))?.alias).toBe('lomas-zamora');
  });

  it('repoints an earlier rename so every former alias resolves in one step', async () => {
    const club = await createClub(organizationId, 'Red Star', 'a-red-star');
    await renameClub(club.clubId, organizationId, 'b-red-star');
    await renameClub(club.clubId, organizationId, 'c-red-star');

    const rows = (await clubRedirects(organizationId)).filter((row) =>
      row.old_alias.endsWith('red-star'),
    );
    expect(rows).toEqual([
      { old_alias: 'a-red-star', new_alias: 'c-red-star' },
      { old_alias: 'b-red-star', new_alias: 'c-red-star' },
    ]);
    expect((await aliases.clubFormerAliases(organizationId)).get('c-red-star')).toEqual([
      'a-red-star',
      'b-red-star',
    ]);
  });

  it('drops the stale redirect when a club takes back its earlier alias', async () => {
    const club = await createClub(organizationId, 'Lomas', 'lomas');
    await renameClub(club.clubId, organizationId, 'lomas-de-rivadavia');
    await renameClub(club.clubId, organizationId, 'lomas');

    const rows = (await clubRedirects(organizationId)).filter((row) =>
      row.old_alias.startsWith('lomas'),
    );
    expect(rows).toEqual([{ old_alias: 'lomas-de-rivadavia', new_alias: 'lomas' }]);
    expect((await aliases.clubFormerAliases(organizationId)).get('lomas')).toEqual([
      'lomas-de-rivadavia',
    ]);
  });

  it('never lists one organization’s former aliases for another', async () => {
    await createClub(otherOrganizationId, 'Club Hispano', 'hispano');

    expect((await aliases.clubFormerAliases(otherOrganizationId)).size).toBe(0);
  });

  it('leaves out a former alias another club holds today', async () => {
    const club = await createClub(organizationId, 'Talleres', 'talleres');
    await renameClub(club.clubId, organizationId, 'talleres-mendoza');
    await createClub(organizationId, 'Talleres Nuevo', 'talleres');

    expect(
      (await aliases.clubFormerAliases(organizationId)).get('talleres-mendoza'),
    ).toBeUndefined();
  });

  it('resolves a club alias as current, former or unknown, within one organization', async () => {
    const club = await createClub(organizationId, 'Atlético Resuelto', 'atletico-resuelto');
    await renameClub(club.clubId, organizationId, 'resuelto');

    expect(await aliases.resolveClubAlias(organizationId, 'resuelto')).toEqual({ kind: 'current' });
    expect(await aliases.resolveClubAlias(organizationId, 'atletico-resuelto')).toEqual({
      kind: 'redirect',
      to: 'resuelto',
      status: 301,
    });
    expect(await aliases.resolveClubAlias(organizationId, 'no-existe')).toEqual({
      kind: 'unknown',
    });
    expect(await aliases.resolveClubAlias(otherOrganizationId, 'atletico-resuelto')).toEqual({
      kind: 'unknown',
    });
  });
});
