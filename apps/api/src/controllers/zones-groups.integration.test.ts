import type { DisciplineDescriptor } from '@copalibre/domain';
import { allocateSeeds, generateFixtures } from '@copalibre/tournament-engine';
import {
  CompetitionRepository,
  EnrollmentRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { buildTestApp } from './test-support/integration-harness.js';
import { ZonesGroupsController } from './zones-groups.controller.js';

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;
const organizationAlias = 'liga-orbital';
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
  const manualBase = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages/2`;
  let harness: Awaited<ReturnType<typeof buildTestApp>>;
  let zoneIds: readonly string[] = [];
  let stageOneId = '';
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
      stageOneId = stage.stageId;
      await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Final',
        format: 'round-robin',
        organizationId: harness.organizationId,
        ...AUDIT,
      });
      for (const name of [
        'Andes',
        'Caucete',
        'Pocito',
        'Rawson',
        'Rivadavia',
        'Santa Lucía',
        'Sarmiento',
        'Zonda',
      ]) {
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
    await withTransaction(harness.scratch.db, (uow) =>
      tournamentRepository.publish(uow, {
        tournamentId,
        organizationId: harness.organizationId,
        ...AUDIT,
      }),
    );
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

  it('400s a zone draw without a seed, before reaching the controller', async () => {
    const response = await harness.request({
      method: 'POST',
      url: `${base}/zones/draw/preview`,
      token: 'organizer-org1',
      payload: { zoneCount: 2 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an extra undocumented property with 400 when previewing the zone draw', async () => {
    const response = await harness.request({
      method: 'POST',
      url: `${base}/zones/draw/preview`,
      token: 'organizer-org1',
      payload: { zoneCount: 1, seed: 99, unexpectedField: 'dropped' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.errorCode).toBe('bad-request');
    expect(body.message).toContain('property unexpectedField should not exist');
  });

  it('allows only administrators to create zones and groups, while public readers can list them', async () => {
    const unauthenticated = await harness.request({
      method: 'POST',
      url: `${manualBase}/zones`,
      payload: { name: 'Zona manual' },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const participant = await harness.request({
      method: 'POST',
      url: `${manualBase}/zones`,
      token: 'participant-org1',
      payload: { name: 'Zona manual' },
    });
    expect(participant.statusCode).toBe(403);

    const createdZone = await harness.request({
      method: 'POST',
      url: `${manualBase}/zones`,
      token: 'organizer-org1',
      payload: { name: 'Copa oro' },
    });
    expect(createdZone.statusCode).toBe(201);
    expect(createdZone.json()).toMatchObject({ number: 1, name: 'Copa oro' });

    const secondZone = await harness.request({
      method: 'POST',
      url: `${manualBase}/zones`,
      token: 'organizer-org1',
      payload: { name: 'Copa plata' },
    });
    expect(secondZone.statusCode).toBe(201);
    expect(secondZone.json()).toMatchObject({ number: 2, name: 'Copa plata' });

    const publicZones = await harness.request({ method: 'GET', url: `${manualBase}/zones` });
    expect(publicZones.statusCode).toBe(200);
    expect(publicZones.json()).toEqual([
      expect.objectContaining({ number: 1, name: 'Copa oro' }),
      expect.objectContaining({ number: 2, name: 'Copa plata' }),
    ]);

    const createdGroup = await harness.request({
      method: 'POST',
      url: `${manualBase}/zones/1/groups`,
      token: 'organizer-org1',
      payload: { name: 'Grupo manual' },
    });
    expect(createdGroup.statusCode).toBe(201);
    expect(createdGroup.json()).toMatchObject({ number: 1, name: 'Grupo manual' });

    const publicGroups = await harness.request({
      method: 'GET',
      url: `${manualBase}/zones/1/groups`,
    });
    expect(publicGroups.statusCode).toBe(200);
    expect(publicGroups.json()).toEqual([
      expect.objectContaining({ number: 1, name: 'Grupo manual' }),
    ]);
  });

  it('persists the zone draw and uses only zone members for the group draw', async () => {
    const previewedZones = await harness.request({
      method: 'POST',
      url: `${base}/zones/draw/preview`,
      token: 'organizer-org1',
      payload: { zoneCount: 1, seed: 99 },
    });
    expect(previewedZones.statusCode).toBe(200);
    const confirmedZones = await harness.request({
      method: 'POST',
      url: `${base}/zones/draw`,
      token: 'organizer-org1',
      payload: { zoneCount: 1, seed: 99 },
    });
    expect(confirmedZones.statusCode).toBe(200);
    expect(confirmedZones.json().assignment).toEqual(previewedZones.json().assignment);
    const zones = confirmedZones.json().zones as Array<{ zoneId: string; number: number }>;
    expect(zones).toHaveLength(1);
    zoneIds = zones.map((zone) => zone.zoneId);

    const firstZoneEntrants = await new CompetitionRepository(
      harness.scratch.db,
    ).listEntrantIdsOfZone(zoneIds[0] as string);
    expect(firstZoneEntrants).toHaveLength(8);

    const preview = await harness.request({
      method: 'POST',
      url: `${base}/zones/1/groups/draw/preview`,
      token: 'organizer-org1',
      payload: { groupCount: 2, seed: 100 },
    });
    expect(preview.statusCode).toBe(200);
    expect(Object.keys(preview.json().assignment.groups).sort()).toEqual(
      [...firstZoneEntrants].sort(),
    );

    const confirmedGroups = await harness.request({
      method: 'POST',
      url: `${base}/zones/1/groups/draw`,
      token: 'organizer-org1',
      payload: { groupCount: 2, seed: 100 },
    });
    expect(confirmedGroups.statusCode).toBe(200);
    expect(confirmedGroups.json().assignment).toEqual(preview.json().assignment);
    const groups = confirmedGroups.json().groups as Array<{ groupId: string }>;
    const groupEntrants = await Promise.all(
      groups.map((group) =>
        new CompetitionRepository(harness.scratch.db).listEntrantIdsOfGroup(group.groupId),
      ),
    );
    expect(groupEntrants.flat().sort()).toEqual([...firstZoneEntrants].sort());

    await withTransaction(harness.scratch.db, async (uow) => {
      const competition = new CompetitionRepository(harness.scratch.db);
      for (const [groupIndex, group] of groups.entries()) {
        const entrants = groupEntrants[groupIndex] ?? [];
        for (let offset = 0; offset < entrants.length; offset += 2) {
          const homeEntrantId = entrants[offset];
          const awayEntrantId = entrants[offset + 1];
          if (!homeEntrantId || !awayEntrantId) throw new Error('Expected paired group entrants');
          const [fixture] = await competition.createFixtures(uow, {
            stageId: stageOneId,
            fixtures: [
              {
                round: 1,
                zoneId: zoneIds[0] as string,
                groupId: group.groupId,
                homeEntrantId,
                awayEntrantId,
              },
            ],
            organizationId: harness.organizationId,
            ...AUDIT,
          });
          if (!fixture) throw new Error('Expected source fixture');
          const match = await competition.createMatch(uow, {
            fixtureId: fixture.fixtureId,
            number: 1,
            organizationId: harness.organizationId,
            ...AUDIT,
          });
          await competition.recordResult(uow, {
            matchId: match.matchId,
            result: {
              sides: [
                {
                  entrantId: homeEntrantId,
                  statistics: { points: 6 - groupIndex * 2 - offset },
                },
                {
                  entrantId: awayEntrantId,
                  statistics: { points: 5 - groupIndex * 2 - offset },
                },
              ],
              winnerEntrantId: homeEntrantId,
              recordedAt: '2026-08-18T12:00:00.000Z',
            },
            organizationId: harness.organizationId,
            ...AUDIT,
          });
        }
      }
    });

    const savedPlan = await harness.request({
      method: 'POST',
      url: `${base}/zones/1/promotion-plan`,
      token: 'organizer-org1',
      payload: {
        nextStageNumber: 2,
        perGroupAdvance: 4,
        combination: {
          mode: 'ranked',
          pipeline: {
            id: 'points-then-goal-difference',
            version: 1,
            parameters: [
              {
                id: 'points',
                label: 'Points',
                valueType: 'number',
                direction: 'higher_wins',
                missingValue: 'treat-as-zero',
                source: 'calculated',
              },
              {
                id: 'goal-difference',
                label: 'Goal difference',
                valueType: 'number',
                direction: 'higher_wins',
                missingValue: 'treat-as-zero',
                source: 'calculated',
              },
            ],
          },
        },
        bands: [
          { zoneRef: 'Copa oro', count: 4 },
          { zoneRef: 'Copa plata', count: 4 },
        ],
      },
    });
    expect(savedPlan.statusCode).toBe(201);

    const previewedPromotion = await harness.request({
      method: 'GET',
      url: `${base}/zones/1/promotion-preview`,
      token: 'organizer-org1',
    });
    expect(previewedPromotion.statusCode).toBe(200);
    expect(previewedPromotion.json().combined).toHaveLength(8);
    expect(previewedPromotion.json().bands['Copa oro']).toHaveLength(4);
    expect(previewedPromotion.json().bands['Copa plata']).toHaveLength(4);

    const promoted = previewedPromotion.json().combined as Array<{ entrantId: string }>;
    const seeds = allocateSeeds({
      allocation: { mode: 'automatic' },
      entrants: promoted.map(({ entrantId }) => ({ entrantId })),
      qualified: promoted.map(({ entrantId }) => entrantId),
    }).seeds;
    const nextStage = generateFixtures({ format: 'single-elimination', entrants: seeds });
    expect(nextStage.ok).toBe(true);
    if (!nextStage.ok) throw nextStage.error;
    expect(nextStage.value.matches).toHaveLength(7);
  });

  it('finds every zone whose stored promotion plan targets a stage, in zone-number order', async () => {
    // The prior test already stored zone 1 (of stage 1)'s plan targeting
    // stage 2 with two bands — reused here rather than re-created.
    const targetingStageTwo = await harness.request({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages/2/promotion-plans`,
      token: 'organizer-org1',
    });
    expect(targetingStageTwo.statusCode).toBe(200);
    expect(targetingStageTwo.json()).toEqual([
      expect.objectContaining({ zoneNumber: 1, zoneId: zoneIds[0] }),
    ]);
    const zoneOnePreview = await harness.request({
      method: 'GET',
      url: `${base}/zones/1/promotion-preview`,
      token: 'organizer-org1',
    });
    expect(targetingStageTwo.json()[0].combined).toEqual(zoneOnePreview.json().combined);

    // Stage 1 itself has no plan targeting it — an empty result, not an error.
    const targetingStageOne = await harness.request({
      method: 'GET',
      url: `${base}/promotion-plans`,
      token: 'organizer-org1',
    });
    expect(targetingStageOne.statusCode).toBe(200);
    expect(targetingStageOne.json()).toEqual([]);

    // A second, independent source zone/stage also targeting stage 2.
    const competition = new CompetitionRepository(harness.scratch.db);
    const secondSourceStage = await withTransaction(harness.scratch.db, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId,
        number: 10,
        name: 'Repechaje',
        format: 'round-robin',
        organizationId: harness.organizationId,
        ...AUDIT,
      }),
    );
    const secondBase = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages/10`;
    const enrollment = new EnrollmentRepository(harness.scratch.db);
    const repechajeEntrantIds: string[] = [];
    for (const name of ['Chimbas', '9 de Julio']) {
      const team = await withTransaction(harness.scratch.db, (uow) =>
        enrollment.createTeam(uow, { organizationId: harness.organizationId, name, ...AUDIT }),
      );
      const entrant = await withTransaction(harness.scratch.db, (uow) =>
        enrollment.registerEntrant(uow, {
          tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId: harness.organizationId,
          ...AUDIT,
        }),
      );
      await withTransaction(harness.scratch.db, (uow) =>
        enrollment.setEntrantStatus(uow, {
          entrantId: entrant.entrantId,
          status: 'accepted',
          organizationId: harness.organizationId,
          ...AUDIT,
        }),
      );
      repechajeEntrantIds.push(entrant.entrantId);
    }
    const secondZoneAssign = await harness.request({
      method: 'POST',
      url: `${secondBase}/zones/assign`,
      token: 'organizer-org1',
      payload: {
        assignment: { groups: Object.fromEntries(repechajeEntrantIds.map((id) => [id, 1])) },
        zoneCount: 1,
      },
    });
    expect(secondZoneAssign.statusCode).toBe(200);
    const [secondZone] = secondZoneAssign.json().zones as Array<{
      zoneId: string;
      number: number;
    }>;
    const secondGroupAssign = await harness.request({
      method: 'POST',
      url: `${secondBase}/zones/${secondZone?.number}/groups/assign`,
      token: 'organizer-org1',
      payload: {
        assignment: { groups: Object.fromEntries(repechajeEntrantIds.map((id) => [id, 1])) },
        groupCount: 1,
      },
    });
    expect(secondGroupAssign.statusCode).toBe(200);
    const [secondGroup] = secondGroupAssign.json().groups as Array<{ groupId: string }>;
    await withTransaction(harness.scratch.db, async (uow) => {
      const [fixture] = await competition.createFixtures(uow, {
        stageId: secondSourceStage.stageId,
        fixtures: [
          {
            round: 1,
            zoneId: secondZone?.zoneId,
            groupId: secondGroup?.groupId,
            homeEntrantId: repechajeEntrantIds[0],
            awayEntrantId: repechajeEntrantIds[1],
          },
        ],
        organizationId: harness.organizationId,
        ...AUDIT,
      });
      if (!fixture) throw new Error('Expected repechaje fixture');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId: harness.organizationId,
        ...AUDIT,
      });
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: repechajeEntrantIds[0] as string, statistics: { points: 3 } },
            { entrantId: repechajeEntrantIds[1] as string, statistics: { points: 0 } },
          ],
          winnerEntrantId: repechajeEntrantIds[0],
          recordedAt: '2026-08-18T12:00:00.000Z',
        },
        organizationId: harness.organizationId,
        ...AUDIT,
      });
    });
    const savedSecondPlan = await harness.request({
      method: 'POST',
      url: `${secondBase}/zones/${secondZone?.number}/promotion-plan`,
      token: 'organizer-org1',
      payload: {
        nextStageNumber: 2,
        perGroupAdvance: 1,
        combination: {
          mode: 'ranked',
          pipeline: {
            id: 'points-then-goal-difference',
            version: 1,
            parameters: [
              {
                id: 'points',
                label: 'Points',
                valueType: 'number',
                direction: 'higher_wins',
                missingValue: 'treat-as-zero',
                source: 'calculated',
              },
            ],
          },
        },
      },
    });
    expect(savedSecondPlan.statusCode).toBe(201);

    const afterSecondPlan = await harness.request({
      method: 'GET',
      url: `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages/2/promotion-plans`,
      token: 'organizer-org1',
    });
    expect(afterSecondPlan.statusCode).toBe(200);
    const entries = afterSecondPlan.json() as Array<{
      zoneId: string;
      combined: Array<{ entrantId: string }>;
    }>;
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.zoneId).sort()).toEqual(
      [zoneIds[0], secondZone?.zoneId].sort(),
    );
    const repechajeEntry = entries.find((entry) => entry.zoneId === secondZone?.zoneId);
    expect(repechajeEntry?.combined).toEqual([
      expect.objectContaining({ entrantId: repechajeEntrantIds[0] }),
    ]);
  });

  it('manually assigns zones and groups without a draw', async () => {
    const competition = new CompetitionRepository(harness.scratch.db);
    const manualStage = await withTransaction(harness.scratch.db, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId,
        number: 3,
        name: 'Manual',
        format: 'round-robin',
        organizationId: harness.organizationId,
        ...AUDIT,
      }),
    );
    const manualStageBase = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages/3`;
    const entrantIds = (
      await new EnrollmentRepository(harness.scratch.db).listEntrants(tournamentId)
    )
      .filter((entrant) => entrant.status === 'accepted')
      .map((entrant) => entrant.entrantId);

    const unauthorized = await harness.request({
      method: 'POST',
      url: `${manualStageBase}/zones/assign`,
      payload: { assignment: { groups: {} }, zoneCount: 1 },
    });
    expect(unauthorized.statusCode).toBe(401);

    const assignment = Object.fromEntries(entrantIds.map((id) => [id, 1]));
    const assignedZones = await harness.request({
      method: 'POST',
      url: `${manualStageBase}/zones/assign`,
      token: 'organizer-org1',
      payload: { assignment: { groups: assignment }, zoneCount: 1 },
    });
    expect(assignedZones.statusCode).toBe(200);
    expect(assignedZones.json().assignment.groups).toEqual(assignment);
    const [manualZone] = assignedZones.json().zones as Array<{ zoneId: string; number: number }>;
    expect(manualZone).toMatchObject({ number: 1 });

    // A second manual zone-assign for the same stage refuses — mirrors the
    // existing draw-confirm route's own "already assigned" invariant.
    const repeatZoneAssign = await harness.request({
      method: 'POST',
      url: `${manualStageBase}/zones/assign`,
      token: 'organizer-org1',
      payload: { assignment: { groups: assignment }, zoneCount: 1 },
    });
    expect(repeatZoneAssign.statusCode).toBe(409);

    const groupAssignment = Object.fromEntries(
      entrantIds.map((id, index) => [id, (index % 2) + 1]),
    );
    const assignedGroups = await harness.request({
      method: 'POST',
      url: `${manualStageBase}/zones/${manualZone?.number}/groups/assign`,
      token: 'organizer-org1',
      payload: { assignment: { groups: groupAssignment }, groupCount: 2 },
    });
    expect(assignedGroups.statusCode).toBe(200);
    expect(assignedGroups.json().assignment.groups).toEqual(groupAssignment);
    const groups = assignedGroups.json().groups as Array<{ groupId: string }>;
    expect(groups).toHaveLength(2);

    const groupEntrants = await Promise.all(
      groups.map((group) => competition.listEntrantIdsOfGroup(group.groupId)),
    );
    expect(groupEntrants.flat().sort()).toEqual([...entrantIds].sort());
    expect(manualStage.number).toBe(3);

    const zoneEntrants = await harness.request({
      method: 'GET',
      url: `${manualStageBase}/zones/${manualZone?.number}/entrants`,
    });
    expect(zoneEntrants.statusCode).toBe(200);
    expect((zoneEntrants.json() as string[]).sort()).toEqual([...entrantIds].sort());
  });
});
