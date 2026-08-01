import { InvariantViolationError } from '../errors.js';
import { withTransaction } from '../transaction.js';
import { OrganizationRepository } from './organization-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { PersonRepository } from './person-repository.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';

/**
 * The split, against real storage: one human across two teams under one key,
 * recognised rather than duplicated however the document was typed.
 */

const AUDIT = { actor: 'user:registrar-1', authorizationContext: 'scope:participant.write' };

describe('people and their memberships (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('persons');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'club-murialdo',
        name: 'Club Leonardo Murialdo',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function team(name: string) {
    return withTransaction(scratch.db, (uow) =>
      new EnrollmentRepository(scratch.db).createTeam(uow, { organizationId, name, ...AUDIT }),
    );
  }

  it('recognises one human however their document was typed', async () => {
    const people = new PersonRepository(scratch.db);

    const first = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Adolfo Iván Isoler',
        naturalKey: { kind: 'dni', value: '12.345.678' },
        ...AUDIT,
      }),
    );
    const again = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'ISOLER, Adolfo I.',
        naturalKey: { kind: 'dni', value: '12345678' },
        ...AUDIT,
      }),
    );

    expect(first.recognised).toBe(false);
    // Two spellings, two forms of the name, one person — which is what stops an
    // import creating a second.
    expect(again.recognised).toBe(true);
    expect(again.person.personId).toBe(first.person.personId);
  });

  it('lets one person play for two teams', async () => {
    const people = new PersonRepository(scratch.db);
    const [football, futsal] = await Promise.all([
      team('Murialdo Fútbol'),
      team('Murialdo Futsal'),
    ]);

    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Elías Salomón',
        naturalKey: { kind: 'dni', value: '23.456.789' },
        ...AUDIT,
      }),
    );

    await withTransaction(scratch.db, async (uow) => {
      await people.enlist(uow, {
        personId: person.personId,
        teamId: football.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await people.enlist(uow, {
        personId: person.personId,
        teamId: futsal.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
    });

    const memberships = await people.playersOf(person.personId);
    expect(memberships).toHaveLength(2);
    expect(new Set(memberships.map((m) => m.teamId))).toEqual(
      new Set([football.teamId, futsal.teamId]),
    );
  });

  it('refuses the same person twice in one team', async () => {
    const people = new PersonRepository(scratch.db);
    const squad = await team('Murialdo Reserva');
    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Pablo Ribas', ...AUDIT }),
    );

    await withTransaction(scratch.db, (uow) =>
      people.enlist(uow, {
        personId: person.personId,
        teamId: squad.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        people.enlist(uow, {
          personId: person.personId,
          teamId: squad.teamId,
          role: 'substitute',
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow();
  });

  it('registers somebody with no document, and attaches one later without duplicating them', async () => {
    const people = new PersonRepository(scratch.db);

    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Tomás Scibilia', ...AUDIT }),
    );
    expect(person.naturalKey).toBeUndefined();

    const withKey = await withTransaction(scratch.db, (uow) =>
      people.attachNaturalKey(uow, {
        personId: person.personId,
        organizationId,
        naturalKey: { kind: 'dni', value: '34.567.890' },
        ...AUDIT,
      }),
    );

    expect(withKey.personId).toBe(person.personId);
    expect(
      await people.findByNaturalKey(organizationId, { kind: 'dni', value: '34567890' }),
    ).toMatchObject({ personId: person.personId });
  });

  it('refuses to attach a document another person already carries', async () => {
    const people = new PersonRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Franco Nardi',
        naturalKey: { kind: 'dni', value: '45.678.901' },
        ...AUDIT,
      }),
    );
    const { person: other } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Lucas Sottano', ...AUDIT }),
    );

    // Two records claiming one human: only an operator can say which is right.
    await expect(
      withTransaction(scratch.db, (uow) =>
        people.attachNaturalKey(uow, {
          personId: other.personId,
          organizationId,
          naturalKey: { kind: 'dni', value: '45678901' },
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('keeps the document out of the audit trail', async () => {
    const people = new PersonRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Gino Celsi',
        naturalKey: { kind: 'dni', value: '56.789.012' },
        ...AUDIT,
      }),
    );

    const rows = await scratch.db
      .selectFrom('audit_log')
      .select('resulting_state')
      .where('entity_type', '=', 'person')
      .execute();

    // An audit trail is read by more people than a registration form.
    expect(JSON.stringify(rows)).not.toContain('56789012');
    expect(JSON.stringify(rows)).not.toContain('56.789.012');
  });
});
