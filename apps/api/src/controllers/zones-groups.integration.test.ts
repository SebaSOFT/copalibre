import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { buildTestApp } from './test-support/integration-harness.js';
import { ZonesGroupsController } from './zones-groups.controller.js';

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;
const organizationAlias = 'liga-zonas';
const tournamentAlias = 'copa-zonas';

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-000000009901',
    version: '1.0.0',
    name: 'Copa de zonas',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'points', label: 'Puntos', aggregation: 'sum' }],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {},
  } as unknown as DisciplineDescriptor;
}

describe('zone and group draw routes (integration)', () => {
  const base = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages/1`;
  let harness: Awaited<ReturnType<typeof buildTestApp>>;
  let zoneIds: readonly string[] = [];
  let tournamentId = '';

  beforeAll(async () => {
    harness = await buildTestApp([ZonesGroupsController]);
    const tournamentRepository = new TournamentRepository(harness.scratch.db);
    const enrollment = new EnrollmentRepository(harness.scratch.db);
    const competition = new CompetitionRepository(harness.scratch.db);
    const discipline = descriptor();

    tournamentId = await withTransaction(harness.scratch.db, async (uow) => {
      await tournamentRepository.saveDescriptor(uow, discipline, {
        organizationId: harness.organizationId,
        ...AUDIT,
      });
      const tournament = await tournamentRepository.create(uow, {
        organizationId: harness.organizationId,
        alias: tournamentAlias,
        name: 'Copa Zonas',
        descriptor: discipline,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        organizationId: harness.organizationId,
        ...AUDIT,
      });
      await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Final',
        format: 'round-robin',
        organizationId: harness.organizationId,
        ...AUDIT,
      });
      for (const name of ['Andes', 'Caucete', 'Pocito', 'Rawson']) {
        const team = await enrollment.createTeam(uow, {
          organizationId: harness.organizationId,
          name,
          ...AUDIT,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId: harness.organizationId,
          ...AUDIT,
        });
        expect(entrant.entrantId).toEqual(expect.any(String));
      }
      expect(stage.number).toBe(1);
      return tournament.tournamentId;
    });
    for (const entrant of await enrollment.listEntrants(tournamentId)) {
      await withTransaction(harness.scratch.db, (uow) =>
        enrollment.setEntrantStatus(uow, {
          entrantId: entrant.entrantId,
          status: 'accepted',
          organizationId: harness.organizationId,
          ...AUDIT,
        }),
      );
    }
  });

  afterAll(async () => {
    await harness?.app.close();
    await harness?.scratch.drop();
  });

  it('requires admin authorization before any draw is evaluated', async () => {
    const response = await harness.request({
      method: 'POST',
      url: `${base}/zones/draw`,
      payload: { zoneCount: 2, seed: 99 },
    });
    expect(response.statusCode).toBe(401);
  });

  it('persists the zone draw and uses only zone members for the group draw', async () => {
    const confirmedZones = await harness.request({
      method: 'POST',
      url: `${base}/zones/draw`,
      token: 'organizer-org1',
      payload: { zoneCount: 2, seed: 99 },
    });
    expect(confirmedZones.statusCode).toBe(200);
    const zones = confirmedZones.json().zones as Array<{ zoneId: string; number: number }>;
    expect(zones).toHaveLength(2);
    zoneIds = zones.map((zone) => zone.zoneId);

    const firstZoneEntrants = await new CompetitionRepository(
      harness.scratch.db,
    ).listEntrantIdsOfZone(zoneIds[0] as string);
    expect(firstZoneEntrants).toHaveLength(2);

    const preview = await harness.request({
      method: 'POST',
      url: `${base}/zones/1/groups/draw/preview`,
      token: 'organizer-org1',
      payload: { groupCount: 2, seed: 100 },
    });
    expect(preview.statusCode).toBe(200);
    expect(Object.keys(preview.json().assignment.groups).sort()).toEqual([...firstZoneEntrants].sort());

    const confirmedGroups = await harness.request({
      method: 'POST',
      url: `${base}/zones/1/groups/draw`,
      token: 'organizer-org1',
      payload: { groupCount: 2, seed: 100 },
    });
    expect(confirmedGroups.statusCode).toBe(200);
    const groups = confirmedGroups.json().groups as Array<{ groupId: string }>;
    const groupEntrants = await Promise.all(
      groups.map((group) =>
        new CompetitionRepository(harness.scratch.db).listEntrantIdsOfGroup(group.groupId),
      ),
    );
    expect(groupEntrants.flat().sort()).toEqual([...firstZoneEntrants].sort());
  });
});
