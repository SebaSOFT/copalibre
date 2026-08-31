import { footballDescriptor, type StatisticCollector } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  ProjectionStore,
  StatisticProjection,
  StatisticRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Refold,
} from '@copalibre/persistence';
import { foldStatistics } from '@copalibre/tournament-engine';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../persistence/src/test-support/scratch-database.js';
import { createRefold, resolveMatchFold } from './refold.js';

/**
 * The first real-Postgres exercise of `foldStatistics`:
 * `refold.ts` resolves a match's roster and competition context from real
 * tables and hands them to the already-tested fold engine — this proves the
 * wiring, not the fold's own arithmetic (that's `fold.test.ts`).
 */

const AUDIT = { actor: 'user:refold-test', authorizationContext: 'scope:test' };

const COLLECTORS: readonly StatisticCollector[] = [
  {
    code: 'goals',
    label: 'Goals',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
  {
    code: 'team-goals',
    label: 'Team goals',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'team', competition: 'match' },
  },
  {
    code: 'goals-for-declared',
    label: 'Goals for (declared)',
    source: { kind: 'statistic', statisticCode: 'goals-for' },
    measure: { kind: 'count' },
    granularity: { actor: 'team', competition: 'match' },
  },
  {
    code: 'played',
    label: 'Played',
    source: { kind: 'participation' },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
  {
    code: 'goals-again',
    label: 'Goals (derived)',
    source: { kind: 'collector', code: 'goals' },
    measure: { kind: 'sum', field: 'unused' },
    granularity: { actor: 'person', competition: 'match' },
  },
  // a payload-field-targeted collector (assists) and a statistic
  // effect targeting every-other-side (goals-against, added to football's
  // own 'goal' event) — the multi-actor attribution this change adds,
  // exercised against real PostgreSQL rather than just the pure fold engine.
  {
    code: 'assists',
    label: 'Assists',
    source: {
      kind: 'event',
      definitionCodes: ['goal'],
      actorSource: { payloadField: 'assistedBy' },
    },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
  {
    code: 'goals-against-collected',
    label: 'Goals against (collected)',
    source: { kind: 'statistic', statisticCode: 'goals-against' },
    measure: { kind: 'count' },
    granularity: { actor: 'team', competition: 'match' },
  },
];

describe('refold against real PostgreSQL (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let matchId: string;
  let entrantAtlas: string;
  let entrantBoca: string;
  let personBoca: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('statistics-refold');
    const db = scratch.db;

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: 'liga-refold',
        name: 'Liga Refold',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const tournaments = new TournamentRepository(db);
    const enrollment = new EnrollmentRepository(db);
    const competition = new CompetitionRepository(db);
    const descriptor = footballDescriptor({ collectors: COLLECTORS });

    await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-refold',
        name: 'Apertura Refold',
        descriptor,
        ...AUDIT,
      });

      const clubAtlas = await enrollment.createClub(uow, {
        organizationId,
        name: 'Club Atlas',
        ...AUDIT,
      });
      const clubBoca = await enrollment.createClub(uow, {
        organizationId,
        name: 'Club Boca',
        ...AUDIT,
      });
      const atlas = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Atlas',
        clubId: clubAtlas.clubId,
        ...AUDIT,
      });
      const boca = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Boca',
        clubId: clubBoca.clubId,
        ...AUDIT,
      });

      const [homeEntrant, awayEntrant] = await Promise.all([
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: atlas.teamId },
          ...AUDIT,
        }),
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: boca.teamId },
          ...AUDIT,
        }),
      ]);
      entrantAtlas = homeEntrant.entrantId;
      entrantBoca = awayEntrant.entrantId;

      const persons = new PersonRepository(scratch.db);
      const { person: atlasPerson } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Atlas',
        ...AUDIT,
      });
      const { person: bocaPerson } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Boca',
        ...AUDIT,
      });
      const personAtlas = atlasPerson.personId;
      personBoca = bocaPerson.personId;
      await persons.enlist(uow, {
        personId: personAtlas,
        teamId: atlas.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await persons.enlist(uow, {
        personId: personBoca,
        teamId: boca.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrantAtlas, awayEntrantId: entrantBoca }],
        organizationId,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      matchId = match.matchId;

      const segment = await competition.createSegment(uow, {
        matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      await competition.setSegmentState(uow, {
        segmentId: segment.segmentId,
        state: 'active',
        organizationId,
        ...AUDIT,
      });
      await competition.applyCommand(uow, {
        matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...AUDIT,
      });

      await uow.tx
        .insertInto('match_rosters')
        .values([
          {
            match_id: matchId,
            entrant_id: entrantAtlas,
            roster_members: JSON.stringify([
              { personId: personAtlas, name: 'Atlas', onField: true },
            ]),
            updated_at: new Date(),
          },
          {
            match_id: matchId,
            entrant_id: entrantBoca,
            roster_members: JSON.stringify([{ personId: personBoca, name: 'Boca', onField: true }]),
            updated_at: new Date(),
          },
        ])
        .execute();

      // `nextEventSequence` reads via `this.db`, outside this transaction, so
      // it cannot see an insert this same transaction already made — a
      // sequence counted by hand here, the same way `recordEvent` calls it
      // once per request rather than in a loop.
      let sequence = 1;
      for (const [side, personId, count] of [
        [entrantAtlas, personAtlas, 2],
        [entrantBoca, personBoca, 1],
      ] as const) {
        for (let i = 0; i < count; i += 1) {
          await competition.appendEvent(uow, {
            event: {
              eventId: newId(),
              matchId,
              segmentId: segment.segmentId,
              definitionCode: 'goal',
              occurredAt: new Date().toISOString(),
              side,
              personId,
              // Atlas's first goal carries an assist — proves the
              // payload-field-targeted 'assists' collector resolves
              // against real persisted event rows, not just in-memory ones.
              payload: side === entrantAtlas && i === 0 ? { assistedBy: personBoca } : {},
            },
            sequence: sequence++,
            organizationId,
            ...AUDIT,
          });
        }
      }

      await competition.recordResult(uow, {
        matchId,
        result: {
          sides: [
            { entrantId: entrantAtlas, statistics: { 'goals-for': 2 } },
            { entrantId: entrantBoca, statistics: { 'goals-for': 1 } },
          ],
          winnerEntrantId: entrantAtlas,
          recordedAt: new Date().toISOString(),
        },
        organizationId,
        ...AUDIT,
      });
    });
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function project(eventType: 'match.finalized' | 'result.superseded') {
    const db = scratch.db;
    const statistics = new StatisticRepository(db);
    const projections = new ProjectionStore(db);
    const refold: Refold = createRefold(db);
    return withTransaction(db, async (uow) => {
      const version = await projections.nextVersion(uow, {
        projectionType: 'statistic-totals',
        entityId: matchId,
      });
      return new StatisticProjection(statistics, refold).apply(uow, {
        eventType,
        organizationId,
        entityId: matchId,
        projectionVersion: version,
      });
    });
  }

  it('resolves undefined for a match nobody can trace to a tournament', async () => {
    expect(await resolveMatchFold(scratch.db, newId())).toBeUndefined();
  });

  it('folds real roster/event/statistic/participation facts into stored totals matching a direct foldStatistics call (task 7.1)', async () => {
    await project('match.finalized');
    const statistics = new StatisticRepository(scratch.db);

    // The same resolution `refold` used, called again independently, so this
    // assertion is against the fold engine's own arithmetic over the real
    // facts — not a value this test invented.
    const resolved = await resolveMatchFold(scratch.db, matchId);
    if (!resolved) throw new Error('expected a resolvable match');
    const expected = foldStatistics(resolved.input);

    const goals = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    const teamGoals = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'team-goals',
        actorGranularity: 'team',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    const declared = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals-for-declared',
        actorGranularity: 'team',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    const played = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'played',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    expect(goals).toHaveLength(2);
    expect(goals.reduce((total, row) => total + row.value, 0)).toBe(3);
    expect(teamGoals.find((row) => row.actorId !== undefined)).toBeDefined();
    expect(teamGoals.reduce((total, row) => total + row.value, 0)).toBe(3);
    expect(declared.reduce((total, row) => total + row.value, 0)).toBe(3);
    expect(played).toHaveLength(2);

    // Cross-check against the fold engine's own output over the resolved facts.
    const goalsExpected = expected.filter((f) => f.collectorCode === 'goals');
    expect(goalsExpected.reduce((total, f) => total + f.value, 0)).toBe(3);
  });

  it("a collector-sourced collector's total is correct after finalization (task 7.2)", async () => {
    const statistics = new StatisticRepository(scratch.db);
    const goalsAgain = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals-again',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    expect(goalsAgain).toHaveLength(2);
    expect(goalsAgain.reduce((total, row) => total + row.value, 0)).toBe(3);
  });

  it('resolves a payload-field-targeted collector against real persisted events', async () => {
    const statistics = new StatisticRepository(scratch.db);
    const assists = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'assists',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    // The assist on Atlas's first goal credits Boca's player, not the scorer —
    // proves `assistedBy` round-trips through real Postgres rows into the fold.
    expect(assists).toEqual([
      { actorId: personBoca, competitionId: matchId, value: 1, samples: 1 },
    ]);
  });

  it('credits an every-other-side statistic effect (goals-against) at team granularity', async () => {
    const statistics = new StatisticRepository(scratch.db);
    const goalsAgainst = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals-against-collected',
        actorGranularity: 'team',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    // Atlas scored 2, Boca scored 1: Atlas concedes 1, Boca concedes 2.
    expect(goalsAgainst).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 1 }),
        expect.objectContaining({ value: 2 }),
      ]),
    );
    expect(goalsAgainst).toHaveLength(2);
  });

  it('recomputes on a correction, leaving no stale total behind (task 7.5)', async () => {
    const statistics = new StatisticRepository(scratch.db);

    // A protest upheld: one of Atlas's goals is disallowed, recorded as a
    // hand adjustment `refold` must fold alongside the events.
    const resolved = await resolveMatchFold(scratch.db, matchId);
    if (!resolved) throw new Error('expected a resolvable match');
    const atlasPersonFigure = foldStatistics(resolved.input).find(
      (figure) => figure.collectorCode === 'goals' && figure.value === 2,
    );
    if (!atlasPersonFigure) throw new Error('expected a two-goal scorer to correct');

    await withTransaction(scratch.db, (uow) =>
      statistics.recordAdjustment(uow, {
        organizationId,
        matchId,
        adjustment: {
          collectorCode: 'goals',
          actorGranularity: 'person',
          actorId: atlasPersonFigure.actorId,
          delta: -1,
          reason: 'Gol anulado por offside tras revisión',
          actor: 'user:tribunal-1',
        },
        ...AUDIT,
      }),
    );

    await withTransaction(scratch.db, (uow) =>
      new CompetitionRepository(scratch.db).supersedeResult(uow, {
        matchId,
        result: {
          sides: [
            { entrantId: entrantAtlas, statistics: { 'goals-for': 1 } },
            { entrantId: entrantBoca, statistics: { 'goals-for': 1 } },
          ],
          winnerEntrantId: entrantAtlas,
          recordedAt: new Date().toISOString(),
        },
        reason: 'Gol anulado por offside tras revisión',
        organizationId,
        ...AUDIT,
      }),
    );

    await project('result.superseded');

    const goals = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals',
        actorGranularity: 'person',
        actorId: atlasPersonFigure.actorId,
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    // Recomputed from the facts, not decremented: the adjustment and the two
    // events fold to one, and nothing about the earlier "two" survives to
    // disagree with it.
    expect(goals).toEqual([
      { actorId: atlasPersonFigure.actorId, competitionId: matchId, value: 1, samples: 3 },
    ]);
  });
});
