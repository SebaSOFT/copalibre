import {
  footballDescriptor,
  type StatisticCollector,
  type TagDeclaration,
} from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  ProjectionStore,
  StatisticProjection,
  StatisticRepository,
  TagRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Refold,
} from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../persistence/src/test-support/scratch-database.js';
import { createRefold } from './refold.js';

/**
 * End-to-end proof that a `requiresTag` collector's fold reflects real
 * `tag_facts` rows, checked at each fact's own instant — not a value this
 * test invents, and not a join at read time. Whether a
 * tag fact is produced from an event's declared effect is `tagFactsFrom`'s
 * own concern (`packages/tournament-engine`'s `tags.test.ts`); this test
 * writes facts directly via `TagRepository`, the same shape
 * `match-control.controller.ts`'s wiring produces, to isolate the
 * fold-time filtering this change actually adds.
 */

const AUDIT = { actor: 'user:tag-fold-test', authorizationContext: 'scope:test' };

const TAGS: readonly TagDeclaration[] = [
  { code: 'captain', label: 'Captain', appliesTo: ['person'] },
];

const COLLECTORS: readonly StatisticCollector[] = [
  {
    code: 'goals',
    label: 'Goals',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
  {
    code: 'captain-goals',
    label: 'Captain goals',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
    requiresTag: { code: 'captain' },
  },
];

describe('a requiresTag collector against real PostgreSQL (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let matchId: string;
  let personAtlas: string;
  let personBoca: string;
  let entrantAtlas: string;
  let entrantBoca: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('statistics-refold-tags');
    const db = scratch.db;

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: 'liga-tag-fold',
        name: 'Liga Tag Fold',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const tournaments = new TournamentRepository(db);
    const enrollment = new EnrollmentRepository(db);
    const competition = new CompetitionRepository(db);
    const descriptor = footballDescriptor({ collectors: COLLECTORS, tags: TAGS });

    await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-tag-fold',
        name: 'Apertura Tag Fold',
        descriptor,
        ...AUDIT,
      });

      const atlas = await enrollment.createTeam(uow, { organizationId, name: 'Atlas', ...AUDIT });
      const boca = await enrollment.createTeam(uow, { organizationId, name: 'Boca', ...AUDIT });

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
        displayName: 'Capitán Atlas',
        ...AUDIT,
      });
      const { person: bocaPerson } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Boca',
        ...AUDIT,
      });
      personAtlas = atlasPerson.personId;
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

      // Captain Atlas carries the tag from 19:00; a rival club officer lifts
      // it (a dispute resolved before kickoff) at 19:30. Both goals below are
      // recorded at 20:00 — after the lift — so 6.3's "excludes a fact after
      // the tag was already lifted" case is exercised against real Postgres,
      // not only the pure unit test.
      const tags = new TagRepository(scratch.db);
      await tags.record(uow, {
        organizationId,
        fact: {
          code: 'captain',
          action: 'applied',
          actorGranularity: 'person',
          actorId: personAtlas,
          competitionGranularity: 'match',
          competitionId: matchId,
          actor: 'user:coach-atlas',
          reason: 'Capitán designado antes del partido',
          at: '2026-08-01T19:00:00.000Z',
        },
        ...AUDIT,
      });
      await tags.record(uow, {
        organizationId,
        fact: {
          code: 'captain',
          action: 'lifted',
          actorGranularity: 'person',
          actorId: personAtlas,
          competitionGranularity: 'match',
          competitionId: matchId,
          actor: 'user:referee-1',
          reason: 'Disputa de capitanía resuelta antes del pitido inicial',
          at: '2026-08-01T19:30:00.000Z',
        },
        ...AUDIT,
      });

      let sequence = 1;
      for (const [side, personId] of [
        [entrantAtlas, personAtlas],
        [entrantBoca, personBoca],
      ] as const) {
        await competition.appendEvent(uow, {
          event: {
            eventId: newId(),
            matchId,
            segmentId: segment.segmentId,
            definitionCode: 'goal',
            occurredAt: '2026-08-01T20:00:00.000Z',
            side,
            personId,
            payload: {},
          },
          sequence: sequence++,
          organizationId,
          ...AUDIT,
        });
      }

      await competition.recordResult(uow, {
        matchId,
        result: {
          sides: [
            { entrantId: entrantAtlas, statistics: { 'goals-for': 1 } },
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

  async function project() {
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
        eventType: 'match.finalized',
        organizationId,
        entityId: matchId,
        projectionVersion: version,
      });
    });
  }

  it('an untagged collector counts both goals, unaffected by requiresTag on a different collector (6.2)', async () => {
    await project();
    const statistics = new StatisticRepository(scratch.db);
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
    expect(goals).toHaveLength(2);
  });

  it('a requiresTag collector excludes a fact recorded after the tag was lifted (6.3)', async () => {
    const statistics = new StatisticRepository(scratch.db);
    const captainGoals = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'captain-goals',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    // Both goals were recorded at 20:00, after the 19:30 lift — so neither
    // counts, even though Atlas's scorer did carry the tag earlier.
    expect(captainGoals).toHaveLength(0);
  });

  it('a requiresTag collector counts a fact recorded while the tag still applied, read as a plain SELECT with no join', async () => {
    // Re-project against a version of history where the tag was never
    // lifted, proving the positive case with the same infrastructure.
    const tags = new TagRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      tags.record(uow, {
        organizationId,
        fact: {
          code: 'captain',
          action: 'applied',
          actorGranularity: 'person',
          actorId: personBoca,
          competitionGranularity: 'match',
          competitionId: matchId,
          actor: 'user:coach-boca',
          reason: 'Capitán suplente designado en el entretiempo',
          at: '2026-08-01T20:30:00.000Z',
        },
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, async (uow) => {
      await new CompetitionRepository(scratch.db).appendEvent(uow, {
        event: {
          eventId: newId(),
          matchId,
          segmentId: (await new CompetitionRepository(scratch.db).listSegments(matchId))[0]
            ?.segmentId as string,
          definitionCode: 'goal',
          occurredAt: '2026-08-01T20:45:00.000Z',
          personId: personBoca,
          payload: {},
        },
        sequence: 3,
        organizationId,
        ...AUDIT,
      });
    });
    await project();

    const statistics = new StatisticRepository(scratch.db);
    const captainGoals = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'captain-goals',
        actorGranularity: 'person',
        actorId: personBoca,
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    expect(captainGoals).toEqual([
      { actorId: personBoca, competitionId: matchId, value: 1, samples: 1 },
    ]);
  });

  it("a corrected result rewrites a tag-filtered collector's total, leaving no stale value (6.4)", async () => {
    // The previous test left Boca's captain-goal total at 1. A protest
    // upheld disallows it — the same audited-adjustment + supersede path
    // `refold.integration.test.ts`'s own correction test uses, now exercised
    // against a `requiresTag` collector for the first time.
    const statistics = new StatisticRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      statistics.recordAdjustment(uow, {
        organizationId,
        matchId,
        adjustment: {
          collectorCode: 'captain-goals',
          actorGranularity: 'person',
          actorId: personBoca,
          delta: -1,
          reason: 'Gol anulado por fuera de juego tras revisión',
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
            { entrantId: entrantBoca, statistics: { 'goals-for': 0 } },
          ],
          winnerEntrantId: entrantAtlas,
          recordedAt: new Date().toISOString(),
        },
        reason: 'Gol anulado por fuera de juego tras revisión',
        organizationId,
        ...AUDIT,
      }),
    );
    await project();

    const afterCorrection = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'captain-goals',
        actorGranularity: 'person',
        actorId: personBoca,
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    // Recomputed from the facts and the adjustment together, not decremented
    // in place: the counted goal (1) and the -1 adjustment both fold into
    // this run, landing at net 0 — the row exists (a figure is still a real
    // figure at zero) but carries no stale "1" from before the correction.
    expect(afterCorrection).toEqual([
      { actorId: personBoca, competitionId: matchId, value: 0, samples: 2 },
    ]);
  });
});
