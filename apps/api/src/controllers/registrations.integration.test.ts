import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  AuditReader,
  EnrollmentRepository,
  PersonRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import {
  DisciplinesController,
  EntrantsController,
  RegistrationsController,
} from './registrations.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    RegistrationsController,
    EntrantsController,
    DisciplinesController,
  ]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('registration review routes', () => {
  it('lists unresolved abbreviations and lets an administrator resolve one without accepting duplicates', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const descriptor = footballDescriptor();
    const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-abreviaturas-rutas',
        name: 'Copa Abreviaturas Rutas',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const firstTeam = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Casa de Italia',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const secondTeam = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Casa de Italia',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const first = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: firstTeam.teamId },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const unresolved = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: secondTeam.teamId },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return { first, unresolved };
    });

    const needs = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-abreviaturas-rutas/entrants/needing-abbreviation',
      token: 'organizer-org1',
    });
    expect(needs.statusCode).toBe(200);
    expect(needs.json().map((entry: { entrantId: string }) => entry.entrantId)).toEqual([
      seeded.unresolved.entrantId,
    ]);

    const duplicate = await request({
      method: 'PATCH',
      url: `/organizations/liga-orbital/tournaments/copa-abreviaturas-rutas/entrants/${seeded.unresolved.entrantId}/abbreviation`,
      token: 'organizer-org1',
      payload: { abbreviation: seeded.first.abbreviation },
    });
    expect(duplicate.statusCode).toBe(409);

    const resolved = await request({
      method: 'PATCH',
      url: `/organizations/liga-orbital/tournaments/copa-abreviaturas-rutas/entrants/${seeded.unresolved.entrantId}/abbreviation`,
      token: 'organizer-org1',
      payload: { abbreviation: 'C I 2' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ abbreviation: 'C I 2' });

    const malformed = await request({
      method: 'PATCH',
      url: `/organizations/liga-orbital/tournaments/copa-abreviaturas-rutas/entrants/${seeded.unresolved.entrantId}/abbreviation`,
      token: 'organizer-org1',
      payload: { abbreviation: 'not valid' },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('lists only this tournament registrations, and bulk review audits every entrant touched', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const descriptor = footballDescriptor();

    const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const primary = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-registros',
        name: 'Copa Registros',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const other = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-ajena-local',
        name: 'Copa Ajena Local',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const teams = await Promise.all([
        enrollment.createTeam(uow, {
          organizationId,
          name: 'Talleres Azul',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
        enrollment.createTeam(uow, {
          organizationId,
          name: 'Casa de Italia',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
        enrollment.createTeam(uow, {
          organizationId,
          name: 'San Martín',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      ]);
      const first = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: primary.tournamentId,
        entrantRef: { kind: 'team', teamId: teams[0]?.teamId ?? '' },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const second = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: primary.tournamentId,
        entrantRef: { kind: 'team', teamId: teams[1]?.teamId ?? '' },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const outsider = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: other.tournamentId,
        entrantRef: { kind: 'team', teamId: teams[2]?.teamId ?? '' },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      return { first, second, outsider };
    });

    const listBefore = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-registros/registrations',
      token: 'organizer-org1',
    });
    expect(listBefore.statusCode).toBe(200);
    expect(
      listBefore
        .json()
        .map((one: { entrantId: string }) => one.entrantId)
        .sort(),
    ).toEqual([seeded.first.entrantId, seeded.second.entrantId]);

    const bulk = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-registros/registrations/bulk-review',
      token: 'organizer-org1',
      payload: {
        entrantIds: [seeded.first.entrantId, seeded.second.entrantId, seeded.outsider.entrantId],
        decision: 'accepted',
        reason: 'Documentación completa',
      },
    });
    expect(bulk.statusCode).toBe(200);
    expect(
      bulk
        .json()
        .applied.map((one: { entrantId: string }) => one.entrantId)
        .sort(),
    ).toEqual([seeded.first.entrantId, seeded.second.entrantId]);

    const audit = new AuditReader(scratch.db);
    const histories = await Promise.all([
      audit.historyFor('entrant', seeded.first.entrantId),
      audit.historyFor('entrant', seeded.second.entrantId),
      audit.historyFor('entrant', seeded.outsider.entrantId),
    ]);
    expect(histories[0]?.map((one) => one.action)).toContain('entrant.accepted');
    expect(histories[1]?.map((one) => one.action)).toContain('entrant.accepted');
    expect(histories[2]?.map((one) => one.action)).not.toContain('entrant.accepted');
  });

  it('rejects a stale team-membership edit after check-in closes for a checked-in entrant', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const descriptor = footballDescriptor();

    const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-check-in',
        name: 'Copa Check In',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor,
        overrides: {
          format: 'round-robin',
          'registration.requiresCheckIn': true,
          'registration.checkInClosesAt': '2000-01-01T00:00:00.000Z',
        },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Independiente',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      enrollment.setEntrantStatus(uow, {
        entrantId: seeded.entrantId,
        status: 'checked-in',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-check-in/registrations/${seeded.entrantId}/team-memberships`,
      token: 'organizer-org1',
      payload: { personIds: [] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain('Check-in has closed');
    expect(response.json().errorCode).toBe('registration-conflict');
  });

  it('reconciles a team entrant’s membership to the submitted ids, auditing each change', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const descriptor = footballDescriptor();
    const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

    const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-membresia',
        name: 'Copa Membresía',
        descriptor,
        ...seedAudit,
      });
      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Estudiantes',
        ...seedAudit,
      });
      const entrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        ...seedAudit,
      });
      const kept = await people.register(uow, {
        organizationId,
        displayName: 'Nicolás Funes',
        ...seedAudit,
      });
      const dropped = await people.register(uow, {
        organizationId,
        displayName: 'Marcos Ibáñez',
        ...seedAudit,
      });
      const added = await people.register(uow, {
        organizationId,
        displayName: 'Julieta Roldán',
        ...seedAudit,
      });
      await people.enlist(uow, {
        personId: kept.person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        ...seedAudit,
      });
      const droppedPlayer = await people.enlist(uow, {
        personId: dropped.person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        ...seedAudit,
      });
      return {
        entrant,
        team,
        kept: kept.person,
        dropped: dropped.person,
        droppedPlayerId: droppedPlayer.playerId,
        added: added.person,
      };
    });

    const response = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-membresia/registrations/${seeded.entrant.entrantId}/team-memberships`,
      token: 'organizer-org1',
      payload: { personIds: [seeded.kept.personId, seeded.added.personId] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(
      new Set(body.teamMembers.map((member: { personId: string }) => member.personId)),
    ).toEqual(new Set([seeded.kept.personId, seeded.added.personId]));
    expect(
      body.teamMembers.find(
        (member: { personId: string }) => member.personId === seeded.added.personId,
      ),
    ).toMatchObject({ role: 'player', displayName: 'Julieta Roldán' });

    const squad = await people.squadOf(seeded.team.teamId);
    expect(new Set(squad.map((player) => player.personId))).toEqual(
      new Set([seeded.kept.personId, seeded.added.personId]),
    );

    const enlistedRows = await scratch.db
      .selectFrom('audit_log')
      .select('resulting_state')
      .where('organization_id', '=', organizationId)
      .where('entity_type', '=', 'player')
      .where('action', '=', 'player.enlisted')
      .execute();
    expect(
      enlistedRows.some(
        (row) =>
          (row.resulting_state as { personId?: string } | null)?.personId === seeded.added.personId,
      ),
    ).toBe(true);

    const dismissedRows = await scratch.db
      .selectFrom('audit_log')
      .select('previous_state')
      .where('organization_id', '=', organizationId)
      .where('entity_type', '=', 'player')
      .where('entity_id', '=', seeded.droppedPlayerId)
      .where('action', '=', 'player.dismissed')
      .execute();
    expect(dismissedRows).toHaveLength(1);
    expect(dismissedRows[0]?.previous_state).toMatchObject({ personId: seeded.dropped.personId });
  });

  it('changes nothing, and audits nothing, resubmitting the current membership', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const descriptor = footballDescriptor();
    const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

    const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-membresia-estable',
        name: 'Copa Membresía Estable',
        descriptor,
        ...seedAudit,
      });
      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Racing Local',
        ...seedAudit,
      });
      const entrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        ...seedAudit,
      });
      const person = await people.register(uow, {
        organizationId,
        displayName: 'Camila Suárez',
        ...seedAudit,
      });
      await people.enlist(uow, {
        personId: person.person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        ...seedAudit,
      });
      return { entrant, team, person: person.person };
    });

    const before = await scratch.db
      .selectFrom('audit_log')
      .select('audit_id')
      .where('organization_id', '=', organizationId)
      .where('entity_type', '=', 'player')
      .execute();

    const response = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-membresia-estable/registrations/${seeded.entrant.entrantId}/team-memberships`,
      token: 'organizer-org1',
      payload: { personIds: [seeded.person.personId] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().teamMembers).toHaveLength(1);

    const after = await scratch.db
      .selectFrom('audit_log')
      .select('audit_id')
      .where('organization_id', '=', organizationId)
      .where('entity_type', '=', 'player')
      .execute();
    expect(after).toHaveLength(before.length);
  });

  it('refuses a team-membership edit against a person-kind entrant', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const descriptor = footballDescriptor();
    const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

    const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-individual',
        name: 'Copa Individual',
        descriptor,
        ...seedAudit,
      });
      const person = await people.register(uow, {
        organizationId,
        displayName: 'Diego Farías',
        ...seedAudit,
      });
      const entrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: person.person.personId },
        ...seedAudit,
      });
      return entrant;
    });

    const response = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-individual/registrations/${seeded.entrantId}/team-memberships`,
      token: 'organizer-org1',
      payload: { personIds: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('team entrant');
  });

  it('refuses a team-membership edit naming an unknown person id, and writes nothing', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const descriptor = footballDescriptor();
    const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

    const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-id-desconocido',
        name: 'Copa Id Desconocido',
        descriptor,
        ...seedAudit,
      });
      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Sportivo Belgrano',
        ...seedAudit,
      });
      const entrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        ...seedAudit,
      });
      const person = await people.register(uow, {
        organizationId,
        displayName: 'Rocío Aybar',
        ...seedAudit,
      });
      await people.enlist(uow, {
        personId: person.person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        ...seedAudit,
      });
      return { entrant, team, person: person.person };
    });

    const response = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-id-desconocido/registrations/${seeded.entrant.entrantId}/team-memberships`,
      token: 'organizer-org1',
      payload: {
        personIds: [seeded.person.personId, '00000000-0000-4000-8000-000000000000'],
      },
    });

    expect(response.statusCode).toBe(404);

    const squad = await people.squadOf(seeded.team.teamId);
    expect(squad.map((player) => player.personId)).toEqual([seeded.person.personId]);
  });
});

describe('disciplines listing (openspec 0161)', () => {
  it("exposes each descriptor's field policies so the wizard can warn about hard-to-reverse decisions before it submits", async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({ method: 'GET', url: '/disciplines' });
    expect(response.statusCode).toBe(200);

    const football = (
      response.json() as readonly {
        alias?: string;
        fieldPolicies?: Record<string, { mutationClass: string }>;
      }[]
    ).find((entry) => entry.fieldPolicies?.['format']?.mutationClass !== undefined);

    expect(football?.fieldPolicies?.['format']).toEqual({
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
    });
    expect(football?.fieldPolicies?.['series.resolutionClass']).toEqual({
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
    });
    expect(football?.fieldPolicies?.['registration.capacity']).toEqual({
      permission: { kind: 'replaced' },
      mutationClass: 'requires_rebuild',
    });
  });
});
