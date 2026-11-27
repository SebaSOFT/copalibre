import { newId } from '../ids.js';
import { PublicOverviewReadModel } from '../projections/public-overview-read-model.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { PersonRepository } from './person-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { TournamentRepository } from './tournament-repository.js';
import { AUDIT, descriptor } from './repositories.integration-fixtures.js';

describe('public overview projection (integration)', () => {
  let scratch: ScratchDatabase;
  let organizations: OrganizationRepository;
  let tournaments: TournamentRepository;
  let participants: EnrollmentRepository;
  let competition: CompetitionRepository;
  let overview: PublicOverviewReadModel;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('public-overview');
    organizations = new OrganizationRepository(scratch.db);
    tournaments = new TournamentRepository(scratch.db);
    participants = new EnrollmentRepository(scratch.db);
    competition = new CompetitionRepository(scratch.db);
    overview = new PublicOverviewReadModel(scratch.db);

    const organization = await withTransaction(scratch.db, (uow) =>
      organizations.create(uow, {
        alias: 'liga-publica',
        name: 'Liga Pública',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('resolves entrant names for both a team and a person entrant, and omits an unknown id', async () => {
    const disciplineDescriptor = descriptor();
    const { teamEntrantId, personEntrantId } = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-nombres',
        name: 'Copa Nombres',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const team = await participants.createTeam(uow, {
        organizationId,
        name: 'Talleres de Mendoza',
        abbreviation: 'TLL A',
        ...AUDIT,
      });
      const teamEntrant = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        abbreviation: 'TOUR',
        organizationId,
        ...AUDIT,
      });
      const { person } = await new PersonRepository(scratch.db).register(uow, {
        organizationId,
        displayName: 'Ana Pérez',
        ...AUDIT,
      });
      const personEntrant = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: person.personId },
        organizationId,
        ...AUDIT,
      });
      return { teamEntrantId: teamEntrant.entrantId, personEntrantId: personEntrant.entrantId };
    });

    const unknownEntrantId = newId();
    const names = await participants.resolveEntrantNames([
      teamEntrantId,
      personEntrantId,
      unknownEntrantId,
    ]);

    expect(names.get(teamEntrantId)).toEqual({
      name: 'Talleres de Mendoza',
      abbreviation: 'TOUR',
    });
    expect(names.get(personEntrantId)).toEqual({ name: 'Ana Pérez', abbreviation: 'AP' });
    expect(names.has(unknownEntrantId)).toBe(false);
  });

  it('returns an empty map without querying when given no entrant ids', async () => {
    await expect(participants.resolveEntrantNames([])).resolves.toEqual(new Map());
  });

  it('lists every stage’s matches for a tournament, in stage/round order, with scheduling and scores', async () => {
    const disciplineDescriptor = descriptor();
    const tournamentId = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-calendario',
        name: 'Copa Calendario',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const home = await participants.createTeam(uow, {
        organizationId,
        name: 'Local FC',
        ...AUDIT,
      });
      const away = await participants.createTeam(uow, {
        organizationId,
        name: 'Visitante FC',
        ...AUDIT,
      });
      const homeEntrant = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: home.teamId },
        organizationId,
        ...AUDIT,
      });
      const awayEntrant = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: away.teamId },
        organizationId,
        ...AUDIT,
      });

      const stageOne = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stageOne.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: homeEntrant.entrantId,
            awayEntrantId: awayEntrant.entrantId,
          },
        ],
        organizationId,
        ...AUDIT,
      });
      if (!fixture) throw new Error('fixture was not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      });

      const schedulesRepo = new ScheduleRepository(scratch.db);
      const venue = await schedulesRepo.createVenue(uow, {
        organizationId,
        alias: 'court-overview',
        name: 'Cancha Overview',
        concurrentCapacity: 1,
        ...AUDIT,
      });
      const sched = await schedulesRepo.createSchedule(uow, {
        organizationId,
        name: 'Horario Overview',
        startsAt: Date.parse('2026-08-01T20:00:00.000Z'),
        endsAt: Date.parse('2026-08-01T22:00:00.000Z'),
        slotMinutes: 90,
        turnaroundMinutes: 15,
        venueIds: [venue.venueId],
        ...AUDIT,
      });
      const slots = await schedulesRepo.listScheduleSlots(sched.scheduleId, uow);
      const firstSlot = slots[0];
      if (!firstSlot) throw new Error('no slot created');
      await schedulesRepo.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId: match.matchId, slotId: firstSlot.slotId }],
        ...AUDIT,
      });

      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: homeEntrant.entrantId, statistics: { goals: 2 } },
            { entrantId: awayEntrant.entrantId, statistics: { goals: 1 } },
          ],
          winnerEntrantId: homeEntrant.entrantId,
          recordedAt: '2026-08-01T22:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      });

      const stageTwo = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Playoffs',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      await competition.createFixtures(uow, {
        stageId: stageTwo.stageId,
        fixtures: [{ round: 1, homeEntrantId: homeEntrant.entrantId }],
        organizationId,
        ...AUDIT,
      });

      return tournament.tournamentId;
    });

    const matches = await overview.matchesForTournament(tournamentId);
    expect(matches).toHaveLength(2);

    const [played, scheduled] = matches;
    expect(played).toMatchObject({
      stageNumber: 1,
      round: 1,
      status: 'finalized',
      scores: [2, 1],
      scheduledAt: '2026-08-01T20:00:00.000Z',
    });
    expect(scheduled).toMatchObject({ stageNumber: 2, round: 1, status: 'scheduled' });
    expect(scheduled?.scheduledAt).toBeUndefined();
  });

  it('creates multi-match fixtures, supports replaceFixtures with matchCount, and anulls surplus matches', async () => {
    const competition = new CompetitionRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);

    const tournament = await withTransaction(scratch.db, async (uow) => {
      const d = descriptor();
      await tournaments.saveDescriptor(uow, d, { organizationId, ...AUDIT });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-multi-match-repo',
        name: 'Copa Multi-Match Repo',
        descriptor: d,
        ...AUDIT,
      });
    });

    const stage = await withTransaction(scratch.db, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Knockout',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      }),
    );

    // Create fixture with matchCount: 3
    const fixtures = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        matchCount: 3,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      }),
    );

    const fixture = fixtures[0];
    if (!fixture) throw new Error('no fixture created');
    const matches = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', fixture.fixtureId)
      .orderBy('number')
      .execute();

    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.number)).toEqual([1, 2, 3]);
    expect(matches.every((m) => m.status === 'scheduled')).toBe(true);

    // Replace fixtures with matchCount: 5
    const replacedFixtures = await withTransaction(scratch.db, (uow) =>
      competition.replaceFixtures(uow, {
        stageId: stage.stageId,
        matchCount: 5,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      }),
    );

    const replacedFixture = replacedFixtures[0];
    if (!replacedFixture) throw new Error('no replaced fixture');
    const replacedMatches = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', replacedFixture.fixtureId)
      .orderBy('number')
      .execute();

    expect(replacedMatches).toHaveLength(5);
    expect(replacedMatches.map((m) => m.number)).toEqual([1, 2, 3, 4, 5]);

    // Anull surplus matches 4 and 5
    const anulled = await withTransaction(scratch.db, (uow) =>
      competition.anullSurplusMatches(uow, {
        fixtureId: replacedFixture.fixtureId,
        anulledMatchNumbers: [4, 5],
        organizationId,
        ...AUDIT,
      }),
    );

    expect(anulled).toHaveLength(2);
    expect(anulled.map((m) => m.status)).toEqual(['not-required', 'not-required']);

    const finalMatches = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', replacedFixture.fixtureId)
      .orderBy('number')
      .execute();

    expect(finalMatches.map((m) => m.status)).toEqual([
      'scheduled',
      'scheduled',
      'scheduled',
      'not-required',
      'not-required',
    ]);
  });

  it('aggregates per-stage match counts by status and folds tournament completion', async () => {
    const competition = new CompetitionRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);

    const tournament = await withTransaction(scratch.db, async (uow) => {
      const d = descriptor();
      await tournaments.saveDescriptor(uow, d, { organizationId, ...AUDIT });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-completion-test',
        name: 'Copa Completion Test',
        descriptor: d,
        ...AUDIT,
      });
    });

    const stage1 = await withTransaction(scratch.db, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Group Stage',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      }),
    );

    const stage2 = await withTransaction(scratch.db, (uow) =>
      competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Playoffs',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      }),
    );

    const fixtures = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage1.stageId,
        matchCount: 5,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      }),
    );

    const firstFixture = fixtures[0];
    if (!firstFixture) throw new Error('expected firstFixture');

    const createdMatches = await scratch.db
      .selectFrom('matches')
      .select(['match_id', 'number'])
      .where('fixture_id', '=', firstFixture.fixtureId)
      .orderBy('number', 'asc')
      .execute();

    expect(createdMatches).toHaveLength(5);
    const m0 = createdMatches[0];
    const m1 = createdMatches[1];
    const m2 = createdMatches[2];
    const m4 = createdMatches[4];
    if (!m0 || !m1 || !m2 || !m4) throw new Error('expected createdMatches');

    await scratch.db
      .updateTable('matches')
      .set({ status: 'finalized' })
      .where('match_id', '=', m0.match_id)
      .execute();

    await scratch.db
      .updateTable('matches')
      .set({ status: 'forfeited' })
      .where('match_id', '=', m1.match_id)
      .execute();

    await scratch.db
      .updateTable('matches')
      .set({ status: 'live' })
      .where('match_id', '=', m2.match_id)
      .execute();

    await scratch.db
      .updateTable('matches')
      .set({ status: 'not-required' })
      .where('match_id', '=', m4.match_id)
      .execute();

    const rawCounts = await competition.countTournamentMatchesByStatus(tournament.tournamentId);

    const stage1Counts = rawCounts.filter((r) => r.stageId === stage1.stageId);
    expect(stage1Counts.length).toBeGreaterThanOrEqual(4);

    const stage2Counts = rawCounts.filter((r) => r.stageId === stage2.stageId);
    expect(stage2Counts).toHaveLength(1);
    expect(stage2Counts[0]?.status).toBeNull();
    expect(stage2Counts[0]?.count).toBe(0);

    const completion = await competition.getTournamentCompletion(tournament.tournamentId);

    expect(completion.stages).toHaveLength(2);
    expect(completion.stages[0]?.stageId).toBe(stage1.stageId);
    expect(completion.stages[0]?.stageName).toBe('Group Stage');
    expect(completion.stages[0]?.totalMatches).toBe(4);
    expect(completion.stages[0]?.resolvedMatches).toBe(2);
    expect(completion.stages[0]?.finalizedMatches).toBe(1);
    expect(completion.stages[0]?.forfeitedMatches).toBe(1);
    expect(completion.stages[0]?.liveMatches).toBe(1);
    expect(completion.stages[0]?.scheduledMatches).toBe(1);

    // Neither the stage's implicit zone nor its implicit group is a segment worth reporting.
    expect(completion.stages[0]?.segments).toEqual([]);

    expect(completion.stages[1]?.stageId).toBe(stage2.stageId);
    expect(completion.stages[1]?.stageName).toBe('Playoffs');
    expect(completion.stages[1]?.totalMatches).toBe(0);
    expect(completion.stages[1]?.resolvedMatches).toBe(0);

    expect(completion.totalMatches).toBe(4);
    expect(completion.resolvedMatches).toBe(2);
    expect(completion.finalizedMatches).toBe(1);
    expect(completion.forfeitedMatches).toBe(1);
    expect(completion.liveMatches).toBe(1);
    expect(completion.scheduledMatches).toBe(1);
  });

  it('reports tournament progress per declared group of a stage', async () => {
    const competition = new CompetitionRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);

    const setup = await withTransaction(scratch.db, async (uow) => {
      const d = descriptor();
      await tournaments.saveDescriptor(uow, d, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-segment-progress',
        name: 'Copa Segment Progress',
        descriptor: d,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const zone = await competition.createZone(uow, {
        stageId: stage.stageId,
        number: 1,
        name: 'Grupos',
        organizationId,
        ...AUDIT,
      });
      const groupA = await competition.createGroup(uow, {
        zoneId: zone.zoneId,
        number: 1,
        name: 'Grupo A',
        organizationId,
        ...AUDIT,
      });
      const groupB = await competition.createGroup(uow, {
        zoneId: zone.zoneId,
        number: 2,
        name: 'Grupo B',
        organizationId,
        ...AUDIT,
      });
      const [fixtureA, fixtureB] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        matchCount: 2,
        fixtures: [
          { round: 1, zoneId: zone.zoneId, groupId: groupA.groupId },
          { round: 1, zoneId: zone.zoneId, groupId: groupB.groupId },
        ],
        organizationId,
        ...AUDIT,
      });
      return { tournament, fixtureA, fixtureB, groupA, groupB };
    });
    if (!setup.fixtureA || !setup.fixtureB) throw new Error('expected two fixtures');

    const firstOfA = await scratch.db
      .selectFrom('matches')
      .select('match_id')
      .where('fixture_id', '=', setup.fixtureA.fixtureId)
      .orderBy('number', 'asc')
      .executeTakeFirstOrThrow();
    await scratch.db
      .updateTable('matches')
      .set({ status: 'finalized' })
      .where('match_id', '=', firstOfA.match_id)
      .execute();

    const completion = await competition.getTournamentCompletion(setup.tournament.tournamentId);
    expect(completion.stages[0]?.segments).toEqual([
      { segmentId: setup.groupA.groupId, name: 'Grupo A', totalMatches: 2, resolvedMatches: 1 },
      { segmentId: setup.groupB.groupId, name: 'Grupo B', totalMatches: 2, resolvedMatches: 0 },
    ]);
  });
});
