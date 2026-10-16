import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  EventStreamReader,
  MatchAssignmentRepository,
  PersonRepository,
  ScheduleRepository,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { MatchControlController } from './match-control.controller.js';
import { PublicProjectionsController } from './public-projections.controller.js';
import { SeedingController } from './seeding.controller.js';
import { StagesController } from './stages.controller.js';
import { buildTestApp } from './test-support/integration-harness.js';

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' };

describe('persisted bracket activation through HTTP', () => {
  let harness: Awaited<ReturnType<typeof buildTestApp>>;
  const tournamentBase = (alias: string) => `/organizations/liga-orbital/tournaments/${alias}`;
  const matchBase = (alias: string, matchId: string) =>
    `${tournamentBase(alias)}/matches/${matchId}`;
  const request = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    harness.app.inject({
      method,
      url,
      payload: payload as never,
      headers: {
        authorization: 'Bearer organizer-org1',
        'idempotency-key': newId(),
      },
    });

  beforeAll(async () => {
    harness = await buildTestApp([
      SeedingController,
      StagesController,
      MatchControlController,
      PublicProjectionsController,
    ]);
  });
  afterAll(async () => {
    await harness?.app.close();
    await harness?.scratch.drop();
  });

  async function setup(
    options: {
      count?: number;
      placementPlay?: 'none' | 'third-place' | 'all-places';
      span?: number;
      format?: 'single-elimination' | 'double-elimination' | 'swiss';
      appoint?: boolean;
      legacy?: boolean;
      individual?: boolean;
    } = {},
  ) {
    const { db } = harness.scratch;
    const audit = { ...AUDIT, organizationId: harness.organizationId };
    const alias = `cup-${newId()}`;
    const descriptor: DisciplineDescriptor = {
      descriptorId: newId(),
      alias: `sport-${newId()}`,
      version: '1.0.0',
      name: 'Bracket test',
      attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
      participantTypes: [options.individual ? 'person' : 'team'],
      rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
      segmentTypes: [],
      eventDefinitions: [],
      statistics: [],
      scoringInputs: [],
      availableFormats: ['single-elimination', 'double-elimination', 'swiss'],
      notificationRuleCapabilities: [],
      winCondition: {},
      defaults: {},
      fieldPolicies: Object.fromEntries(
        ['format', 'placementPlay', 'series.span', 'series.resolutionClass'].map((field) => [
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
      const tournament = await tournaments.create(uow, {
        alias,
        name: 'Cup',
        descriptor,
        ...audit,
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        descriptor,
        overrides: { format: options.format ?? 'single-elimination' },
        ...audit,
      });
      for (let n = 0; n < (options.count ?? 4); n += 1) {
        const entrantRef = options.individual
          ? {
              kind: 'person' as const,
              personId: (
                await new PersonRepository(uow.tx).register(uow, {
                  displayName: `Player ${n + 1}`,
                  ...audit,
                })
              ).person.personId,
            }
          : {
              kind: 'team' as const,
              teamId: (await enrollment.createTeam(uow, { name: `Team ${n + 1}`, ...audit }))
                .teamId,
            };
        const entrant = await enrollment.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef,
          abbreviation: `E${n + 1}`,
          ...audit,
        });
        await enrollment.setEntrantStatus(uow, {
          entrantId: entrant.entrantId,
          status: 'accepted',
          ...audit,
        });
        entrantIds.push(entrant.entrantId);
      }
      return tournament;
    });
    await withTransaction(db, (uow) =>
      new TournamentRepository(uow.tx).publish(uow, {
        tournamentId: tournament.tournamentId,
        ...audit,
      }),
    );
    const stage = await request('POST', `${tournamentBase(alias)}/stages`, {
      format: options.format ?? 'single-elimination',
      ...(options.span === undefined
        ? {}
        : { series: { span: options.span, resolutionClass: 'best-of' } }),
    });
    expect(stage.statusCode).toBe(201);
    const configuration = await tournaments.findLatestStageConfiguration(stage.json().stageId);
    if (configuration)
      await withTransaction(db, (uow) =>
        tournaments.updateStageConfiguration(uow, {
          stageId: stage.json().stageId,
          changedOverrides: { placementPlay: options.placementPlay ?? 'none' },
          ...audit,
        }),
      );
    else {
      const ruleset = await tournaments.findLatestRuleset(tournament.tournamentId);
      if (!ruleset) throw new Error('Missing ruleset');
      await withTransaction(db, (uow) =>
        tournaments.createStageConfiguration(uow, {
          stageId: stage.json().stageId,
          rulesetId: ruleset.rulesetId,
          overrides: { placementPlay: options.placementPlay ?? 'none' },
          ...audit,
        }),
      );
    }
    const base = `${tournamentBase(alias)}/stages/1`;
    if (options.legacy) {
      await withTransaction(db, (uow) =>
        new CompetitionRepository(db).createFixtures(uow, {
          ...audit,
          stageId: stage.json().stageId,
          fixtures: [0, 2].map((index) => ({
            round: 1,
            homeEntrantId: entrantIds[index],
            awayEntrantId: entrantIds[index + 1],
          })),
        }),
      );
    } else {
      const seeded = await request('POST', `${base}/seeding`, {
        seeds: entrantIds.map((entrantId, n) => ({ entrantId, seed: n + 1 })),
      });
      expect(seeded.statusCode).toBe(200);
    }
    const fixtures = await new CompetitionRepository(db).listFixturesOfStage(stage.json().stageId);
    const matches = await new CompetitionRepository(db).listMatchesForStage(stage.json().stageId);
    await withTransaction(db, async (uow) => {
      for (const match of options.appoint === false ? [] : matches)
        await new MatchAssignmentRepository(db).appoint(uow, {
          subjectId: 'organizer-1',
          scope: { kind: 'match', matchId: match.matchId },
          capabilities: [
            'match.control-clock',
            'match.finalize',
            'match.record-event',
            'match.select-roster',
          ],
          ...audit,
        });
    });
    return {
      alias,
      base,
      tournamentId: tournament.tournamentId,
      stageId: stage.json().stageId as string,
      fixtures,
      matches,
      entrantIds,
    };
  }

  function result(home: string, away: string, winner = home) {
    return {
      sides: [
        { entrantId: home, statistics: {} },
        { entrantId: away, statistics: {} },
      ],
      winnerEntrantId: winner,
    };
  }
  async function play(alias: string, matchId: string, home: string, away: string) {
    expect((await request('POST', `${matchBase(alias, matchId)}/commands/start`)).statusCode).toBe(
      201,
    );
    const response = await request(
      'POST',
      `${matchBase(alias, matchId)}/commands/finalize`,
      result(home, away),
    );
    if (response.statusCode !== 201) throw new Error(response.body);
    expect(response.statusCode).toBe(201);
  }
  async function fixtureRows(stageId: string) {
    return harness.scratch.db
      .selectFrom('fixtures')
      .selectAll()
      .where('stage_id', '=', stageId)
      .orderBy('round')
      .orderBy('position')
      .execute();
  }

  it.each([
    ['third-place', 8],
    ['all-places', 12],
  ] as const)(
    'publishes all eight-entrant %s fixtures and reads their real sources',
    async (placementPlay, count) => {
      const cup = await setup({ count: 8, placementPlay, span: 3 });
      const rows = await fixtureRows(cup.stageId);
      expect(rows).toHaveLength(count);
      expect(cup.matches).toHaveLength(count * 3);
      expect(rows.every((row) => row.node_key !== null)).toBe(true);
      const seeding = await request('GET', `${cup.base}/seeding`);
      expect(seeding.json().releasedAssignments).toBe(0);
      expect(seeding.json().zones[0].matches).toHaveLength(count);
      const publicBracket = await request('GET', `${cup.base}/bracket`);
      expect(publicBracket.statusCode).toBe(200);
      expect(publicBracket.json().zones[0].matches).toHaveLength(count);
      const final = publicBracket
        .json()
        .zones[0].matches.find(
          (match: { bracket: string; round: number }) =>
            match.bracket === 'winners' && match.round === 3,
        );
      expect(final.homeSource).toMatchObject({ kind: 'winner-of', round: 2 });
      expect(cup.matches.some((match) => match.matchId === final.homeSource.matchId)).toBe(true);
      const stageFixtures = await request('GET', `${cup.base}/fixtures`);
      expect(stageFixtures.statusCode).toBe(200);
      const known = stageFixtures
        .json()
        .fixtures.filter(
          (fixture: { homeEntrantId?: string }) => fixture.homeEntrantId !== undefined,
        );
      expect(known).toHaveLength(4);
      for (const fixture of known) {
        expect(fixture.homeName).toMatch(/^Team [1-8]$/);
        expect(fixture.awayName).toMatch(/^Team [1-8]$/);
        expect(fixture.homeName).not.toBe(fixture.homeEntrantId);
      }
      const pending = stageFixtures
        .json()
        .fixtures.find((fixture: { round: number }) => fixture.round === 3);
      expect(pending.homeName).toBeUndefined();
      expect(pending.awayName).toBeUndefined();
      const next = await request('POST', `${cup.base}/rounds/next`);
      expect(next.statusCode).toBe(409);
      expect(next.json().errorCode).toBe('stage-graph-persisted');
    },
  );

  it('resolves individual names and persisted abbreviations through the fixtures endpoint', async () => {
    const cup = await setup({ individual: true });
    const response = await request('GET', `${cup.base}/fixtures`);
    expect(response.statusCode).toBe(200);
    const known = response
      .json()
      .fixtures.filter(
        (fixture: { homeEntrantId?: string }) => fixture.homeEntrantId !== undefined,
      );
    expect(known).toHaveLength(2);
    for (const fixture of known) {
      expect(fixture.homeName).toMatch(/^Player [1-4]$/);
      expect(fixture.awayName).toMatch(/^Player [1-4]$/);
      expect(fixture.homeAbbreviation).toBe(fixture.homeName.replace('Player ', 'E'));
      expect(fixture.awayAbbreviation).toBe(fixture.awayName.replace('Player ', 'E'));
    }
  });

  it('persists no bye fixture for six entrants', async () => {
    const cup = await setup({ count: 6 });
    expect(cup.fixtures).toHaveLength(5);
    expect(cup.matches).toHaveLength(5);
  });

  it.each(['single-elimination', 'swiss'] as const)(
    'keeps next-round generation available for legacy %s',
    async (format) => {
      const cup = await setup({ format, legacy: true });
      const before = await request('GET', `${cup.base}/bracket`);
      expect(before.statusCode).toBe(200);
      const normalized = before
        .json()
        .zones[0].matches.map(
          (match: {
            round: number;
            bracket: string;
            nodeKey?: string;
            slots: { kind: string }[];
          }) => ({
            round: match.round,
            bracket: match.bracket,
            nodeKey: match.nodeKey,
            kinds: match.slots.map((slot) => slot.kind),
          }),
        );
      if (format === 'single-elimination')
        expect(normalized).toEqual([
          { round: 1, bracket: 'winners', nodeKey: undefined, kinds: ['entrant', 'entrant'] },
          { round: 1, bracket: 'winners', nodeKey: undefined, kinds: ['entrant', 'entrant'] },
          { round: 2, bracket: 'winners', nodeKey: undefined, kinds: ['winner-of', 'winner-of'] },
        ]);
      for (const fixture of cup.fixtures) {
        const game = cup.matches.find((match) => match.fixtureId === fixture.fixtureId);
        if (!game || !fixture.homeEntrantId || !fixture.awayEntrantId)
          throw new Error('Missing legacy fixture');
        await play(cup.alias, game.matchId, fixture.homeEntrantId, fixture.awayEntrantId);
      }
      const next = await request('POST', `${cup.base}/rounds/next`);
      expect(next.statusCode).toBe(200);
      expect((await fixtureRows(cup.stageId)).every((fixture) => fixture.node_key === null)).toBe(
        true,
      );
    },
  );

  it('refuses every operation on undecided sides without recording facts', async () => {
    const cup = await setup();
    const final = (await fixtureRows(cup.stageId)).find((row) => row.round === 2);
    const game = cup.matches.find((match) => match.fixtureId === final?.fixture_id);
    if (!game) throw new Error('Missing final');
    const console = await request('GET', `${matchBase(cup.alias, game.matchId)}/console`);
    expect(console.statusCode).toBe(200);
    expect(console.json()).toMatchObject({
      homeSource: { kind: 'winner-of' },
      awaySource: { kind: 'winner-of' },
    });
    const [home, away] = cup.entrantIds;
    if (!home || !away) throw new Error('Missing entrants');
    for (const [path, payload] of [
      ['commands/start', undefined],
      ['commands/finalize', result(home, away)],
      ['events', { definitionCode: 'goal', segmentId: newId(), occurredAt: Date.now() }],
      ['bulk-load', { rosters: [], segments: [], events: [], result: result(home, away) }],
    ] as const) {
      const response = await request(
        'POST',
        `${matchBase(cup.alias, game.matchId)}/${path}`,
        payload,
      );
      expect(response.statusCode).toBe(409);
      expect(response.json().errorCode).toBe('match-side-undecided');
      expect(response.json().undecidedSides).toHaveLength(2);
    }
    expect(
      (await new CompetitionRepository(harness.scratch.db).findMatch(game.matchId))?.status,
    ).toBe('scheduled');
  });

  it.each(['finalize', 'bulk-load'] as const)(
    'resolves advancement atomically through %s and scopes events to its tournament',
    async (path) => {
      const cup = await setup();
      const semi = cup.fixtures.find((fixture) => fixture.round === 1);
      const game = cup.matches.find((match) => match.fixtureId === semi?.fixtureId);
      if (!game || !semi?.homeEntrantId || !semi.awayEntrantId) throw new Error('Missing semi');
      if (path === 'finalize')
        await play(cup.alias, game.matchId, semi.homeEntrantId, semi.awayEntrantId);
      else {
        const response = await request('POST', `${matchBase(cup.alias, game.matchId)}/bulk-load`, {
          rosters: [],
          segments: [],
          events: [],
          result: result(semi.homeEntrantId, semi.awayEntrantId),
        });
        expect(response.statusCode).toBe(201);
      }
      const final = (await fixtureRows(cup.stageId)).find((row) => row.round === 2);
      expect([final?.home_entrant_id, final?.away_entrant_id]).toContain(semi.homeEntrantId);
      const reader = new EventStreamReader(harness.scratch.db);
      const events = await reader.after({
        organizationId: harness.organizationId,
        tournamentId: cup.tournamentId,
      });
      const resolved = events.filter(
        (event) =>
          event.eventType === 'fixture.entrant-resolved' &&
          event.payload['fixtureId'] === final?.fixture_id,
      );
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.payload).toMatchObject({ entrantId: semi.homeEntrantId });
      expect(await reader.entitiesOf(cup.tournamentId)).toContain(resolved[0]?.entityId);
      expect(resolved[0]?.stream).toBe(`match:${resolved[0]?.entityId}`);
    },
  );

  it.each(['scheduled', 'in-progress', 'finalized'] as const)(
    'correction preview agrees with commit and protects a started final: %s',
    async (status) => {
      const started = status !== 'scheduled';
      const cup = await setup();
      for (const semi of cup.fixtures.filter((fixture) => fixture.round === 1)) {
        const game = cup.matches.find((match) => match.fixtureId === semi.fixtureId);
        if (!game || !semi.homeEntrantId || !semi.awayEntrantId) throw new Error('Missing semi');
        await play(cup.alias, game.matchId, semi.homeEntrantId, semi.awayEntrantId);
      }
      const semi = cup.fixtures.find((fixture) => fixture.round === 1);
      const game = cup.matches.find((match) => match.fixtureId === semi?.fixtureId);
      const finalBefore = (await fixtureRows(cup.stageId)).find((row) => row.round === 2);
      const finalGame = cup.matches.find((match) => match.fixtureId === finalBefore?.fixture_id);
      if (!game || !finalGame || !semi?.homeEntrantId || !semi.awayEntrantId)
        throw new Error('Missing games');
      if (status === 'finalized') {
        if (!finalBefore?.home_entrant_id || !finalBefore.away_entrant_id)
          throw new Error('Missing finalists');
        await play(
          cup.alias,
          finalGame.matchId,
          finalBefore.home_entrant_id,
          finalBefore.away_entrant_id,
        );
      } else if (started)
        expect(
          (await request('POST', `${matchBase(cup.alias, finalGame.matchId)}/commands/start`))
            .statusCode,
        ).toBe(201);
      const correction = {
        ...result(semi.homeEntrantId, semi.awayEntrantId, semi.awayEntrantId),
        reason: 'Correct the recorded winner',
      };
      const preview = await request(
        'POST',
        `${matchBase(cup.alias, game.matchId)}/corrections/preview`,
        correction,
      );
      expect(preview.statusCode).toBe(201);
      expect((await fixtureRows(cup.stageId)).find((row) => row.round === 2)).toEqual(finalBefore);
      expect(preview.json().reResolved).toHaveLength(started ? 0 : 1);
      if (started)
        expect(preview.json().blockedPropagation.matches).toEqual([
          expect.objectContaining({
            matchId: finalGame.matchId,
            resultingEntrantId: semi.awayEntrantId,
          }),
        ]);
      const committed = await request(
        'POST',
        `${matchBase(cup.alias, game.matchId)}/corrections`,
        correction,
      );
      expect(committed.statusCode).toBe(201);
      expect(committed.json()).toEqual(preview.json());
      const finalAfter = (await fixtureRows(cup.stageId)).find((row) => row.round === 2);
      if (started) expect(finalAfter).toEqual(finalBefore);
      else
        expect([finalAfter?.home_entrant_id, finalAfter?.away_entrant_id]).toContain(
          semi.awayEntrantId,
        );
    },
  );

  it('advances a best-of-three only after its deciding game and anulls the surplus', async () => {
    const cup = await setup({ span: 3 });
    const semi = cup.fixtures.find((fixture) => fixture.round === 1);
    if (!semi?.homeEntrantId || !semi.awayEntrantId) throw new Error('Missing semi');
    const games = cup.matches
      .filter((match) => match.fixtureId === semi.fixtureId)
      .sort((a, b) => a.number - b.number);
    for (const [index, game] of games.slice(0, 2).entries()) {
      await play(cup.alias, game.matchId, semi.homeEntrantId, semi.awayEntrantId);
      const final = (await fixtureRows(cup.stageId)).find((row) => row.round === 2);
      expect([final?.home_entrant_id, final?.away_entrant_id].includes(semi.homeEntrantId)).toBe(
        index === 1,
      );
    }
    expect(
      (await new CompetitionRepository(harness.scratch.db).findMatch(games[2]?.matchId ?? ''))
        ?.status,
    ).toBe('not-required');
  });

  async function slotsFor(alias: string) {
    const schedules = new ScheduleRepository(harness.scratch.db);
    const audit = { ...AUDIT, organizationId: harness.organizationId };
    const slots = await withTransaction(harness.scratch.db, async (uow) => {
      const venue = await schedules.createVenue(uow, {
        ...audit,
        alias,
        name: 'Court',
        concurrentCapacity: 1,
      });
      const startsAt = Date.UTC(2026, 10, 7, 14);
      const schedule = await schedules.createSchedule(uow, {
        ...audit,
        name: 'Finals',
        startsAt,
        endsAt: startsAt + 4 * 60 * 60_000,
        slotMinutes: 120,
        turnaroundMinutes: 0,
        venueIds: [venue.venueId],
      });
      return schedules.listScheduleSlots(schedule.scheduleId, uow);
    });
    return { schedules, audit, slots };
  }

  it('publishes an undecided final, ignores its unknown entrants for rest and preserves venue conflicts', async () => {
    const cup = await setup({ count: 8, appoint: false });
    await harness.scratch.db
      .updateTable('tournaments')
      .set({ minimum_rest_minutes: 120 })
      .where('tournament_id', '=', cup.tournamentId)
      .execute();
    const final = cup.fixtures.find((fixture) => fixture.round === 3);
    const finalMatch = cup.matches.find((match) => match.fixtureId === final?.fixtureId);
    const semi = cup.fixtures.find((fixture) => fixture.round === 2);
    const semiMatch = cup.matches.find((match) => match.fixtureId === semi?.fixtureId);
    if (!finalMatch || !semiMatch) throw new Error('Missing undecided games');
    const { schedules, audit, slots } = await slotsFor(`court-${newId()}`);
    const first = slots[0],
      second = slots[1];
    if (!first || !second) throw new Error('Missing slots');
    await withTransaction(harness.scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        ...audit,
        assignments: [
          { matchId: finalMatch.matchId, slotId: first.slotId },
          { matchId: semiMatch.matchId, slotId: second.slotId },
        ],
      }),
    );
    const stored = await schedules.listScheduleDetailsForStage(cup.stageId);
    expect(stored.map((placement) => placement.matchId)).toEqual(
      expect.arrayContaining([finalMatch.matchId, semiMatch.matchId]),
    );
    const seeding = await request('GET', `${cup.base}/seeding`);
    expect(seeding.json().releasedAssignments).toBe(2);
    await expect(
      withTransaction(harness.scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          ...audit,
          reason: { text: 'Move into occupied court' },
          assignments: [{ matchId: semiMatch.matchId, slotId: first.slotId }],
        }),
      ),
    ).rejects.toThrow();
    const rebuilt = await request('POST', `${cup.base}/seeding`, {
      seeds: cup.entrantIds.map((entrantId, n) => ({ entrantId, seed: n + 1 })),
    });
    expect(rebuilt.statusCode).toBe(200);
    expect(await schedules.listScheduleDetailsForStage(cup.stageId)).toEqual([]);
  });

  it('releases an unnecessary double-elimination reset and reads its champion from stored topology', async () => {
    const cup = await setup({ format: 'double-elimination' });
    const rows = await fixtureRows(cup.stageId);
    const reset = rows.find((row) => row.contingency === 'bracket-reset');
    const resetGame = cup.matches.find((match) => match.fixtureId === reset?.fixture_id);
    if (!resetGame) throw new Error('Missing reset');
    const { schedules, audit, slots } = await slotsFor(`reset-court-${newId()}`);
    if (!slots[0]) throw new Error('Missing reset slot');
    await withTransaction(harness.scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        ...audit,
        assignments: [{ matchId: resetGame.matchId, slotId: slots[0]?.slotId as string }],
      }),
    );
    let champion: string | undefined;
    const played = new Set<string>();
    for (let n = 0; n < rows.length; n += 1) {
      const current = await fixtureRows(cup.stageId);
      const playable = current.find(
        (fixture) =>
          fixture.home_entrant_id &&
          fixture.away_entrant_id &&
          fixture.contingency === null &&
          cup.matches.some(
            (match) => match.fixtureId === fixture.fixture_id && !played.has(match.matchId),
          ),
      );
      if (!playable?.home_entrant_id || !playable.away_entrant_id) break;
      const game = cup.matches.find((match) => match.fixtureId === playable.fixture_id);
      if (!game) throw new Error('Missing game');
      await play(cup.alias, game.matchId, playable.home_entrant_id, playable.away_entrant_id);
      played.add(game.matchId);
      if (playable.bracket === 'grand-final') champion = playable.home_entrant_id;
    }
    expect(champion).toBeDefined();
    expect(
      (await new CompetitionRepository(harness.scratch.db).findMatch(resetGame.matchId))?.status,
    ).toBe('not-required');
    expect(await schedules.listScheduleDetailsForStage(cup.stageId)).toEqual([]);
    const overview = await request('GET', `${tournamentBase(cup.alias)}/overview`);
    expect(overview.statusCode).toBe(200);
    expect(overview.json().winners[0].champion.entrantId).toBe(champion);
  });
});
