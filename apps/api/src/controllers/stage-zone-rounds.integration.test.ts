import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { buildTestApp } from './test-support/integration-harness.js';
import { StagesController } from './stages.controller.js';
import { ZonesGroupsController } from './zones-groups.controller.js';

/**
 * Dynamic round generation inside zones. Every scenario builds its own stage so the fixtures and
 * results of one cannot leak into another; the zones are laid out with the repository, the same way
 * a draw would persist them, and the rounds themselves are generated through the real route.
 */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;
const organizationAlias = 'liga-orbital';
const tournamentAlias = 'copa-rondas';

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-000000009903',
    version: '1.0.0',
    name: 'Copa de rondas',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'points', label: 'Puntos', aggregation: 'sum' }],
    scoringInputs: [],
    availableFormats: ['swiss', 'round-robin', 'single-elimination'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
  } as unknown as DisciplineDescriptor;
}

interface ZonePlan {
  readonly name: string;
  readonly format?: 'swiss' | 'round-robin' | 'single-elimination';
  readonly entrants: number;
}

interface BuiltZone {
  readonly zoneId: string;
  readonly number: number;
  readonly entrantIds: readonly string[];
}

describe('zone-scoped dynamic rounds (integration)', () => {
  const base = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages`;
  let harness: Awaited<ReturnType<typeof buildTestApp>>;
  let competition: CompetitionRepository;
  let tournamentId = '';
  let nextStageNumber = 1;
  let teamCounter = 0;

  beforeAll(async () => {
    harness = await buildTestApp([StagesController, ZonesGroupsController]);
    competition = new CompetitionRepository(harness.scratch.db);
    const tournaments = new TournamentRepository(harness.scratch.db);
    const discipline = descriptor();
    tournamentId = await withTransaction(harness.scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, discipline, {
        organizationId: harness.organizationId,
        ...AUDIT,
      });
      const tournament = await tournaments.create(uow, {
        organizationId: harness.organizationId,
        alias: tournamentAlias,
        name: 'Copa Rondas',
        descriptor: discipline,
        ...AUDIT,
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: harness.organizationId,
        descriptor: discipline,
        overrides: { format: 'swiss' },
        ...AUDIT,
      });
      return tournament.tournamentId;
    });
    await withTransaction(harness.scratch.db, (uow) =>
      tournaments.publish(uow, {
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

  async function acceptedEntrants(count: number): Promise<readonly string[]> {
    const enrollment = new EnrollmentRepository(harness.scratch.db);
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      teamCounter += 1;
      const entrantId = await withTransaction(harness.scratch.db, async (uow) => {
        const team = await enrollment.createTeam(uow, {
          organizationId: harness.organizationId,
          name: `Equipo ${teamCounter}`,
          ...AUDIT,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId: harness.organizationId,
          ...AUDIT,
        });
        return entrant.entrantId;
      });
      await withTransaction(harness.scratch.db, (uow) =>
        enrollment.setEntrantStatus(uow, {
          entrantId,
          status: 'accepted',
          organizationId: harness.organizationId,
          ...AUDIT,
        }),
      );
      ids.push(entrantId);
    }
    return ids;
  }

  /** A stage of `stageFormat` whose zones each hold round one, entrants paired in listed order. */
  async function buildStage(
    stageFormat: 'swiss' | 'round-robin' | 'single-elimination',
    plans: readonly ZonePlan[],
  ): Promise<{ readonly number: number; readonly stageId: string; readonly zones: BuiltZone[] }> {
    const number = nextStageNumber;
    nextStageNumber += 1;
    const stage = await withTransaction(harness.scratch.db, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId,
        number,
        name: `Fase ${number}`,
        format: stageFormat,
        organizationId: harness.organizationId,
        ...AUDIT,
      }),
    );
    const zones: BuiltZone[] = [];
    for (const [index, plan] of plans.entries()) {
      const zone = await withTransaction(harness.scratch.db, (uow) =>
        competition.createZone(uow, {
          stageId: stage.stageId,
          number: index + 1,
          name: plan.name,
          ...(plan.format === undefined ? {} : { format: plan.format }),
          organizationId: harness.organizationId,
          ...AUDIT,
        }),
      );
      zones.push({
        zoneId: zone.zoneId,
        number: zone.number,
        entrantIds: await acceptedEntrants(plan.entrants),
      });
    }
    await withTransaction(harness.scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: zones.flatMap((zone) =>
          Array.from({ length: zone.entrantIds.length / 2 }, (_, pair) => ({
            round: 1,
            homeEntrantId: zone.entrantIds[pair * 2] as string,
            awayEntrantId: zone.entrantIds[pair * 2 + 1] as string,
            zoneId: zone.zoneId,
          })),
        ),
        organizationId: harness.organizationId,
        ...AUDIT,
      }),
    );
    return { number, stageId: stage.stageId, zones };
  }

  /** Finalizes every match of one zone's round with a home win. */
  async function finishRound(stageId: string, zoneId: string, round: number): Promise<void> {
    const fixtures = (await competition.listFixturesOfStage(stageId)).filter(
      (fixture) => fixture.zoneId === zoneId && fixture.round === round,
    );
    const matches = await competition.listMatchesForStage(stageId);
    for (const fixture of fixtures) {
      const match = matches.find((candidate) => candidate.fixtureId === fixture.fixtureId);
      if (!match || !fixture.homeEntrantId || !fixture.awayEntrantId) continue;
      const { homeEntrantId, awayEntrantId } = fixture;
      await withTransaction(harness.scratch.db, (uow) =>
        competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [
              { entrantId: homeEntrantId, statistics: { points: 1 } },
              { entrantId: awayEntrantId, statistics: { points: 0 } },
            ],
            winnerEntrantId: homeEntrantId,
            recordedAt: new Date().toISOString(),
          },
          organizationId: harness.organizationId,
          ...AUDIT,
        }),
      );
    }
  }

  const nextRound = (stageNumber: number, payload?: unknown) =>
    harness.request({
      method: 'POST',
      url: `${base}/${stageNumber}/rounds/next`,
      token: 'organizer-org1',
      payload,
    });

  const fixturesOf = async (stageId: string, round?: number) =>
    (await competition.listFixturesOfStage(stageId)).filter(
      (fixture) => round === undefined || fixture.round === round,
    );

  it('pairs a zone only among its own entrants and stamps the new fixtures with that zone', async () => {
    const stage = await buildStage('swiss', [
      { name: 'Zona A', entrants: 4 },
      { name: 'Zona B', entrants: 4 },
    ]);
    const [zoneA, zoneB] = stage.zones as [BuiltZone, BuiltZone];
    await finishRound(stage.stageId, zoneA.zoneId, 1);
    await finishRound(stage.stageId, zoneB.zoneId, 1);

    const response = await nextRound(stage.number, { zoneNumber: 2 });

    expect(response.statusCode).toBe(200);
    const created = await fixturesOf(stage.stageId, 2);
    expect(created).toHaveLength(2);
    expect(created.every((fixture) => fixture.zoneId === zoneB.zoneId)).toBe(true);
    for (const fixture of created) {
      expect(zoneB.entrantIds).toContain(fixture.homeEntrantId);
      expect(zoneB.entrantIds).toContain(fixture.awayEntrantId);
    }
  });

  it('advances two zones independently, each counting its own rounds', async () => {
    const stage = await buildStage('swiss', [
      { name: 'Zona A', entrants: 4 },
      { name: 'Zona B', entrants: 4 },
    ]);
    const [zoneA, zoneB] = stage.zones as [BuiltZone, BuiltZone];
    await finishRound(stage.stageId, zoneA.zoneId, 1);
    await finishRound(stage.stageId, zoneB.zoneId, 1);

    expect((await nextRound(stage.number, { zoneNumber: 1 })).statusCode).toBe(200);
    await finishRound(stage.stageId, zoneA.zoneId, 2);
    expect((await nextRound(stage.number, { zoneNumber: 1 })).statusCode).toBe(200);

    // Zone A is on round 3 while zone B has never left round 1; B's next round is its second.
    expect((await nextRound(stage.number, { zoneNumber: 2 })).statusCode).toBe(200);
    const all = await fixturesOf(stage.stageId);
    const roundsOf = (zoneId: string) =>
      [...new Set(all.filter((fixture) => fixture.zoneId === zoneId).map((f) => f.round))].sort();
    expect(roundsOf(zoneA.zoneId)).toEqual([1, 2, 3]);
    expect(roundsOf(zoneB.zoneId)).toEqual([1, 2]);
  });

  it('blocks only the zone whose round is unfinished', async () => {
    const stage = await buildStage('swiss', [
      { name: 'Zona A', entrants: 4 },
      { name: 'Zona B', entrants: 4 },
    ]);
    const [zoneA, zoneB] = stage.zones as [BuiltZone, BuiltZone];
    await finishRound(stage.stageId, zoneB.zoneId, 1);

    const blocked = await nextRound(stage.number, { zoneNumber: 1 });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().errorCode).toBe('stage-round-incomplete');

    const open = await nextRound(stage.number, { zoneNumber: 2 });
    expect(open.statusCode).toBe(200);
    expect((await fixturesOf(stage.stageId, 2)).every((f) => f.zoneId === zoneB.zoneId)).toBe(true);
    expect((await fixturesOf(stage.stageId)).filter((f) => f.zoneId === zoneA.zoneId)).toHaveLength(
      2,
    );
  });

  it('advances the Swiss zone of a stage whose other zone plays round-robin', async () => {
    const stage = await buildStage('swiss', [
      { name: 'Zona A', entrants: 4 },
      { name: 'Zona B', format: 'round-robin', entrants: 4 },
    ]);
    const [swissZone] = stage.zones as [BuiltZone, BuiltZone];
    await finishRound(stage.stageId, swissZone.zoneId, 1);

    const response = await nextRound(stage.number, { zoneNumber: 1 });

    expect(response.statusCode).toBe(200);
    const created = await fixturesOf(stage.stageId, 2);
    expect(created.every((fixture) => fixture.zoneId === swissZone.zoneId)).toBe(true);
  });

  it('advances a Swiss zone declared inside a stage that is not itself Swiss', async () => {
    const stage = await buildStage('round-robin', [
      { name: 'Zona A', format: 'swiss', entrants: 4 },
      { name: 'Zona B', entrants: 4 },
    ]);
    const [swissZone] = stage.zones as [BuiltZone, BuiltZone];
    await finishRound(stage.stageId, swissZone.zoneId, 1);

    const response = await nextRound(stage.number, { zoneNumber: 1 });

    expect(response.statusCode).toBe(200);
  });

  it('refuses a zone whose effective format has no dynamic rounds, naming the zone', async () => {
    const stage = await buildStage('swiss', [
      { name: 'Zona A', entrants: 4 },
      { name: 'Zona B', format: 'round-robin', entrants: 4 },
    ]);

    const response = await nextRound(stage.number, { zoneNumber: 2 });

    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('zone-not-dynamic');
    expect(await fixturesOf(stage.stageId, 2)).toHaveLength(0);
  });

  it('requires the zone on a stage with several zones and says which are eligible', async () => {
    const stage = await buildStage('swiss', [
      { name: 'Zona A', entrants: 4 },
      { name: 'Zona B', format: 'round-robin', entrants: 4 },
      { name: 'Zona C', entrants: 4 },
    ]);

    const response = await nextRound(stage.number);

    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('stage-zone-required');
    expect(response.json().message).toContain('1');
    expect(response.json().message).toContain('3');
    expect(await fixturesOf(stage.stageId, 2)).toHaveLength(0);
  });

  it('404s a zone number the stage does not have', async () => {
    const stage = await buildStage('swiss', [
      { name: 'Zona A', entrants: 4 },
      { name: 'Zona B', entrants: 4 },
    ]);

    const response = await nextRound(stage.number, { zoneNumber: 9 });

    expect(response.statusCode).toBe(404);
    expect(response.json().errorCode).toBe('zone-not-found');
  });

  it.each([{ zoneNumber: 0 }, { zoneNumber: 'two' }, { zoneNumber: 1, extra: true }])(
    'rejects a malformed request body %j before reaching the stage',
    async (payload) => {
      const stage = await buildStage('swiss', [{ name: 'Única', entrants: 4 }]);

      const response = await nextRound(stage.number, payload);

      expect(response.statusCode).toBe(400);
      expect(await fixturesOf(stage.stageId, 2)).toHaveLength(0);
    },
  );

  it('keeps a stage with one zone working without naming it', async () => {
    const stage = await buildStage('swiss', [{ name: 'Única', entrants: 4 }]);
    const [only] = stage.zones as [BuiltZone];
    await finishRound(stage.stageId, only.zoneId, 1);

    const response = await nextRound(stage.number);

    expect(response.statusCode).toBe(200);
    const created = await fixturesOf(stage.stageId, 2);
    expect(created).toHaveLength(2);
    expect(created.every((fixture) => fixture.zoneId === only.zoneId)).toBe(true);
  });

  it('advances single-elimination inside one zone from that zone’s winners', async () => {
    const stage = await buildStage('single-elimination', [
      { name: 'Zona A', entrants: 4 },
      { name: 'Zona B', entrants: 4 },
    ]);
    const [, zoneB] = stage.zones as [BuiltZone, BuiltZone];
    await finishRound(stage.stageId, zoneB.zoneId, 1);

    const response = await nextRound(stage.number, { zoneNumber: 2 });

    expect(response.statusCode).toBe(200);
    const created = await fixturesOf(stage.stageId, 2);
    expect(created).toHaveLength(1);
    expect(created[0]?.zoneId).toBe(zoneB.zoneId);
    const winners = [zoneB.entrantIds[0], zoneB.entrantIds[2]];
    expect(winners).toContain(created[0]?.homeEntrantId);
    expect(winners).toContain(created[0]?.awayEntrantId);
  });
});
