import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { StagesController } from './stages.controller.js';
import { TournamentsController } from './tournaments.controller.js';
import { ZonesGroupsController } from './zones-groups.controller.js';

/**
 * Competition-structure editing (openspec 0168): a published tournament's
 * region/capacity/checkInClosesAt can be edited and previewed, a stage can be
 * renamed/reformatted/removed before it holds a fixture, and a zone or group
 * can be renamed/removed before an entrant is assigned into it. Every
 * refusal path is the same "recovery gap" the change closes — named, not
 * silent.
 */

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
let tournamentAliasCounter = 0;

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    TournamentsController,
    StagesController,
    ZonesGroupsController,
  ]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

/** A fresh, isolated tournament with a real ruleset — so no test's mutation leaks into another's. */
async function seedTournament(overrides?: Record<string, unknown>): Promise<{
  readonly tournamentAlias: string;
  readonly tournamentId: string;
}> {
  tournamentAliasCounter += 1;
  const tournamentAlias = `copa-estructura-${tournamentAliasCounter}`;
  const tournaments = new TournamentRepository(scratch.db);
  const descriptor = footballDescriptor();
  const tournamentId = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    await tournaments.saveDescriptor(uow, descriptor, {
      organizationId,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    const tournament = await tournaments.create(uow, {
      organizationId,
      alias: tournamentAlias,
      name: 'Copa Estructura',
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
        'registration.publicOpen': true,
        'registration.requiresCheckIn': false,
        'registration.capacity': 4,
        'registration.region': 'South America',
        ...overrides,
      },
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    return tournament.tournamentId;
  });
  return { tournamentAlias, tournamentId };
}

/** Registers a team entrant and immediately accepts it — the shape a capacity check reads. */
async function acceptedTeamEntrant(tournamentId: string, name: string): Promise<string> {
  const enrollment = new EnrollmentRepository(scratch.db);
  return withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    const team = await enrollment.createTeam(uow, {
      organizationId,
      name,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    const entrant = await enrollment.registerEntrant(uow, {
      tournamentId,
      entrantRef: { kind: 'team', teamId: team.teamId },
      organizationId,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    await enrollment.setEntrantStatus(uow, {
      entrantId: entrant.entrantId,
      status: 'accepted',
      organizationId,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    return entrant.entrantId;
  });
}

describe('tournament settings edit and preview (tasks 1.2-1.3, 6.1-6.2)', () => {
  it('reads back the settings a tournament was seeded with', async () => {
    const { tournamentAlias } = await seedTournament();
    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/settings`,
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: 'Copa Estructura',
      region: 'South America',
      capacity: 4,
    });
  });

  it('applies a safe edit without a rebuild warning, and the preview agrees with the applied result', async () => {
    const { tournamentAlias } = await seedTournament();
    const preview = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/settings/preview`,
      token: 'organizer-org1',
      payload: { region: 'Europe' },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().fields).toEqual([
      { field: 'registration.region', mutationClass: 'safe' },
    ]);

    const applied = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/settings`,
      token: 'organizer-org1',
      payload: { region: 'Europe' },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toMatchObject({ region: 'Europe' });
  });

  it("refuses reducing capacity below the tournament's current accepted-entrant count, naming the count", async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    await acceptedTeamEntrant(tournamentId, 'Talleres');
    await acceptedTeamEntrant(tournamentId, 'Gimnasia');

    const preview = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/settings/preview`,
      token: 'organizer-org1',
      payload: { capacity: 1 },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().fields[0]).toMatchObject({
      field: 'registration.capacity',
      blocked: true,
    });
    expect(preview.json().fields[0].reason).toContain('2 entrant');

    const applied = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/settings`,
      token: 'organizer-org1',
      payload: { capacity: 1 },
    });
    expect(applied.statusCode).toBe(409);
    expect(applied.json().message).toContain('2 entrant');

    const settings = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/settings`,
      token: 'organizer-org1',
    });
    expect(settings.json().capacity).toBe(4);
  });

  it('renames a tournament — always safe, applied alongside other settings', async () => {
    const { tournamentAlias } = await seedTournament();
    const response = await request({
      method: 'PUT',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/settings`,
      token: 'organizer-org1',
      payload: { name: 'Copa Estructura (renombrada)' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('Copa Estructura (renombrada)');
  });
});

describe('stage editing (tasks 2.1-2.2, 6.3)', () => {
  async function seedStage(tournamentId: string, number = 1) {
    const competition = new CompetitionRepository(scratch.db);
    return withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId,
        number,
        name: 'Fase de grupos',
        format: 'round-robin',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
  }

  it("corrects an unseeded stage's format, with no fixture to invalidate", async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    const stage = await seedStage(tournamentId);

    const response = await request({
      method: 'PATCH',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}`,
      token: 'organizer-org1',
      payload: { format: 'single-elimination' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ format: 'single-elimination' });
  });

  it('renames a stage regardless of seeding, and removes an unseeded stage entirely', async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    const stage = await seedStage(tournamentId);

    const renamed = await request({
      method: 'PATCH',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}`,
      token: 'organizer-org1',
      payload: { name: 'Fase de grupos (corregida)' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe('Fase de grupos (corregida)');

    const removed = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}`,
      token: 'organizer-org1',
    });
    expect(removed.statusCode).toBe(200);

    const stages = await new CompetitionRepository(scratch.db).listStagesOfTournament(tournamentId);
    expect(stages.find((candidate) => candidate.stageId === stage.stageId)).toBeUndefined();
  });

  it('removes a stage that had zones and groups, cascading them, once no fixture exists', async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    const stage = await seedStage(tournamentId);
    const competition = new CompetitionRepository(scratch.db);
    const zone = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.createZone(uow, {
        stageId: stage.stageId,
        number: 1,
        name: 'Zona 1',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.createGroup(uow, {
        zoneId: zone.zoneId,
        number: 1,
        name: 'Grupo A',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const removed = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}`,
      token: 'organizer-org1',
    });
    expect(removed.statusCode).toBe(200);
    expect(await competition.listZonesOfStage(stage.stageId)).toEqual([]);
  });

  it('refuses a format change and a removal once the stage holds a fixture, naming fixtures', async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    const stage = await seedStage(tournamentId);
    const competition = new CompetitionRepository(scratch.db);
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const formatChange = await request({
      method: 'PATCH',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}`,
      token: 'organizer-org1',
      payload: { format: 'single-elimination' },
    });
    expect(formatChange.statusCode).toBe(409);
    expect(formatChange.json().message).toContain('fixtures already exist');

    const removal = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}`,
      token: 'organizer-org1',
    });
    expect(removal.statusCode).toBe(409);
    expect(removal.json().message).toContain('fixtures already exist');
  });
});

describe('zone and group editing (tasks 3.1-3.2, 6.4)', () => {
  async function seedStage(tournamentId: string) {
    const competition = new CompetitionRepository(scratch.db);
    return withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId,
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
  }

  /** A zone with one group inside it, both with the same one entrant already assigned into them. */
  async function seedAssignedZone(stageId: string, entrantId: string) {
    const competition = new CompetitionRepository(scratch.db);
    const zoneDraw = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.assignZonesManually(uow, {
        stageId,
        assignment: { groups: { [entrantId]: 1 } },
        zoneCount: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const zone = zoneDraw.entities[0];
    if (!zone) throw new Error('expected a zone to have been assigned');
    const groupDraw = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.assignGroupsManually(uow, {
        zoneId: zone.zoneId,
        assignment: { groups: { [entrantId]: 1 } },
        groupCount: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const group = groupDraw.entities[0];
    if (!group) throw new Error('expected a group to have been assigned');
    return { zone, group };
  }

  it('renames a zone and a group, disturbing no entrant assignment', async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    const stage = await seedStage(tournamentId);
    const entrantId = await acceptedTeamEntrant(tournamentId, 'Talleres');
    const { zone, group } = await seedAssignedZone(stage.stageId, entrantId);
    const competition = new CompetitionRepository(scratch.db);

    const renamedZone = await request({
      method: 'PATCH',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}/zones/${zone.number}`,
      token: 'organizer-org1',
      payload: { name: 'Zona 1 (corregida)' },
    });
    expect(renamedZone.statusCode).toBe(200);
    expect(renamedZone.json().name).toBe('Zona 1 (corregida)');

    const renamedGroup = await request({
      method: 'PATCH',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}/zones/${zone.number}/groups/${group.number}`,
      token: 'organizer-org1',
      payload: { name: 'Grupo A (corregido)' },
    });
    expect(renamedGroup.statusCode).toBe(200);
    expect(renamedGroup.json().name).toBe('Grupo A (corregido)');

    expect(await competition.listEntrantIdsOfZone(zone.zoneId)).toEqual([entrantId]);
    expect(await competition.listEntrantIdsOfGroup(group.groupId)).toEqual([entrantId]);
  });

  it('removes an empty zone and an empty group', async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    const stage = await seedStage(tournamentId);
    const competition = new CompetitionRepository(scratch.db);
    const zone = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.createZone(uow, {
        stageId: stage.stageId,
        number: 1,
        name: 'Zona 1',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const group = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.createGroup(uow, {
        zoneId: zone.zoneId,
        number: 1,
        name: 'Grupo A',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const removedGroup = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}/zones/${zone.number}/groups/${group.number}`,
      token: 'organizer-org1',
    });
    expect(removedGroup.statusCode).toBe(200);

    const removedZone = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}/zones/${zone.number}`,
      token: 'organizer-org1',
    });
    expect(removedZone.statusCode).toBe(200);
    expect(await competition.listZonesOfStage(stage.stageId)).toEqual([]);
  });

  it('refuses removing a zone and a group once an entrant is assigned into each, naming the assignment', async () => {
    const { tournamentAlias, tournamentId } = await seedTournament();
    const stage = await seedStage(tournamentId);
    const entrantId = await acceptedTeamEntrant(tournamentId, 'Talleres');
    const { zone, group } = await seedAssignedZone(stage.stageId, entrantId);

    const removedGroup = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}/zones/${zone.number}/groups/${group.number}`,
      token: 'organizer-org1',
    });
    expect(removedGroup.statusCode).toBe(409);
    expect(removedGroup.json().message).toContain('entrant');

    const removedZone = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stage.number}/zones/${zone.number}`,
      token: 'organizer-org1',
    });
    expect(removedZone.statusCode).toBe(409);
    expect(removedZone.json().message).toContain('entrant');
  });
});
