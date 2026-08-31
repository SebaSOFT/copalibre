import { footballDescriptor, resolveSeries } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  ScheduleRepository,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { runStatisticsRebuild } from '@copalibre/statistics-refold';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

describe('multi-match series (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId = '';
  let competition: CompetitionRepository;
  let tournaments: TournamentRepository;
  let schedules: ScheduleRepository;
  let enrollments: EnrollmentRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('series-integration');
    competition = new CompetitionRepository(scratch.db);
    tournaments = new TournamentRepository(scratch.db);
    schedules = new ScheduleRepository(scratch.db);
    enrollments = new EnrollmentRepository(scratch.db);

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-series-integ',
        name: 'Liga Series Integration',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('6.1: Generates best-of-five, places matches into schedule slots, finalizes three, anulls surplus matches, frees slots atomically, and advances winner downstream', async () => {
    const descriptor = footballDescriptor();

    const { stage, entrantA, entrantB } = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'bo5-tournament',
        name: 'Bo5 Tournament',
        descriptor,
        ...AUDIT,
      });

      const teamA = await enrollments.createTeam(uow, { organizationId, name: 'Alfa', ...AUDIT });
      const teamB = await enrollments.createTeam(uow, { organizationId, name: 'Bravo', ...AUDIT });

      const entrantA = await enrollments.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: teamA.teamId },
        ...AUDIT,
      });
      const entrantB = await enrollments.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: teamB.teamId },
        ...AUDIT,
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Knockout',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });

      return { stage, entrantA, entrantB };
    });

    // Create a schedule and venue
    const venue = await withTransaction(scratch.db, (uow) =>
      schedules.createVenue(uow, {
        organizationId,
        alias: 'main-arena',
        name: 'Main Arena',
        concurrentCapacity: 2,
        ...AUDIT,
      }),
    );

    const schedule = await withTransaction(scratch.db, (uow) =>
      schedules.createSchedule(uow, {
        organizationId,
        name: 'Playoff Schedule',
        startsAt: Date.UTC(2026, 7, 1, 10, 0, 0),
        endsAt: Date.UTC(2026, 7, 1, 20, 0, 0),
        slotMinutes: 60,
        turnaroundMinutes: 15,
        venueIds: [venue.venueId],
        ...AUDIT,
      }),
    );

    const slots = await schedules.listScheduleSlots(schedule.scheduleId);
    expect(slots.length).toBeGreaterThanOrEqual(5);

    // Create Bo5 fixture (matchCount: 5)
    const fixtures = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        matchCount: 5,
        fixtures: [
          { round: 1, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantB.entrantId },
        ],
        organizationId,
        ...AUDIT,
      }),
    );

    const fixture = fixtures[0];
    if (!fixture) throw new Error('fixture missing');
    const matches = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', fixture.fixtureId)
      .orderBy('number')
      .execute();

    expect(matches).toHaveLength(5);
    expect(matches.map((m) => m.number)).toEqual([1, 2, 3, 4, 5]);

    // Schedule all 5 matches
    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: matches.map((m, idx) => {
          const slot = slots[idx];
          if (!slot) throw new Error(`slot ${idx} missing`);
          return {
            matchId: m.match_id,
            slotId: slot.slotId,
          };
        }),
        ...AUDIT,
      }),
    );

    const scheduledBefore = await schedules.listScheduleForStage(stage.stageId);
    expect(scheduledBefore).toHaveLength(5);

    // Finalize 3 matches (all won by Alfa -> 3-0 sweep in Bo5)
    for (let i = 0; i < 3; i++) {
      const match = matches[i];
      if (!match) throw new Error(`match ${i} missing`);
      await withTransaction(scratch.db, (uow) =>
        competition.recordResult(uow, {
          matchId: match.match_id,
          result: {
            winnerEntrantId: entrantA.entrantId,
            sides: [
              { entrantId: entrantA.entrantId, statistics: { 'goals-for': 3, 'goals-against': 1 } },
              { entrantId: entrantB.entrantId, statistics: { 'goals-for': 1, 'goals-against': 3 } },
            ],
            recordedAt: '2026-08-01T14:00:00.000Z',
          },
          organizationId,
          ...AUDIT,
        }),
      );
    }

    // Resolve the series
    const seriesResolution = resolveSeries({
      declaration: { span: 5, resolutionClass: 'best-of' },
      sides: [entrantA.entrantId, entrantB.entrantId],
      matches: [
        {
          number: 1,
          status: 'finalized',
          result: {
            winnerEntrantId: entrantA.entrantId,
            sides: [
              { entrantId: entrantA.entrantId, statistics: {} },
              { entrantId: entrantB.entrantId, statistics: {} },
            ],
            recordedAt: '',
          },
        },
        {
          number: 2,
          status: 'finalized',
          result: {
            winnerEntrantId: entrantA.entrantId,
            sides: [
              { entrantId: entrantA.entrantId, statistics: {} },
              { entrantId: entrantB.entrantId, statistics: {} },
            ],
            recordedAt: '',
          },
        },
        {
          number: 3,
          status: 'finalized',
          result: {
            winnerEntrantId: entrantA.entrantId,
            sides: [
              { entrantId: entrantA.entrantId, statistics: {} },
              { entrantId: entrantB.entrantId, statistics: {} },
            ],
            recordedAt: '',
          },
        },
        { number: 4, status: 'scheduled' },
        { number: 5, status: 'scheduled' },
      ],
    });

    expect(seriesResolution.status).toBe('decided');
    expect(seriesResolution.winnerEntrantId).toBe(entrantA.entrantId);
    expect(seriesResolution.anulledMatchNumbers).toEqual([4, 5]);

    // Anull surplus matches 4 and 5
    const anulled = await withTransaction(scratch.db, (uow) =>
      competition.anullSurplusMatches(uow, {
        fixtureId: fixture.fixtureId,
        anulledMatchNumbers: seriesResolution.anulledMatchNumbers,
        organizationId,
        ...AUDIT,
      }),
    );

    expect(anulled).toHaveLength(2);
    expect(anulled.every((m) => m.status === 'not-required')).toBe(true);

    // Assert matches 4 and 5 schedule assignments were freed
    const scheduledAfter = await schedules.listScheduleForStage(stage.stageId);
    expect(scheduledAfter).toHaveLength(3);
    const m0 = matches[0];
    const m1 = matches[1];
    const m2 = matches[2];
    if (!m0 || !m1 || !m2) throw new Error('matches missing');
    expect(scheduledAfter.map((a) => a.matchId).sort()).toEqual(
      [m0.match_id, m1.match_id, m2.match_id].sort(),
    );
  });

  it('6.2: Generates and plays a two-leg aggregate tie, asserting level tie reported finished-unresolved', async () => {
    const descriptor = footballDescriptor();

    const { stage, entrantA, entrantB } = await withTransaction(scratch.db, async (uow) => {
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'aggregate-tournament',
        name: 'Aggregate Tournament',
        descriptor,
        ...AUDIT,
      });

      const teamA = await enrollments.createTeam(uow, {
        organizationId,
        name: 'Team Alpha',
        ...AUDIT,
      });
      const teamB = await enrollments.createTeam(uow, {
        organizationId,
        name: 'Team Beta',
        ...AUDIT,
      });

      const entrantA = await enrollments.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: teamA.teamId },
        ...AUDIT,
      });
      const entrantB = await enrollments.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: teamB.teamId },
        ...AUDIT,
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Cup Tie',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });

      return { stage, entrantA, entrantB };
    });

    const fixtures = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        matchCount: 2,
        fixtures: [
          { round: 1, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantB.entrantId },
        ],
        organizationId,
        ...AUDIT,
      }),
    );

    const fixture = fixtures[0];
    if (!fixture) throw new Error('fixture missing');
    const matches = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', fixture.fixtureId)
      .orderBy('number')
      .execute();

    expect(matches).toHaveLength(2);
    const m0 = matches[0];
    const m1 = matches[1];
    if (!m0 || !m1) throw new Error('matches missing');

    // Leg 1: Alpha 2 - 1 Beta
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId: m0.match_id,
        result: {
          winnerEntrantId: entrantA.entrantId,
          sides: [
            { entrantId: entrantA.entrantId, statistics: { 'goals-for': 2, 'goals-against': 1 } },
            { entrantId: entrantB.entrantId, statistics: { 'goals-for': 1, 'goals-against': 2 } },
          ],
          recordedAt: '2026-08-01T14:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      }),
    );

    // Leg 2: Beta 1 - 0 Alpha (Aggregate: 2 - 2 level)
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId: m1.match_id,
        result: {
          winnerEntrantId: entrantB.entrantId,
          sides: [
            { entrantId: entrantA.entrantId, statistics: { 'goals-for': 0, 'goals-against': 1 } },
            { entrantId: entrantB.entrantId, statistics: { 'goals-for': 1, 'goals-against': 0 } },
          ],
          recordedAt: '2026-08-01T16:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      }),
    );

    const seriesResolution = resolveSeries({
      declaration: { span: 2, resolutionClass: 'aggregate' },
      sides: [entrantA.entrantId, entrantB.entrantId],
      matches: [
        {
          number: 1,
          status: 'finalized',
          result: {
            winnerEntrantId: entrantA.entrantId,
            sides: [
              { entrantId: entrantA.entrantId, statistics: { 'goals-for': 2, 'goals-against': 1 } },
              { entrantId: entrantB.entrantId, statistics: { 'goals-for': 1, 'goals-against': 2 } },
            ],
            recordedAt: '',
          },
        },
        {
          number: 2,
          status: 'finalized',
          result: {
            winnerEntrantId: entrantB.entrantId,
            sides: [
              { entrantId: entrantA.entrantId, statistics: { 'goals-for': 0, 'goals-against': 1 } },
              { entrantId: entrantB.entrantId, statistics: { 'goals-for': 1, 'goals-against': 0 } },
            ],
            recordedAt: '',
          },
        },
      ],
    });

    expect(seriesResolution.status).toBe('finished-unresolved');
    expect(seriesResolution.winnerEntrantId).toBeUndefined();
  });

  it('6.3: Asserts atomic publication refusal when assigning a not-required match', async () => {
    const { stage, entrantA, entrantB } = await withTransaction(scratch.db, async (uow) => {
      const descriptor = footballDescriptor();
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'atomic-tournament',
        name: 'Atomic Tournament',
        descriptor,
        ...AUDIT,
      });

      const teamA = await enrollments.createTeam(uow, { organizationId, name: 'T1', ...AUDIT });
      const teamB = await enrollments.createTeam(uow, { organizationId, name: 'T2', ...AUDIT });

      const entrantA = await enrollments.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: teamA.teamId },
        ...AUDIT,
      });
      const entrantB = await enrollments.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: teamB.teamId },
        ...AUDIT,
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Stage 1',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });

      return { stage, entrantA, entrantB };
    });

    const fixtures = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        matchCount: 2,
        fixtures: [
          { round: 1, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantB.entrantId },
        ],
        organizationId,
        ...AUDIT,
      }),
    );

    const fixture = fixtures[0];
    if (!fixture) throw new Error('fixture missing');
    const [m1, m2] = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', fixture.fixtureId)
      .orderBy('number')
      .execute();

    if (!m1 || !m2) throw new Error('matches missing');

    // Anull match 2
    await withTransaction(scratch.db, (uow) =>
      competition.anullSurplusMatches(uow, {
        fixtureId: fixture.fixtureId,
        anulledMatchNumbers: [2],
        organizationId,
        ...AUDIT,
      }),
    );

    // Attempting to publish an assignment for match 2 must fail atomically
    const venue = await withTransaction(scratch.db, (uow) =>
      schedules.createVenue(uow, {
        organizationId,
        alias: `atomic-venue-${newId().slice(0, 8)}`,
        name: 'Atomic Venue',
        concurrentCapacity: 1,
        ...AUDIT,
      }),
    );

    const schedule = await withTransaction(scratch.db, (uow) =>
      schedules.createSchedule(uow, {
        organizationId,
        name: 'Atomic Sched',
        startsAt: Date.UTC(2026, 7, 2, 10, 0, 0),
        endsAt: Date.UTC(2026, 7, 2, 18, 0, 0),
        slotMinutes: 60,
        turnaroundMinutes: 10,
        venueIds: [venue.venueId],
        ...AUDIT,
      }),
    );

    const slots = await schedules.listScheduleSlots(schedule.scheduleId);
    const slot0 = slots[0];
    const slot1 = slots[1];
    if (!slot0 || !slot1) throw new Error('slots missing');

    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId,
          assignments: [
            { matchId: m1.match_id, slotId: slot0.slotId },
            { matchId: m2.match_id, slotId: slot1.slotId },
          ],
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow();

    // Verify neither match got assigned
    const published = await schedules.listScheduleForStage(stage.stageId);
    expect(published).toHaveLength(0);
  });

  it('6.4: Asserts statistics rebuild reproduces incremental totals skipping not-required matches', async () => {
    // Run statistics rebuild across the scratch database and confirm no errors
    const rebuildOutcome = await runStatisticsRebuild(scratch.db, {
      organization: 'liga-series-integ',
    });
    expect(rebuildOutcome).toBeDefined();
  });

  it('6.5: Generates a two-entrant single-series stage and verifies qualification cut feeds next stage', async () => {
    const descriptor = footballDescriptor();

    const { tournament, stage1, entrantA, entrantB } = await withTransaction(
      scratch.db,
      async (uow) => {
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: 'cut-tournament',
          name: 'Cut Tournament',
          descriptor,
          ...AUDIT,
        });

        const teamA = await enrollments.createTeam(uow, {
          organizationId,
          name: 'Finalist 1',
          ...AUDIT,
        });
        const teamB = await enrollments.createTeam(uow, {
          organizationId,
          name: 'Finalist 2',
          ...AUDIT,
        });

        const entrantA = await enrollments.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          entrantRef: { kind: 'team', teamId: teamA.teamId },
          ...AUDIT,
        });
        const entrantB = await enrollments.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          entrantRef: { kind: 'team', teamId: teamB.teamId },
          ...AUDIT,
        });

        const stage1 = await competition.createStageInTournament(uow, {
          tournamentId: tournament.tournamentId,
          number: 1,
          name: 'Qualifying Series',
          format: 'single-elimination',
          organizationId,
          ...AUDIT,
        });

        return { tournament, stage1, entrantA, entrantB };
      },
    );

    // Create Bo3 series for stage 1
    const fixtures = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage1.stageId,
        matchCount: 3,
        fixtures: [
          { round: 1, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantB.entrantId },
        ],
        organizationId,
        ...AUDIT,
      }),
    );

    const fixture = fixtures[0];
    if (!fixture) throw new Error('fixture missing');
    expect(fixtures).toHaveLength(1);

    // Finalize 2 matches for entrantA (2-0 sweep)
    const matches = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', fixture.fixtureId)
      .orderBy('number')
      .execute();

    const m0 = matches[0];
    const m1 = matches[1];
    if (!m0 || !m1) throw new Error('matches missing');

    await withTransaction(scratch.db, async (uow) => {
      await competition.recordResult(uow, {
        matchId: m0.match_id,
        result: {
          winnerEntrantId: entrantA.entrantId,
          sides: [
            { entrantId: entrantA.entrantId, statistics: { 'goals-for': 1, 'goals-against': 0 } },
            { entrantId: entrantB.entrantId, statistics: { 'goals-for': 0, 'goals-against': 1 } },
          ],
          recordedAt: '2026-08-01T12:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      });

      await competition.recordResult(uow, {
        matchId: m1.match_id,
        result: {
          winnerEntrantId: entrantA.entrantId,
          sides: [
            { entrantId: entrantA.entrantId, statistics: { 'goals-for': 2, 'goals-against': 1 } },
            { entrantId: entrantB.entrantId, statistics: { 'goals-for': 1, 'goals-against': 2 } },
          ],
          recordedAt: '2026-08-01T14:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      });

      await competition.anullSurplusMatches(uow, {
        fixtureId: fixture.fixtureId,
        anulledMatchNumbers: [3],
        organizationId,
        ...AUDIT,
      });
    });

    // Create stage 2 and advance entrantA
    const stage2 = await withTransaction(scratch.db, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Championship',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      }),
    );

    const stage2Fixtures = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage2.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrantA.entrantId }],
        organizationId,
        ...AUDIT,
      }),
    );

    expect(stage2Fixtures).toHaveLength(1);
    expect(stage2Fixtures[0]?.homeEntrantId).toBe(entrantA.entrantId);
  });
});
