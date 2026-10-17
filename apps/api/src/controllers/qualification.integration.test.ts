import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OutboxReader,
  ScheduleRepository,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { MatchControlController } from './match-control.controller.js';
import { QualificationController } from './qualification.controller.js';
import { SeedingController } from './seeding.controller.js';
import { StagesController } from './stages.controller.js';
import { buildTestApp } from './test-support/integration-harness.js';
import { ZonesGroupsController } from './zones-groups.controller.js';

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' };

/** Two groups of four play a round robin; the top two of each feed a four-team cup. */
describe('next stage generated ahead and confirmed (integration)', () => {
  let harness: Awaited<ReturnType<typeof buildTestApp>>;
  const tournamentBase = (alias: string) => `/organizations/liga-orbital/tournaments/${alias}`;
  const request = (
    method: 'GET' | 'POST',
    url: string,
    payload?: unknown,
    token = 'organizer-org1',
  ) =>
    harness.app.inject({
      method,
      url,
      payload: payload as never,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': newId() },
    });

  beforeAll(async () => {
    harness = await buildTestApp([
      SeedingController,
      StagesController,
      ZonesGroupsController,
      QualificationController,
      MatchControlController,
    ]);
  });
  afterAll(async () => {
    await harness?.app.close();
    await harness?.scratch.drop();
  });

  interface GroupMatch {
    readonly matchId: string;
    readonly home: string;
    readonly away: string;
  }

  async function setup() {
    const { db } = harness.scratch;
    const audit = { ...AUDIT, organizationId: harness.organizationId };
    const alias = `copa-${newId()}`;
    const descriptor = {
      descriptorId: newId(),
      alias: `sport-${newId()}`,
      version: '1.0.0',
      name: 'Grupos y copa',
      attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
      participantTypes: ['team'],
      rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
      segmentTypes: [],
      eventDefinitions: [],
      statistics: [{ code: 'points', label: 'Puntos', aggregation: 'sum' }],
      scoringInputs: [],
      availableFormats: ['round-robin', 'single-elimination'],
      notificationRuleCapabilities: [],
      winCondition: {},
      defaults: {},
      fieldPolicies: Object.fromEntries(
        ['format', 'placementPlay'].map((field) => [
          field,
          { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
        ]),
      ),
    } as unknown as DisciplineDescriptor;
    const tournaments = new TournamentRepository(db);
    const enrollment = new EnrollmentRepository(db);
    const entrantIds: string[] = [];
    const tournament = await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, audit);
      const created = await tournaments.create(uow, { alias, name: 'Copa', descriptor, ...audit });
      await tournaments.createRuleset(uow, {
        tournamentId: created.tournamentId,
        descriptor,
        overrides: { format: 'round-robin' },
        ...audit,
      });
      for (const name of ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']) {
        const team = await enrollment.createTeam(uow, { name, ...audit });
        const entrant = await enrollment.registerEntrant(uow, {
          tournamentId: created.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          abbreviation: name,
          ...audit,
        });
        await enrollment.setEntrantStatus(uow, {
          entrantId: entrant.entrantId,
          status: 'accepted',
          ...audit,
        });
        entrantIds.push(entrant.entrantId);
      }
      return created;
    });
    await withTransaction(db, (uow) =>
      tournaments.publish(uow, { tournamentId: tournament.tournamentId, ...audit }),
    );
    const groupsStage = await request('POST', `${tournamentBase(alias)}/stages`, {
      format: 'round-robin',
    });
    expect(groupsStage.statusCode).toBe(201);
    const cupStage = await request('POST', `${tournamentBase(alias)}/stages`, {
      format: 'single-elimination',
    });
    expect(cupStage.statusCode).toBe(201);
    const groupsBase = `${tournamentBase(alias)}/stages/1`;
    const cupBase = `${tournamentBase(alias)}/stages/2`;

    const zones = await request('POST', `${groupsBase}/zones/assign`, {
      assignment: { groups: Object.fromEntries(entrantIds.map((id) => [id, 1])) },
      zoneCount: 1,
    });
    expect(zones.statusCode).toBe(200);
    const groups = await request('POST', `${groupsBase}/zones/1/groups/assign`, {
      assignment: {
        groups: Object.fromEntries(entrantIds.map((id, index) => [id, index < 4 ? 1 : 2])),
      },
      groupCount: 2,
    });
    expect(groups.statusCode).toBe(200);
    const [zone] = zones.json().zones as { zoneId: string }[];
    const declared = groups.json().groups as { groupId: string; number: number; name: string }[];
    const groupA = declared.find((group) => group.number === 1);
    const groupB = declared.find((group) => group.number === 2);
    if (!zone || !groupA || !groupB) throw new Error('Expected one zone with two groups');

    const competition = new CompetitionRepository(db);
    const matches: GroupMatch[] = [];
    await withTransaction(db, async (uow) => {
      for (const [groupId, members] of [
        [groupA.groupId, entrantIds.slice(0, 4)],
        [groupB.groupId, entrantIds.slice(4)],
      ] as const) {
        for (let i = 0; i < members.length; i += 1) {
          for (let j = i + 1; j < members.length; j += 1) {
            const [fixture] = await competition.createFixtures(uow, {
              stageId: groupsStage.json().stageId,
              fixtures: [
                {
                  round: 1,
                  zoneId: zone.zoneId,
                  groupId,
                  homeEntrantId: members[i],
                  awayEntrantId: members[j],
                },
              ],
              ...audit,
            });
            if (!fixture) throw new Error('Expected a group fixture');
            const match = await competition.createMatch(uow, {
              fixtureId: fixture.fixtureId,
              number: 1,
              ...audit,
            });
            matches.push({
              matchId: match.matchId,
              home: members[i] as string,
              away: members[j] as string,
            });
          }
        }
      }
    });

    const plan = await request('POST', `${groupsBase}/zones/1/promotion-plan`, {
      nextStageNumber: 2,
      perGroupAdvance: 2,
      combination: { mode: 'group-order' },
    });
    expect(plan.statusCode).toBe(201);

    /** The earlier-listed entrant wins every game unless a draw is asked for. */
    async function play(games: readonly GroupMatch[], draw?: GroupMatch) {
      await withTransaction(db, async (uow) => {
        for (const game of games) {
          const level = game === draw;
          await competition.recordResult(uow, {
            matchId: game.matchId,
            result: {
              sides: [
                { entrantId: game.home, statistics: { points: level ? 1 : 3 } },
                { entrantId: game.away, statistics: { points: level ? 1 : 0 } },
              ],
              ...(level ? {} : { winnerEntrantId: game.home }),
              recordedAt: '2026-10-16T12:00:00.000Z',
            },
            ...audit,
          });
        }
      });
    }

    /** Rewrites a stored result in place, standing in for a result landing elsewhere. */
    async function rewrite(game: GroupMatch, winner: string) {
      const loser = winner === game.home ? game.away : game.home;
      await db
        .updateTable('matches')
        .set({
          status: 'finalized',
          result: JSON.stringify({
            sides: [
              { entrantId: winner, statistics: { points: 3 } },
              { entrantId: loser, statistics: { points: 0 } },
            ],
            winnerEntrantId: winner,
            recordedAt: '2026-10-16T13:00:00.000Z',
          }),
        })
        .where('match_id', '=', game.matchId)
        .execute();
    }

    const [a1, a2, a3, a4, b1, b2, b3, b4] = entrantIds as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return {
      alias,
      audit,
      groupsBase,
      cupBase,
      cupStageId: cupStage.json().stageId as string,
      groupNames: { a: groupA.name, b: groupB.name },
      promotionPlanId: plan.json().promotionPlanId as string,
      matches,
      play,
      rewrite,
      entrants: { a1, a2, a3, a4, b1, b2, b3, b4 },
    };
  }

  async function cupFixtures(stageId: string) {
    return harness.scratch.db
      .selectFrom('fixtures')
      .select(['fixture_id', 'node_key', 'home_entrant_id', 'away_entrant_id', 'home_source'])
      .where('stage_id', '=', stageId)
      .orderBy('round')
      .orderBy('position')
      .execute();
  }

  it('refuses generating a stage ahead when no promotion plan routes to it', async () => {
    const cup = await setup();
    const third = await request('POST', `${tournamentBase(cup.alias)}/stages`, {
      format: 'single-elimination',
    });
    expect(third.statusCode).toBe(201);
    const refused = await request('POST', `${tournamentBase(cup.alias)}/stages/3/seeding`, {
      ahead: true,
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ errorCode: 'seeding-promotion-plan-missing' });
    expect(refused.json().message).toContain('stage 3');
  });

  it('generates the cup ahead while groups play, labelled by group and rank', async () => {
    const cup = await setup();
    await cup.play(cup.matches.slice(0, 3));

    const seeding = await request('GET', `${cup.cupBase}/seeding`);
    expect(seeding.statusCode).toBe(200);
    expect(seeding.json().qualifiers).toEqual([
      expect.objectContaining({
        format: 'single-elimination',
        seeds: [
          expect.objectContaining({
            position: 1,
            qualifierLabel: {
              kind: 'group-rank',
              rank: 1,
              groupNumber: 1,
              groupName: cup.groupNames.a,
            },
          }),
          expect.objectContaining({
            position: 2,
            qualifierLabel: expect.objectContaining({ rank: 2, groupNumber: 1 }),
          }),
          expect.objectContaining({
            position: 3,
            qualifierLabel: expect.objectContaining({ rank: 1, groupNumber: 2 }),
          }),
          expect.objectContaining({
            position: 4,
            qualifierLabel: expect.objectContaining({ rank: 2, groupNumber: 2 }),
          }),
        ],
      }),
    ]);

    const generated = await request('POST', `${cup.cupBase}/seeding`, { ahead: true });
    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({ persisted: true });

    const fixtures = await cupFixtures(cup.cupStageId);
    expect(fixtures).toHaveLength(3);
    expect(fixtures.every((fixture) => fixture.home_entrant_id === null)).toBe(true);

    const bracket = await request('GET', `${cup.cupBase}/seeding`);
    const [zone] = bracket.json().zones as {
      matches: { round: number; homeSource?: unknown; awaySource?: unknown }[];
    }[];
    const semis = zone?.matches.filter((match) => match.round === 1) ?? [];
    // Seed 1 meets seed 4: the first of group A against the runner-up of group B.
    expect(semis[0]).toMatchObject({
      homeSource: {
        kind: 'qualifier',
        promotionPlanId: cup.promotionPlanId,
        position: 1,
        qualifierLabel: { kind: 'group-rank', rank: 1, groupName: cup.groupNames.a },
      },
      awaySource: {
        kind: 'qualifier',
        position: 4,
        qualifierLabel: { kind: 'group-rank', rank: 2, groupName: cup.groupNames.b },
      },
    });
  });

  it('previews and confirms only once the groups are complete, keeping every slot', async () => {
    const cup = await setup();
    await cup.play(cup.matches.slice(0, 2));
    expect((await request('POST', `${cup.cupBase}/seeding`, { ahead: true })).statusCode).toBe(200);

    const incomplete = await request('POST', `${cup.cupBase}/qualification/preview`);
    expect(incomplete.statusCode).toBe(200);
    expect(incomplete.json()).toMatchObject({ state: 'incomplete' });
    expect(incomplete.json().incomplete).toHaveLength(10);
    const early = await request('POST', `${cup.cupBase}/qualification/confirm`, {});
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ errorCode: 'qualification-stage-incomplete' });

    await cup.play(cup.matches.slice(2));
    // Finishing the last group game fills nothing by itself.
    expect(
      (await cupFixtures(cup.cupStageId)).every((fixture) => fixture.home_entrant_id === null),
    ).toBe(true);

    // A slot placed while undecided stays placed through confirmation.
    const cupMatches = await new CompetitionRepository(harness.scratch.db).listMatchesForStage(
      cup.cupStageId,
    );
    const schedules = new ScheduleRepository(harness.scratch.db);
    await withTransaction(harness.scratch.db, async (uow) => {
      const venue = await schedules.createVenue(uow, {
        ...cup.audit,
        alias: `cancha-${newId()}`,
        name: 'Cancha',
        concurrentCapacity: 1,
      });
      const startsAt = Date.UTC(2026, 10, 7, 14);
      const schedule = await schedules.createSchedule(uow, {
        ...cup.audit,
        name: 'Copa',
        startsAt,
        endsAt: startsAt + 6 * 60 * 60_000,
        slotMinutes: 120,
        turnaroundMinutes: 0,
        venueIds: [venue.venueId],
      });
      const slots = await schedules.listScheduleSlots(schedule.scheduleId, uow);
      await schedules.publishSchedule(uow, {
        ...cup.audit,
        assignments: cupMatches.map((match, index) => ({
          matchId: match.matchId,
          slotId: slots[index]?.slotId as string,
        })),
      });
    });

    const preview = await request('POST', `${cup.cupBase}/qualification/preview`);
    expect(preview.json()).toMatchObject({ state: 'ready', incomplete: [] });
    const { a1, a2, b1, b2 } = cup.entrants;
    expect(
      (preview.json().positions as { position: number; entrantId: string }[]).map((entry) => [
        entry.position,
        entry.entrantId,
      ]),
    ).toEqual([
      [1, a1],
      [2, a2],
      [3, b1],
      [4, b2],
    ]);
    expect(preview.json().names[a1]).toBe('A1');

    const refused = await request(
      'POST',
      `${cup.cupBase}/qualification/confirm`,
      {},
      'participant-org1',
    );
    expect(refused.statusCode).toBe(403);
    expect(
      (await cupFixtures(cup.cupStageId)).every((fixture) => fixture.home_entrant_id === null),
    ).toBe(true);

    const confirmed = await request('POST', `${cup.cupBase}/qualification/confirm`, {
      expected: (
        preview.json().positions as {
          promotionPlanId: string;
          position: number;
          entrantId: string;
        }[]
      ).map(({ promotionPlanId, position, entrantId }) => ({
        promotionPlanId,
        position,
        entrantId,
      })),
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ state: 'confirmed', changedSides: 4 });

    const fixtures = await cupFixtures(cup.cupStageId);
    expect(
      fixtures.slice(0, 2).map((fixture) => [fixture.home_entrant_id, fixture.away_entrant_id]),
    ).toEqual([
      [a1, b2],
      [a2, b1],
    ]);
    expect(fixtures[2]).toMatchObject({ home_entrant_id: null, away_entrant_id: null });
    const bracket = await request('GET', `${cup.cupBase}/seeding`);
    const semi = (bracket.json().zones[0].matches as { round: number; homeSource: unknown }[]).find(
      (match) => match.round === 1,
    );
    expect(semi?.homeSource).toMatchObject({ kind: 'qualifier', position: 1 });
    expect(
      (await schedules.listScheduleDetailsForStage(cup.cupStageId))
        .map((entry) => entry.matchId)
        .sort(),
    ).toEqual(cupMatches.map((match) => match.matchId).sort());
    const resolved = (await new OutboxReader(harness.scratch.db).pending(10_000)).filter(
      (event) =>
        event.eventType === 'fixture.entrant-resolved' &&
        cupMatches.some((match) => match.matchId === event.entityId),
    );
    expect(resolved).toHaveLength(4);

    const plan = await request('POST', `${cup.groupsBase}/zones/1/promotion-plan`, {
      nextStageNumber: 2,
      perGroupAdvance: 2,
      combination: { mode: 'group-order' },
    });
    expect(plan.statusCode).toBe(201);
    expect(plan.json()).toMatchObject({ mutationClass: 'requires_rebuild' });
  });

  it('refuses confirmation while a cut line is tied, naming the entrants and the position', async () => {
    const cup = await setup();
    const { b2, b3 } = cup.entrants;
    const level = cup.matches.find((game) => game.home === b2 && game.away === b3);
    await cup.play(cup.matches, level);
    expect((await request('POST', `${cup.cupBase}/seeding`, { ahead: true })).statusCode).toBe(200);

    const preview = await request('POST', `${cup.cupBase}/qualification/preview`);
    expect(preview.json()).toMatchObject({
      state: 'tied',
      tie: { promotionPlanId: cup.promotionPlanId, positions: [4], groupName: cup.groupNames.b },
    });
    expect([...preview.json().tie.entrantIds].sort()).toEqual([b2, b3].sort());
    const refused = await request('POST', `${cup.cupBase}/qualification/confirm`, {});
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      errorCode: 'qualification-tie-unresolved',
      tie: { positions: [4] },
    });
  });

  it('refuses a confirmation whose preview a later result overtook, and flags a stale confirmation', async () => {
    const cup = await setup();
    await cup.play(cup.matches);
    expect((await request('POST', `${cup.cupBase}/seeding`, { ahead: true })).statusCode).toBe(200);
    const preview = await request('POST', `${cup.cupBase}/qualification/preview`);
    const expected = (
      preview.json().positions as { promotionPlanId: string; position: number; entrantId: string }[]
    ).map(({ promotionPlanId, position, entrantId }) => ({ promotionPlanId, position, entrantId }));

    const { a1, a2 } = cup.entrants;
    const topOfA = cup.matches.find((game) => game.home === a1 && game.away === a2);
    if (!topOfA) throw new Error('Expected A1 against A2');
    await cup.rewrite(topOfA, a2);
    const raced = await request('POST', `${cup.cupBase}/qualification/confirm`, { expected });
    expect(raced.statusCode).toBe(409);
    expect(raced.json()).toMatchObject({ errorCode: 'qualification-preview-stale' });

    const confirmed = await request('POST', `${cup.cupBase}/qualification/confirm`, {});
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().positions[0]).toMatchObject({ position: 1, entrantId: a2 });

    await withTransaction(harness.scratch.db, (uow) =>
      new MatchAssignmentRepository(harness.scratch.db).appoint(uow, {
        subjectId: 'organizer-1',
        scope: { kind: 'match', matchId: topOfA.matchId },
        capabilities: ['match.finalize'],
        ...cup.audit,
      }),
    );
    const correction = await request(
      'POST',
      `${tournamentBase(cup.alias)}/matches/${topOfA.matchId}/corrections/preview`,
      {
        reason: 'Planilla mal cargada',
        sides: [
          { entrantId: a1, statistics: { points: 3 } },
          { entrantId: a2, statistics: { points: 0 } },
        ],
        winnerEntrantId: a1,
      },
    );
    expect(correction.statusCode).toBe(201);
    expect(correction.json().staleQualifications).toEqual([
      {
        stageNumber: 2,
        promotionPlanId: cup.promotionPlanId,
        positions: [
          { position: 1, confirmedEntrantId: a2, resultingEntrantId: a1 },
          { position: 2, confirmedEntrantId: a1, resultingEntrantId: a2 },
        ],
      },
    ]);
    // The preview wrote nothing: the stored confirmation still matches the standings.
    expect((await request('POST', `${cup.cupBase}/qualification/preview`)).json().state).toBe(
      'confirmed',
    );

    await cup.rewrite(topOfA, a1);
    expect((await request('POST', `${cup.cupBase}/qualification/preview`)).json().state).toBe(
      'stale',
    );
  });
});
