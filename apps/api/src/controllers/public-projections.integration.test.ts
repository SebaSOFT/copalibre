import type { INestApplication } from '@nestjs/common';
import { footballDescriptor, tennisDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  PersonRepository,
  EnrollmentRepository,
  ObjectMetadataRepository,
  StatisticRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import {
  PublicProjectionsController,
  PublicTournamentListingController,
} from './public-projections.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    PublicProjectionsController,
    PublicTournamentListingController,
  ]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('public projections routes', () => {
  let publishedTournament: Awaited<ReturnType<TournamentRepository['create']>>;
  let draftTournament: Awaited<ReturnType<TournamentRepository['create']>>;

  beforeAll(async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = {
      ...footballDescriptor({ name: { en: 'Football', es: 'Fútbol' } }),
      images: [{ key: 'modules/football/1.0.0/football-01.jpg' }],
    };

    draftTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-public-draft',
        name: 'Copa Public Draft',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    const createdPublished = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-public-published',
        name: 'Copa Public Published',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    publishedTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      return tournaments.publish(uow, {
        tournamentId: createdPublished.tournamentId,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });
  });

  it('serves nothing outside the /api prefix', async () => {
    const path = '/organizations/liga-orbital/public/tournaments';
    expect((await request({ method: 'GET', url: `/api${path}` })).statusCode).toBe(200);
    expect((await request({ method: 'GET', url: path })).statusCode).toBe(404);
  });

  it('404s on draft tournament for every route', async () => {
    const routes = ['overview', 'live', 'stages/1/bracket', 'stages/1/matches/1'];
    for (const route of routes) {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${draftTournament.alias}/${route}`,
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it('404s on nonexistent organization/tournament/stage', async () => {
    const responseOrg = await request({
      method: 'GET',
      url: `/api/organizations/unknown-org/tournaments/${publishedTournament.alias}/overview`,
    });
    expect(responseOrg.statusCode).toBe(404);

    const responseTourn = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/unknown-tourn/overview`,
    });
    expect(responseTourn.statusCode).toBe(404);

    const responseStage = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/999/bracket`,
    });
    expect(responseStage.statusCode).toBe(404);
  });

  it('returns real data with entrant names resolved for published tournament', async () => {
    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/overview`,
    });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload as string);
    expect(data.tournamentAlias).toBe(publishedTournament.alias);
    expect(data.organizationAlias).toBe('liga-orbital');
    expect(data.disciplineImages).toEqual([{ key: 'modules/football/1.0.0/football-01.jpg' }]);
    expect(data.disciplineName).toBe('Football');
    expect(data.localizedDisciplineName).toMatchObject({ en: 'Football', es: 'Fútbol' });
    expect(Array.isArray(data.matches)).toBe(true);
    expect(data.status).toBeDefined();
  });

  it('includes persisted in-progress matches on the public live route', async () => {
    const competition = new CompetitionRepository(scratch.db);
    const { liveMatchId, scheduledMatchId } = await withTransaction(
      scratch.db as Kysely<Database>,
      async (uow) => {
        const stage = await competition.createStageInTournament(uow, {
          tournamentId: publishedTournament.tournamentId,
          number: 98,
          name: 'Live read stage',
          format: 'single-elimination',
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const fixtures = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [{ round: 1 }, { round: 1 }],
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const liveFixture = fixtures[0];
        const scheduledFixture = fixtures[1];
        if (!liveFixture || !scheduledFixture) throw new Error('Expected two fixtures');
        const liveMatch = await competition.createMatch(uow, {
          fixtureId: liveFixture.fixtureId,
          number: 1,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const scheduledMatch = await competition.createMatch(uow, {
          fixtureId: scheduledFixture.fixtureId,
          number: 2,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await uow.tx
          .updateTable('matches')
          .set({ status: 'in-progress' })
          .where('match_id', '=', liveMatch.matchId)
          .execute();
        const half = await competition.createSegment(uow, {
          matchId: liveMatch.matchId,
          type: 'half',
          number: 1,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await competition.setSegmentState(uow, {
          segmentId: half.segmentId,
          state: 'active',
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        return { liveMatchId: liveMatch.matchId, scheduledMatchId: scheduledMatch.matchId };
      },
    );

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/live`,
    });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload as string) as {
      matches: { matchId: string; state: string }[];
    };
    expect(data.matches).toContainEqual(
      expect.objectContaining({
        matchId: liveMatchId,
        state: 'live',
        stageOrdinal: 1,
        segments: [
          expect.objectContaining({ number: 1, type: 'half', timed: true, state: 'active' }),
        ],
      }),
    );
    expect(data.matches.map((match) => match.matchId)).not.toContain(scheduledMatchId);
  });

  it("shows a merged-strategy ruleset field's full effective value, not the raw override delta", async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = {
      ...footballDescriptor(),
      images: [{ key: 'modules/football/1.0.0/football-01.jpg' }],
    };
    const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-public-merged-ruleset',
        name: 'Copa Public Merged Ruleset',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor,
        overrides: { tiebreakers: ['golden-goal'] },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournament;
    });
    const published = await withTransaction(scratch.db as Kysely<Database>, async (uow) =>
      tournaments.publish(uow, {
        tournamentId: created.tournamentId,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${published.alias}/overview`,
    });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload as string);
    expect(data.ruleset.tiebreakers).toBe('points,score-difference,goals-for,golden-goal');
  });

  it('lists the discipline defaults, with standard labels, for a tournament that overrides nothing', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: 'copa-public-default-ruleset',
        name: 'Copa Public Default Ruleset',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const published = await withTransaction(scratch.db as Kysely<Database>, async (uow) =>
      tournaments.publish(uow, {
        tournamentId: created.tournamentId,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${published.alias}/overview`,
    });
    const data = JSON.parse(response.payload as string);
    expect(Object.keys(data.ruleset).length).toBeGreaterThan(0);
    expect(data.ruleset['scoring.pointsPerWin']).toBe('3');
    expect(data.rulesetLabels['scoring.pointsPerWin']).toMatchObject({ es: 'Puntos Por Victoria' });
    expect(Object.keys(data.ruleset).some((key) => key.startsWith('registration.'))).toBe(false);
  });

  it('returns an upcoming stage-scoped match report and 404s for unknown stage or match numbers', async () => {
    const competition = new CompetitionRepository(scratch.db);
    const { stage, match } = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: publishedTournament.tournamentId,
        number: 1,
        name: 'Opening stage',
        format: 'single-elimination',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const fixtures = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const fixture = fixtures[0];
      if (!fixture) throw new Error('Expected one fixture');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return { stage, match };
    });

    const base = `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/${stage.number}/matches`;
    const response = await request({ method: 'GET', url: `${base}/${match.number}` });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload as string)).toMatchObject({
      stageNumber: stage.number,
      matchNumber: match.number,
      status: 'upcoming',
      organizationTimeZone: expect.any(String),
      disciplineImages: [{ key: 'modules/football/1.0.0/football-01.jpg' }],
      schedulePublished: false,
      rosters: { home: [], away: [] },
      timeline: [],
    });

    expect((await request({ method: 'GET', url: `${base}/999` })).statusCode).toBe(404);
    expect(
      (
        await request({
          method: 'GET',
          url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/999/matches/1`,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('returns a finished report with named sides, schedule officials, roster, and timeline', async () => {
    const competition = new CompetitionRepository(scratch.db);
    const { stage, match, playerId } = await withTransaction(
      scratch.db as Kysely<Database>,
      async (uow) => {
        const now = new Date();
        const homeTeamId = newId();
        const awayTeamId = newId();
        const homeEntrantId = newId();
        const awayEntrantId = newId();
        const playerId = newId();
        await uow.tx
          .insertInto('teams')
          .values([
            {
              team_id: homeTeamId,
              organization_id: organizationId,
              alias: 'atlas',
              club_id: null,
              name: 'Atlas',
              discipline_id: null,
              abbreviation: 'ATL',
              created_at: now,
            },
            {
              team_id: awayTeamId,
              organization_id: organizationId,
              alias: 'boreal',
              club_id: null,
              name: 'Boreal',
              discipline_id: null,
              abbreviation: 'BOR',
              created_at: now,
            },
          ])
          .execute();
        await uow.tx
          .insertInto('entrants')
          .values([
            {
              entrant_id: homeEntrantId,
              tournament_id: publishedTournament.tournamentId,
              entrant_kind: 'team',
              person_id: null,
              team_id: homeTeamId,
              abbreviation: 'ATL',
              seed: null,
              status: 'accepted',
              created_at: now,
            },
            {
              entrant_id: awayEntrantId,
              tournament_id: publishedTournament.tournamentId,
              entrant_kind: 'team',
              person_id: null,
              team_id: awayTeamId,
              abbreviation: 'BOR',
              seed: null,
              status: 'accepted',
              created_at: now,
            },
          ])
          .execute();
        await uow.tx
          .insertInto('persons')
          .values({
            person_id: playerId,
            organization_id: organizationId,
            alias: 'lucia-gomez',
            display_name: 'Lucía Gómez',
            natural_key_kind: null,
            natural_key_value: null,
            natural_key_normalised: null,
            nationality: null,
            photo_object_id: null,
            created_at: now,
          })
          .execute();

        const stage = await competition.createStageInTournament(uow, {
          tournamentId: publishedTournament.tournamentId,
          number: 2,
          name: 'Final stage',
          format: 'single-elimination',
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const fixtures = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [{ round: 1, homeEntrantId, awayEntrantId }],
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const fixture = fixtures[0];
        if (!fixture) throw new Error('Expected one fixture');
        const match = await competition.createMatch(uow, {
          fixtureId: fixture.fixtureId,
          number: 1,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const venueId = newId();
        const officialId = newId();
        const scheduleId = newId();
        await uow.tx
          .insertInto('venues')
          .values({
            venue_id: venueId,
            organization_id: organizationId,
            alias: 'central-stadium',
            name: 'Central Stadium',
            concurrent_capacity: 1,
            address: 'Av. Central 100',
            details: JSON.stringify({ caretaker: '+54 11 5555-0000' }),
            created_at: now,
          })
          .execute();
        await uow.tx
          .insertInto('officials')
          .values({
            official_id: officialId,
            organization_id: organizationId,
            display_name: 'María Referee',
            roles: JSON.stringify(['referee']),
            created_at: now,
          })
          .execute();
        await uow.tx
          .insertInto('schedules')
          .values({
            schedule_id: scheduleId,
            organization_id: organizationId,
            name: 'Main Schedule',
            starts_at: '1767225600000',
            ends_at: '1767232800000',
            slot_minutes: 90,
            turnaround_minutes: 15,
            created_at: now,
          })
          .execute();
        await uow.tx
          .insertInto('schedule_venues')
          .values({ schedule_id: scheduleId, venue_id: venueId })
          .execute();
        const slotId = '77777777-7777-7777-8777-777777777777';
        await uow.tx
          .insertInto('schedule_slots')
          .values({
            slot_id: slotId,
            schedule_id: scheduleId,
            venue_id: venueId,
            starts_at: '1767225600000',
            created_at: now,
          })
          .execute();
        await uow.tx
          .insertInto('match_schedule_assignments')
          .values({
            match_id: match.matchId,
            slot_id: slotId,
            published: true,
            created_at: now,
          })
          .execute();
        await uow.tx
          .insertInto('match_schedule_officials')
          .values({ match_id: match.matchId, official_id: officialId })
          .execute();
        await uow.tx
          .insertInto('match_rosters')
          .values({
            match_id: match.matchId,
            entrant_id: homeEntrantId,
            roster_members: JSON.stringify([
              {
                personId: playerId,
                number: 9,
                name: 'Lucía Gómez',
                roles: ['forward'],
                onField: true,
              },
            ]),
            updated_at: now,
          })
          .execute();
        const segment = await competition.createSegment(uow, {
          matchId: match.matchId,
          type: 'half',
          number: 1,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await competition.setSegmentState(uow, {
          segmentId: segment.segmentId,
          state: 'active',
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await competition.applyCommand(uow, {
          matchId: match.matchId,
          command: 'start',
          status: 'in-progress',
          grantedBy: 'seed',
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await competition.appendEvent(uow, {
          event: {
            eventId: newId(),
            matchId: match.matchId,
            segmentId: segment.segmentId,
            definitionCode: 'goal',
            occurredAt: '2026-01-01T00:10:00.000Z',
            side: homeEntrantId,
            personId: playerId,
            payload: {},
          },
          sequence: 1,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [
              { entrantId: homeEntrantId, statistics: { goals: 2 } },
              { entrantId: awayEntrantId, statistics: { goals: 1 } },
            ],
            recordedAt: '2026-01-01T01:00:00.000Z',
          },
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        return { stage, match, playerId };
      },
    );

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/${stage.number}/matches/${match.number}`,
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload as string)).toMatchObject({
      status: 'final',
      stageFormat: 'single-elimination',
      homeName: 'Atlas',
      homeAbbreviation: 'ATL',
      homeScore: 2,
      awayName: 'Boreal',
      awayScore: 1,
      venueName: 'Central Stadium',
      schedulePublished: true,
      officials: [{ name: 'María Referee', roles: ['referee'] }],
      rosters: { home: [{ personId: playerId, name: 'Lucía Gómez', number: 9 }], away: [] },
      timeline: [{ definitionCode: 'goal', label: 'Goal', personId: playerId }],
      // The half the goal was scored in: timed, labelled in every language, scored by its own events.
      segments: [
        {
          number: 1,
          type: 'half',
          timed: true,
          label: { en: 'Half' },
          state: 'active',
          scores: [1, 0],
        },
      ],
    });

    // The overview lists the venue of every published placement, without its free-form details.
    const overview = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/overview`,
    });
    expect(overview.statusCode).toBe(200);
    const venues = JSON.parse(overview.payload as string).venues;
    expect(venues).toEqual([
      {
        alias: 'central-stadium',
        name: 'Central Stadium',
        address: 'Av. Central 100',
        courtCount: 1,
      },
    ]);
    expect(overview.payload).not.toContain('caretaker');
  });

  it('serves match report headline score honoring declared scoringInput when wins is first key in statistics', async () => {
    const competition = new CompetitionRepository(scratch.db as Kysely<Database>);
    const now = new Date();

    const { stage, match } = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const homeTeamId = newId();
      const awayTeamId = newId();
      const homeEntrantId = newId();
      const awayEntrantId = newId();
      await uow.tx
        .insertInto('teams')
        .values([
          {
            team_id: homeTeamId,
            organization_id: organizationId,
            alias: 'spurs',
            club_id: null,
            name: 'Spurs',
            discipline_id: null,
            abbreviation: 'SAS',
            created_at: now,
          },
          {
            team_id: awayTeamId,
            organization_id: organizationId,
            alias: 'heat',
            club_id: null,
            name: 'Heat',
            discipline_id: null,
            abbreviation: 'MIA',
            created_at: now,
          },
        ])
        .execute();
      await uow.tx
        .insertInto('entrants')
        .values([
          {
            entrant_id: homeEntrantId,
            tournament_id: publishedTournament.tournamentId,
            entrant_kind: 'team',
            person_id: null,
            team_id: homeTeamId,
            abbreviation: 'SAS',
            seed: null,
            status: 'accepted',
            created_at: now,
          },
          {
            entrant_id: awayEntrantId,
            tournament_id: publishedTournament.tournamentId,
            entrant_kind: 'team',
            person_id: null,
            team_id: awayTeamId,
            abbreviation: 'MIA',
            seed: null,
            status: 'accepted',
            created_at: now,
          },
        ])
        .execute();

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: publishedTournament.tournamentId,
        number: 3,
        name: 'Conference Finals',
        format: 'single-elimination',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const fixtures = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId, awayEntrantId }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const fixture = fixtures[0];
      if (!fixture) throw new Error('Expected at least one fixture');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      // Deliberately place 'wins' as the first key, followed by 'points'
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: homeEntrantId, statistics: { wins: 1, points: 95 } },
            { entrantId: awayEntrantId, statistics: { wins: 0, points: 82 } },
          ],
          winnerEntrantId: homeEntrantId,
          recordedAt: '2026-01-01T01:00:00.000Z',
        },
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return { stage, match };
    });

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/${stage.number}/matches/${match.number}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string);
    // Score must be 95-82, NEVER 1-0 from the 'wins' key!
    expect(body.homeScore).toBe(95);
    expect(body.awayScore).toBe(82);
  });

  it("serves a person's public profile with computed age and no private fields", async () => {
    const people = new PersonRepository(scratch.db as Kysely<Database>);
    const enrollment = new EnrollmentRepository(scratch.db as Kysely<Database>);
    const statistics = new StatisticRepository(scratch.db as Kysely<Database>);
    const competition = new CompetitionRepository(scratch.db as Kysely<Database>);

    const { person } = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const { person } = await people.register(uow, {
        organizationId,
        displayName: 'Esteban Paredes',
        birthDate: '1995-05-20',
        naturalKey: { kind: 'dni', value: '38.999.888' },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await people.setNationality(uow, {
        personId: person.personId,
        organizationId,
        nationality: 'CL',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Colo-Colo',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await people.enlist(uow, {
        personId: person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const entrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: publishedTournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: publishedTournament.tournamentId,
        number: 10,
        name: 'Playoffs',
        format: 'single-elimination',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrant.entrantId }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      if (!fixture) {
        throw new Error('Fixture creation failed in test setup');
      }
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      await statistics.projectMatch(uow, {
        organizationId,
        matchId: match.matchId,
        projectionVersion: 1,
        figures: [
          {
            collectorCode: 'career-goals',
            actorGranularity: 'person',
            actorId: person.personId,
            competitionGranularity: 'organization',
            competitionId: organizationId,
            value: 12,
            samples: 4,
          },
        ],
      });

      return { person };
    });

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/${person.personId}/public/profile`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    const withCredentials = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/${person.personId}/public/profile`,
      token: 'not-a-real-token',
    });
    expect(withCredentials.statusCode).toBe(200);
    expect(withCredentials.payload).toBe(response.payload);
    const body = JSON.parse(response.payload as string);
    expect(body.personId).toBe(person.personId);
    expect(body.displayName).toBe('Esteban Paredes');
    expect(body.nationality).toBe('CL');
    expect(typeof body.age).toBe('number');
    expect(body.age).toBeGreaterThanOrEqual(30);

    // Negative assertions: raw private fields MUST NOT be present
    expect(body.birthDate).toBeUndefined();
    expect(body.birth_date).toBeUndefined();
    expect(body.naturalKey).toBeUndefined();
    expect(body.natural_key).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('38999888');
    expect(JSON.stringify(body)).not.toContain('1995-05-20');

    // History and career totals
    expect(body.competitionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tournamentAlias: publishedTournament.alias,
          teamName: 'Colo-Colo',
          role: 'player',
          disciplineName: 'Football',
          localizedDisciplineName: expect.objectContaining({
            en: 'Football',
            es: 'Fútbol',
          }),
        }),
      ]),
    );

    expect(body.careerStatistics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disciplineDescriptorId: publishedTournament.disciplineRef.descriptorId,
          disciplineName: 'Football',
          localizedDisciplineName: expect.objectContaining({
            en: 'Football',
            es: 'Fútbol',
          }),
          statistics: expect.arrayContaining([
            expect.objectContaining({
              code: 'career-goals',
              label: 'Career goals',
              localizedLabel: expect.objectContaining({
                en: 'Career goals',
                es: 'Goles en carrera',
              }),
              value: 12,
            }),
          ]),
        }),
      ]),
    );
  });

  it('shows non-empty career statistics on profile when match-level figures are recorded in a finalized match', async () => {
    const persons = new PersonRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const statistics = new StatisticRepository(scratch.db);

    const { person } = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const { person } = await persons.register(uow, {
        organizationId,
        naturalKey: { kind: 'dni', value: '99.887.766' },
        displayName: 'Alexis Sánchez',
        birthDate: '1988-12-19',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await persons.setNationality(uow, {
        personId: person.personId,
        organizationId,
        nationality: 'CL',
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const team = await enrollment.createTeam(uow, {
        name: 'Arsenal FC',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      await persons.enlist(uow, {
        personId: person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const entrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: publishedTournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: publishedTournament.tournamentId,
        number: 20,
        name: 'Finals',
        format: 'single-elimination',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrant.entrantId }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      if (!fixture) throw new Error('Fixture creation failed');

      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      await statistics.projectMatch(uow, {
        organizationId,
        matchId: match.matchId,
        projectionVersion: 1,
        figures: [
          {
            collectorCode: 'career-goals',
            actorGranularity: 'person',
            actorId: person.personId,
            competitionGranularity: 'match',
            competitionId: match.matchId,
            value: 5,
            samples: 1,
          },
        ],
      });

      return { person };
    });

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/${person.personId}/public/profile`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string);
    expect(body.careerStatistics.length).toBeGreaterThan(0);
    expect(body.careerStatistics[0].statistics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'career-goals',
          value: 5,
        }),
      ]),
    );
  });

  it('404s on player profile when person is not found or belongs to another organization', async () => {
    const unknownResponse = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/01890000-0000-7000-8000-999999999999/public/profile`,
    });
    expect(unknownResponse.statusCode).toBe(404);
    expect(String(unknownResponse.headers['cache-control'] ?? '')).not.toContain('public');
  });

  describe('player statistics drilldown', () => {
    const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

    const PLAYER_STATS_LAYOUT = {
      code: 'player-stats',
      target: 'player-ranking' as const,
      label: { en: 'Player Stats' },
      entityGranularity: 'person' as const,
      defaultSort: [{ columnCode: 'goals', direction: 'desc' as const }],
      columns: [
        {
          code: 'player',
          header: { en: 'Player' },
          source: { kind: 'actor-name' as const },
          format: 'text' as const,
        },
        {
          code: 'goals',
          header: { en: 'Goals' },
          source: { kind: 'collector' as const, code: 'drilldown-goals' },
          format: 'number' as const,
        },
        {
          code: 'appearances',
          header: { en: 'Apps' },
          source: { kind: 'collector' as const, code: 'drilldown-appearances' },
          format: 'number' as const,
        },
        {
          code: 'goals-per-match',
          header: { en: 'Goals/Match' },
          source: {
            kind: 'composite' as const,
            numerator: 'drilldown-goals',
            denominator: 'drilldown-appearances',
          },
          format: 'decimal-2' as const,
        },
      ],
    };

    const TEAM_STANDINGS_LAYOUT = {
      code: 'team-standings-drilldown',
      target: 'team-ranking' as const,
      label: { en: 'Team Standings' },
      entityGranularity: 'team' as const,
      defaultSort: [] as const,
      columns: [
        {
          code: 'name',
          header: { en: 'Team' },
          source: { kind: 'entrant-name' as const },
          format: 'text' as const,
        },
      ],
    };

    function drilldownDescriptor() {
      return footballDescriptor({
        // A distinct (descriptorId, version) pair — `saveDescriptor` upserts
        // on that pair with `onConflict(...).doNothing()`, and the outer
        // `describe`'s `beforeAll` already saved plain `footballDescriptor()`
        // under the base id/version in this same scratch database.
        descriptorId: '01890000-0000-7000-8000-0000000f0244',
        version: '1.0.0-drilldown-test',
        collectors: [
          {
            code: 'drilldown-goals',
            label: 'Goals',
            source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
            measure: { kind: 'count' },
            granularity: { actor: 'person', competition: 'match' },
            cadence: { kind: 'live' },
          },
          {
            code: 'drilldown-appearances',
            label: 'Appearances',
            source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
            measure: { kind: 'count' },
            granularity: { actor: 'person', competition: 'match' },
            cadence: { kind: 'live' },
          },
        ],
        tableLayouts: [PLAYER_STATS_LAYOUT, TEAM_STANDINGS_LAYOUT],
      });
    }

    let drilldownTournament: Awaited<ReturnType<TournamentRepository['create']>>;
    let drilldownDraftTournament: Awaited<ReturnType<TournamentRepository['create']>>;
    let scorerId: string;
    let benchedId: string;
    let matchOne: string;
    let matchTwo: string;
    let stageNumber: number;

    beforeAll(async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const persons = new PersonRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const statistics = new StatisticRepository(scratch.db);
      const discipline = drilldownDescriptor();

      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await tournaments.saveDescriptor(uow, discipline, { organizationId, ...AUDIT });
        drilldownDraftTournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-drilldown-draft',
          name: 'Copa Drilldown Draft',
          descriptor: discipline,
          ...AUDIT,
        });
      });

      const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        return tournaments.create(uow, {
          organizationId,
          alias: 'copa-drilldown',
          name: 'Copa Drilldown',
          descriptor: discipline,
          ...AUDIT,
        });
      });

      drilldownTournament = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...AUDIT }),
      );

      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        const team = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Drilldown United',
          ...AUDIT,
        });
        const opponent = await enrollment.createTeam(uow, {
          organizationId,
          name: 'Drilldown Rivals',
          ...AUDIT,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: drilldownTournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...AUDIT,
        });
        const opponentEntrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: drilldownTournament.tournamentId,
          entrantRef: { kind: 'team', teamId: opponent.teamId },
          ...AUDIT,
        });
        const { person: scorer } = await persons.register(uow, {
          organizationId,
          displayName: 'Drilldown Scorer',
          ...AUDIT,
        });
        scorerId = scorer.personId;
        await persons.enlist(uow, {
          personId: scorerId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...AUDIT,
        });

        const { person: benched } = await persons.register(uow, {
          organizationId,
          displayName: 'Drilldown Benched',
          ...AUDIT,
        });
        benchedId = benched.personId;
        await persons.enlist(uow, {
          personId: benchedId,
          teamId: team.teamId,
          role: 'player',
          organizationId,
          ...AUDIT,
        });

        const stage = await competition.createStageInTournament(uow, {
          tournamentId: drilldownTournament.tournamentId,
          number: 1,
          name: 'League',
          format: 'round-robin',
          organizationId,
          ...AUDIT,
        });
        stageNumber = stage.number;

        const [fixtureOne, fixtureTwo] = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [
            {
              round: 1,
              homeEntrantId: entrant.entrantId,
              awayEntrantId: opponentEntrant.entrantId,
            },
            {
              round: 2,
              homeEntrantId: entrant.entrantId,
              awayEntrantId: opponentEntrant.entrantId,
            },
          ],
          organizationId,
          ...AUDIT,
        });
        if (!fixtureOne || !fixtureTwo) throw new Error('Fixture creation failed in test setup');

        const createdMatchOne = await competition.createMatch(uow, {
          fixtureId: fixtureOne.fixtureId,
          number: 1,
          organizationId,
          ...AUDIT,
        });
        matchOne = createdMatchOne.matchId;
        const createdMatchTwo = await competition.createMatch(uow, {
          fixtureId: fixtureTwo.fixtureId,
          number: 2,
          organizationId,
          ...AUDIT,
        });
        matchTwo = createdMatchTwo.matchId;

        // Only `scorerId` is rostered — `benchedId` is enlisted on the team but
        // never named on either match's roster, so the "no roster appearance"
        // scenario has a real organization-level person to point at.
        await uow.tx
          .insertInto('match_rosters')
          .values([
            {
              match_id: matchOne,
              entrant_id: entrant.entrantId,
              roster_members: JSON.stringify([
                { personId: scorerId, name: 'Drilldown Scorer', onField: true },
              ]),
              updated_at: new Date(),
            },
            {
              match_id: matchTwo,
              entrant_id: entrant.entrantId,
              roster_members: JSON.stringify([
                { personId: scorerId, name: 'Drilldown Scorer', onField: true },
              ]),
              updated_at: new Date(),
            },
          ])
          .execute();

        await statistics.projectMatch(uow, {
          organizationId,
          matchId: matchOne,
          projectionVersion: 1,
          figures: [
            {
              collectorCode: 'drilldown-goals',
              actorGranularity: 'person',
              actorId: scorerId,
              competitionGranularity: 'match',
              competitionId: matchOne,
              value: 2,
              samples: 1,
            },
            {
              collectorCode: 'drilldown-appearances',
              actorGranularity: 'person',
              actorId: scorerId,
              competitionGranularity: 'match',
              competitionId: matchOne,
              value: 1,
              samples: 1,
            },
          ],
        });
        await statistics.projectMatch(uow, {
          organizationId,
          matchId: matchTwo,
          projectionVersion: 1,
          figures: [
            {
              collectorCode: 'drilldown-goals',
              actorGranularity: 'person',
              actorId: scorerId,
              competitionGranularity: 'match',
              competitionId: matchTwo,
              value: 1,
              samples: 1,
            },
            {
              collectorCode: 'drilldown-appearances',
              actorGranularity: 'person',
              actorId: scorerId,
              competitionGranularity: 'match',
              competitionId: matchTwo,
              value: 1,
              samples: 1,
            },
          ],
        });

        // Finalizing is what makes a match count as a "finalized match" for
        // `listFinalizedMatches`, the boundary the drilldown's match rows and
        // tournament total both read through.
        await competition.recordResult(uow, {
          matchId: matchOne,
          result: {
            sides: [
              { entrantId: entrant.entrantId, statistics: {} },
              { entrantId: opponentEntrant.entrantId, statistics: {} },
            ],
            winnerEntrantId: entrant.entrantId,
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT,
        });
        await competition.recordResult(uow, {
          matchId: matchTwo,
          result: {
            sides: [
              { entrantId: entrant.entrantId, statistics: {} },
              { entrantId: opponentEntrant.entrantId, statistics: {} },
            ],
            winnerEntrantId: entrant.entrantId,
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT,
        });
      });
    });

    it('projects the tournament total with composite columns and one row per finalized match without them', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=player-stats`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      expect(body.layoutCode).toBe('player-stats');
      expect(body.columns.map((c: { code: string }) => c.code)).toEqual([
        'player',
        'goals',
        'appearances',
        'goals-per-match',
      ]);

      // Tournament total: every non-rank column, composite included.
      expect(body.tournamentTotal.goals).toEqual({ raw: 3, formatted: '3' });
      expect(body.tournamentTotal.appearances).toEqual({ raw: 2, formatted: '2' });
      expect(body.tournamentTotal['goals-per-match'].raw).toBeCloseTo(1.5);

      // Match rows: collector-kind columns only, chronological, own figures.
      expect(body.matches).toHaveLength(2);
      expect(body.matches[0]).toMatchObject({ stageNumber, matchNumber: 1 });
      expect(body.matches[0].cells).toEqual({
        goals: { raw: 2, formatted: '2' },
        appearances: { raw: 1, formatted: '1' },
      });
      expect(body.matches[0].cells['goals-per-match']).toBeUndefined();
      expect(body.matches[0].cells.player).toBeUndefined();
      expect(body.matches[1]).toMatchObject({ stageNumber, matchNumber: 2 });
      expect(body.matches[1].cells.goals).toEqual({ raw: 1, formatted: '1' });
    });

    it('defaults to the tournament’s first effective person-granularity layout when no layout is given', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload as string).layoutCode).toBe('player-stats');
    });

    it('404s a team-granularity (non-person) layout named for the drilldown', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=team-standings-drilldown`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an undeclared layout code', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=nonexistent`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an unpublished (draft) tournament', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownDraftTournament.alias}/persons/${scorerId}/public/statistics`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an unknown or cross-organization person', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/01890000-0000-7000-8000-999999999999/public/statistics`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('has no inferred tournament total or match rows for a person never named on a match roster', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${benchedId}/public/statistics?layout=player-stats`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      expect(body.tournamentTotal).toBeUndefined();
      expect(body.matches).toEqual([]);
    });
  });

  describe('organization tournaments listing', () => {
    it('returns only published tournaments and excludes drafts', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      expect(body.organizationAlias).toBe('liga-orbital');
      expect(body.organizationName).toBeDefined();
      expect(Array.isArray(body.tournaments)).toBe(true);

      const aliases = body.tournaments.map((t: { alias: string }) => t.alias);
      expect(aliases).toContain(publishedTournament.alias);
      expect(aliases).not.toContain(draftTournament.alias);
    });

    it('404s on unknown organization', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/nonexistent-org-alias/public/tournaments`,
      });
      expect(response.statusCode).toBe(404);
    });

    it("includes the organization's clubs, ordered by name", async () => {
      const enrollments = new EnrollmentRepository(scratch.db);
      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        await enrollments.createClub(uow, {
          organizationId,
          alias: 'club-listing-zulu',
          name: 'Zulu Listing Club',
          abbreviation: 'ZLC',
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await enrollments.createClub(uow, {
          organizationId,
          alias: 'club-listing-alfa',
          name: 'Alfa Listing Club',
          abbreviation: 'ALC',
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      });

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const clubNames = body.clubs.map((c: { name: string }) => c.name);
      expect(clubNames).toEqual(expect.arrayContaining(['Alfa Listing Club', 'Zulu Listing Club']));
      expect(clubNames.indexOf('Alfa Listing Club')).toBeLessThan(
        clubNames.indexOf('Zulu Listing Club'),
      );
    });

    it('resolves champions and runners-up for finished duel tournaments', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-duel-finished',
          name: 'Copa Duel Finished',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const { champEntrant, runnerEntrant } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          const club1 = await enrollments.createClub(uow, {
            organizationId,
            alias: 'club-alpha',
            name: 'Club Alpha',
            abbreviation: 'ALP',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const club2 = await enrollments.createClub(uow, {
            organizationId,
            alias: 'club-beta',
            name: 'Club Beta',
            abbreviation: 'BET',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const team1 = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-alpha',
            name: 'Team Alpha',
            clubId: club1.clubId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const team2 = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-beta',
            name: 'Team Beta',
            clubId: club2.clubId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const entrant1 = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: team1.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const entrant2 = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: team2.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const stage = await competition.createStageInTournament(uow, {
            tournamentId: created.tournamentId,
            number: 1,
            name: 'Playoffs',
            format: 'single-elimination',
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const fixtures = await competition.createFixtures(uow, {
            stageId: stage.stageId,
            fixtures: [
              { round: 1, homeEntrantId: entrant1.entrantId, awayEntrantId: entrant2.entrantId },
            ],
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const fixture = fixtures[0];
          if (!fixture) throw new Error('Expected fixture');

          const match = await competition.createMatch(uow, {
            fixtureId: fixture.fixtureId,
            number: 1,
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          await competition.recordResult(uow, {
            matchId: match.matchId,
            result: {
              sides: [
                { entrantId: entrant1.entrantId, statistics: { score: 3 } },
                { entrantId: entrant2.entrantId, statistics: { score: 1 } },
              ],
              winnerEntrantId: entrant1.entrantId,
              recordedAt: new Date().toISOString(),
            },
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          return { champEntrant: entrant1, runnerEntrant: entrant2 };
        },
      );

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.status).toBe('finished');
      expect(found.winners).toBeDefined();
      expect(found.winners.length).toBe(1);
      expect(found.winners[0].champion.entrantId).toBe(champEntrant.entrantId);
      expect(found.winners[0].champions).toEqual([
        expect.objectContaining({ entrantId: champEntrant.entrantId, name: 'Team Alpha' }),
      ]);
      expect(found.winners[0].champion.name).toBe('Team Alpha');
      expect(found.winners[0].champion.abbreviation).toBe('ALP');
      expect(found.winners[0].runnerUp.entrantId).toBe(runnerEntrant.entrantId);
      expect(found.winners[0].runnerUp.name).toBe('Team Beta');
      expect(found.winners[0].runnerUp.abbreviation).toBe('BET');
    });

    it('reconstructs the generated final beside a same-round classification fixture, per zone', async () => {
      // Reproduces the panamericano-clubes-2025 shape that surfaced the bug:
      // a multi-zone terminal stage where a generated championship final and
      // a classification fixture share a round, plus one legacy-shaped zone
      // whose outcome lineage uniquely identifies one deepest-round fixture.
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-multizona-ambigua',
          name: 'Copa Multizona Ambigua',
          descriptor,
          ...audit,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const { silverChamp, silverRunnerUp, bronzeA1, bronzeB1 } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          async function team(alias: string, name: string): Promise<{ entrantId: string }> {
            const club = await enrollments.createClub(uow, {
              organizationId,
              alias: `club-${alias}`,
              name: `Club ${name}`,
              actor: 'user:seed',
              authorizationContext: 'seed',
            });
            const registeredTeam = await enrollments.createTeam(uow, {
              organizationId,
              alias: `team-${alias}`,
              name,
              clubId: club.clubId,
              ...audit,
            });
            return enrollments.registerEntrant(uow, {
              tournamentId: created.tournamentId,
              organizationId,
              entrantRef: { kind: 'team', teamId: registeredTeam.teamId },
              ...audit,
            });
          }

          const stage = await competition.createStageInTournament(uow, {
            tournamentId: created.tournamentId,
            number: 1,
            name: 'Playoffs Multizona',
            format: 'single-elimination',
            organizationId,
            ...audit,
          });

          // Both zones must be created before ANY fixture in the stage
          // (createZone refuses once the stage has fixtures).
          const gold = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 1,
            name: 'Copa de Oro',
            organizationId,
            ...audit,
          });
          const silver = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 2,
            name: 'Copa de Plata',
            organizationId,
            ...audit,
          });
          const bronze = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 3,
            name: 'Copa de Bronce',
            organizationId,
            ...audit,
          });
          const legacy = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 4,
            name: 'Copa de Legado',
            organizationId,
            ...audit,
          });

          const [
            goldA1,
            goldA2,
            goldB1,
            goldB2,
            silverChamp,
            silverRunnerUp,
            bronzeA1,
            bronzeA2,
            bronzeB1,
            bronzeB2,
            legacy1,
            legacy2,
            legacy3,
            legacy4,
            legacy5,
            legacy6,
            legacy7,
            legacy8,
          ] = await Promise.all([
            team('gold-a1', 'Gold Finalist A'),
            team('gold-a2', 'Gold Finalist B'),
            team('gold-b1', 'Gold Finalist C'),
            team('gold-b2', 'Gold Finalist D'),
            team('silver-1', 'Silver Champion'),
            team('silver-2', 'Silver Runner-up'),
            team('bronze-a1', 'Bronze Semifinalist A'),
            team('bronze-a2', 'Bronze Semifinalist B'),
            team('bronze-b1', 'Bronze Semifinalist C'),
            team('bronze-b2', 'Bronze Semifinalist D'),
            team('legacy-1', 'Legacy Entrant 1'),
            team('legacy-2', 'Legacy Entrant 2'),
            team('legacy-3', 'Legacy Entrant 3'),
            team('legacy-4', 'Legacy Entrant 4'),
            team('legacy-5', 'Legacy Entrant 5'),
            team('legacy-6', 'Legacy Entrant 6'),
            team('legacy-7', 'Legacy Entrant 7'),
            team('legacy-8', 'Legacy Entrant 8'),
          ]);

          // Gold zone has two semifinal fixtures, followed by a generated
          // final and a classification fixture in the same round. The saved
          // bracket graph and outcomes identify the final without a role field;
          // Bronze also records a tied generated final and shares the title.
          const fixtures = await competition.createFixtures(uow, {
            stageId: stage.stageId,
            fixtures: [
              {
                round: 1,
                homeEntrantId: goldA1.entrantId,
                awayEntrantId: goldA2.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 1,
                homeEntrantId: goldB1.entrantId,
                awayEntrantId: goldB2.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 2,
                homeEntrantId: goldA1.entrantId,
                awayEntrantId: goldB1.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 2,
                homeEntrantId: goldA2.entrantId,
                awayEntrantId: goldB2.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 1,
                homeEntrantId: silverChamp.entrantId,
                awayEntrantId: silverRunnerUp.entrantId,
                zoneId: silver.zoneId,
              },
              {
                round: 1,
                homeEntrantId: bronzeA1.entrantId,
                awayEntrantId: bronzeA2.entrantId,
                zoneId: bronze.zoneId,
              },
              {
                round: 1,
                homeEntrantId: bronzeB1.entrantId,
                awayEntrantId: bronzeB2.entrantId,
                zoneId: bronze.zoneId,
              },
              {
                round: 2,
                homeEntrantId: bronzeA2.entrantId,
                awayEntrantId: bronzeB2.entrantId,
                zoneId: bronze.zoneId,
              },
              {
                round: 1,
                homeEntrantId: legacy1.entrantId,
                awayEntrantId: legacy2.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 1,
                homeEntrantId: legacy3.entrantId,
                awayEntrantId: legacy4.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy2.entrantId,
                awayEntrantId: legacy1.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy3.entrantId,
                awayEntrantId: legacy4.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy5.entrantId,
                awayEntrantId: legacy6.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy7.entrantId,
                awayEntrantId: legacy8.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy1.entrantId,
                awayEntrantId: legacy4.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: legacy5.entrantId,
                awayEntrantId: legacy7.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 3,
                homeEntrantId: legacy2.entrantId,
                awayEntrantId: legacy3.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 3,
                homeEntrantId: legacy1.entrantId,
                awayEntrantId: legacy4.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 3,
                homeEntrantId: legacy5.entrantId,
                awayEntrantId: legacy7.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 3,
                homeEntrantId: legacy6.entrantId,
                awayEntrantId: legacy8.entrantId,
                zoneId: legacy.zoneId,
              },
              {
                round: 2,
                homeEntrantId: bronzeA1.entrantId,
                awayEntrantId: bronzeB1.entrantId,
                zoneId: bronze.zoneId,
              },
            ],
            organizationId,
            ...audit,
          });
          for (const [fixture, winnerEntrantId] of [
            [fixtures[0], goldA1.entrantId],
            [fixtures[1], goldB1.entrantId],
            [fixtures[2], goldA1.entrantId],
            [fixtures[3], goldA2.entrantId],
            [fixtures[4], silverChamp.entrantId],
            [fixtures[5], bronzeA1.entrantId],
            [fixtures[6], bronzeB1.entrantId],
            [fixtures[7], bronzeA2.entrantId],
            [fixtures[8], legacy1.entrantId],
            [fixtures[9], legacy4.entrantId],
            [fixtures[10], legacy2.entrantId],
            [fixtures[11], legacy3.entrantId],
            [fixtures[12], legacy5.entrantId],
            [fixtures[13], legacy8.entrantId],
            [fixtures[14], legacy1.entrantId],
            [fixtures[15], legacy7.entrantId],
            [fixtures[16], legacy2.entrantId],
            [fixtures[17], legacy1.entrantId],
            [fixtures[18], legacy5.entrantId],
            [fixtures[19], legacy8.entrantId],
          ] as const) {
            if (!fixture) throw new Error('Expected fixture');
            const { homeEntrantId, awayEntrantId } = fixture;
            if (!homeEntrantId || !awayEntrantId) throw new Error('Expected both entrants');
            const match = await competition.createMatch(uow, {
              fixtureId: fixture.fixtureId,
              number: 1,
              organizationId,
              ...audit,
            });
            await competition.recordResult(uow, {
              matchId: match.matchId,
              result: {
                sides: [
                  { entrantId: homeEntrantId, statistics: {} },
                  { entrantId: awayEntrantId, statistics: {} },
                ],
                winnerEntrantId,
                recordedAt: new Date().toISOString(),
              },
              organizationId,
              ...audit,
            });
          }

          const bronzeFinal = fixtures[20];
          if (!bronzeFinal) throw new Error('Expected tied Bronze final fixture');
          const bronzeFinalMatch = await competition.createMatch(uow, {
            fixtureId: bronzeFinal.fixtureId,
            number: 1,
            organizationId,
            ...audit,
          });
          await competition.recordResult(uow, {
            matchId: bronzeFinalMatch.matchId,
            result: {
              sides: [
                { entrantId: bronzeA1.entrantId, statistics: { score: 4 } },
                { entrantId: bronzeB1.entrantId, statistics: { score: 4 } },
              ],
              recordedAt: new Date().toISOString(),
            },
            organizationId,
            ...audit,
          });

          return { silverChamp, silverRunnerUp, bronzeA1, bronzeB1 };
        },
      );

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.winners).toBeDefined();
      const zoneNames = found.winners.map((zone: { zoneName?: string }) => zone.zoneName);
      expect(zoneNames).toContain('Copa de Oro');
      expect(zoneNames).toContain('Copa de Plata');
      expect(zoneNames).toContain('Copa de Legado');
      expect(zoneNames).toContain('Copa de Bronce');
      const goldZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Oro',
      );
      expect(goldZone.champion.name).toBe('Gold Finalist A');
      expect(goldZone.champions).toHaveLength(1);
      expect(goldZone.runnerUp.name).toBe('Gold Finalist C');
      const silverZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Plata',
      );
      expect(silverZone.champion.entrantId).toBe(silverChamp.entrantId);
      expect(silverZone.champions).toHaveLength(1);
      expect(silverZone.runnerUp.entrantId).toBe(silverRunnerUp.entrantId);
      const legacyZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Legado',
      );
      expect(legacyZone.champion.name).toBe('Legacy Entrant 2');
      expect(legacyZone.champions).toHaveLength(1);
      expect(legacyZone.runnerUp.name).toBe('Legacy Entrant 3');
      const bronzeZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Bronce',
      );
      expect(
        bronzeZone.champions.map((champion: { entrantId: string }) => champion.entrantId),
      ).toEqual([bronzeA1.entrantId, bronzeB1.entrantId]);
      expect(bronzeZone.champion.entrantId).toBe(bronzeA1.entrantId);
      expect(bronzeZone.runnerUp).toBeUndefined();
    });

    it('lists the champion of every cup of a stage whose cups also play classification games', async () => {
      // Twelve fixtures per cup: quarter-finals, semi-finals, a fifth-to-eighth round and the
      // final beside the third, fifth and seventh place games. The fifth-place game's entrants pass
      // the same lineage test as the finalists, so only the unbeaten finalists identify the final.
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
      const db = scratch.db as Kysely<Database>;

      const created = await withTransaction(db, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copas-clasificatorias',
          name: 'Copas Clasificatorias',
          descriptor: footballDescriptor(),
          ...audit,
        }),
      );
      await withTransaction(db, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      // [round, home, home score, away, away score]; a drawn game records no winner.
      const cupGames: readonly (readonly [number, number, number, number, number])[] = [
        [1, 1, 2, 2, 7],
        [1, 3, 1, 4, 5],
        [1, 5, 3, 6, 3],
        [1, 7, 2, 8, 4],
        [2, 2, 3, 8, 1],
        [2, 6, 1, 4, 2],
        [2, 1, 5, 7, 3],
        [2, 5, 7, 3, 1],
        [3, 2, 0, 4, 3],
        [3, 8, 5, 6, 4],
        [3, 1, 3, 5, 3],
        [3, 7, 4, 3, 9],
      ];
      const champions: Record<string, string> = {};

      await withTransaction(db, async (uow) => {
        const stage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Copas',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });
        const zones = [
          await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 1,
            name: 'Copa Uno',
            organizationId,
            ...audit,
          }),
          await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 2,
            name: 'Copa Dos',
            organizationId,
            ...audit,
          }),
        ];

        const entrantsOf = new Map<string, { entrantId: string }[]>();
        for (const zone of zones) {
          const entrants: { entrantId: string }[] = [];
          for (let slot = 1; slot <= 8; slot += 1) {
            const alias = `${zone.name.replace(' ', '-').toLowerCase()}-${slot}`;
            const club = await enrollments.createClub(uow, {
              organizationId,
              alias: `club-${alias}`,
              name: `Club ${alias}`,
              ...audit,
            });
            const team = await enrollments.createTeam(uow, {
              organizationId,
              alias: `team-${alias}`,
              name: `${zone.name} ${slot}`,
              clubId: club.clubId,
              ...audit,
            });
            entrants.push(
              await enrollments.registerEntrant(uow, {
                tournamentId: created.tournamentId,
                organizationId,
                entrantRef: { kind: 'team', teamId: team.teamId },
                ...audit,
              }),
            );
          }
          entrantsOf.set(zone.zoneId, entrants);
        }
        const slotOf = (zoneId: string, slot: number) =>
          (entrantsOf.get(zoneId)?.[slot - 1] as { entrantId: string }).entrantId;

        // Every fixture of the stage is created in one call: a zone cannot be added once the
        // stage holds a fixture.
        const fixtures = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: zones.flatMap((zone) =>
            cupGames.map(([round, home, , away]) => ({
              round,
              homeEntrantId: slotOf(zone.zoneId, home),
              awayEntrantId: slotOf(zone.zoneId, away),
              zoneId: zone.zoneId,
            })),
          ),
          organizationId,
          ...audit,
        });
        for (const [zoneIndex, zone] of zones.entries()) {
          for (const [index, [, home, homeScore, away, awayScore]] of cupGames.entries()) {
            const fixture = fixtures[zoneIndex * cupGames.length + index];
            if (!fixture) throw new Error('Expected fixture');
            const homeId = slotOf(zone.zoneId, home);
            const awayId = slotOf(zone.zoneId, away);
            const match = await competition.createMatch(uow, {
              fixtureId: fixture.fixtureId,
              number: 1,
              organizationId,
              ...audit,
            });
            await competition.recordResult(uow, {
              matchId: match.matchId,
              result: {
                sides: [
                  { entrantId: homeId, statistics: { score: homeScore } },
                  { entrantId: awayId, statistics: { score: awayScore } },
                ],
                ...(homeScore === awayScore
                  ? {}
                  : { winnerEntrantId: homeScore > awayScore ? homeId : awayId }),
                recordedAt: new Date().toISOString(),
              },
              organizationId,
              ...audit,
            });
          }
          // The final is the first fixture of the third round: seed 2 against seed 4.
          champions[zone.name] = slotOf(zone.zoneId, 4);
        }
      });

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });
      expect(response.statusCode).toBe(200);
      const found = JSON.parse(response.payload as string).tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found.winners.map((zone: { zoneName?: string }) => zone.zoneName)).toEqual([
        'Copa Uno',
        'Copa Dos',
      ]);
      for (const zone of found.winners as {
        zoneName: string;
        champions: { entrantId: string }[];
      }[]) {
        expect(zone.champions.map((champion) => champion.entrantId)).toEqual([
          champions[zone.zoneName],
        ]);
      }
    });

    it('resolves an explicit third place for a finished ranked tournament', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-placement-finished',
          name: 'Copa Placement Finished',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const { rank1Entrant, rank2Entrant, rank3Entrant } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          const teamA = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-placement-a',
            name: 'Placement A',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const teamB = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-placement-b',
            name: 'Placement B',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const teamC = await enrollments.createTeam(uow, {
            organizationId,
            alias: 'team-placement-c',
            name: 'Placement C',
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const entrantA = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: teamA.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const entrantB = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: teamB.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const entrantC = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: teamC.teamId },
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const stage = await competition.createStageInTournament(uow, {
            tournamentId: created.tournamentId,
            number: 1,
            name: 'League',
            format: 'league',
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          const fixtures = await competition.createFixtures(uow, {
            stageId: stage.stageId,
            fixtures: [
              { round: 1, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantB.entrantId },
              { round: 2, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantC.entrantId },
              { round: 3, homeEntrantId: entrantB.entrantId, awayEntrantId: entrantC.entrantId },
            ],
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          for (const [index, fixture] of fixtures.entries()) {
            if (!fixture) throw new Error('Expected fixture');
            const result = (
              [
                [entrantA.entrantId, entrantB.entrantId, 3],
                [entrantA.entrantId, entrantC.entrantId, 2],
                [entrantB.entrantId, entrantC.entrantId, 1],
              ] as const
            )[index];
            if (!result) throw new Error('Expected result');
            const [home, away, homeGoals] = result;
            const match = await competition.createMatch(uow, {
              fixtureId: fixture.fixtureId,
              number: 1,
              organizationId,
              actor: 'user:seed',
              authorizationContext: 'seed',
            });
            await competition.recordResult(uow, {
              matchId: match.matchId,
              result: {
                sides: [
                  { entrantId: home, statistics: { goals: homeGoals } },
                  { entrantId: away, statistics: { goals: 0 } },
                ],
                winnerEntrantId: home,
                recordedAt: new Date().toISOString(),
              },
              organizationId,
              actor: 'user:seed',
              authorizationContext: 'seed',
            });
          }

          return { rank1Entrant: entrantA, rank2Entrant: entrantB, rank3Entrant: entrantC };
        },
      );

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.status).toBe('finished');
      expect(found.winners).toBeDefined();
      expect(found.winners.length).toBe(1);
      expect(found.winners[0].champion.entrantId).toBe(rank1Entrant.entrantId);
      expect(found.winners[0].champion.name).toBe('Placement A');
      expect(found.winners[0].runnerUp.entrantId).toBe(rank2Entrant.entrantId);
      expect(found.winners[0].runnerUp.name).toBe('Placement B');
      expect(found.winners[0].thirdPlace.entrantId).toBe(rank3Entrant.entrantId);
      expect(found.winners[0].thirdPlace.name).toBe('Placement C');
    });

    it('returns no winners on unfinished tournaments', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const descriptor = footballDescriptor();

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-upcoming-clean',
          name: 'Copa Upcoming Clean',
          descriptor,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      );

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.status).toBe('upcoming');
      expect(found.winners).toBeUndefined();
    });
  });

  describe('stage bracket projection', () => {
    it('projects one correctly-scoped bracket per zone, with no cross-zone round/position collision', async () => {
      // Reproduces the shape that surfaced the bug: 2 parallel zones in one
      // single-elimination stage, both with a round-1/position-1 fixture —
      // before the fix, `bracket()` generated one flat graph from every
      // zone's entrants combined and matched real data by `round:position`
      // alone, so both zones' round-1/position-1 nodes collided and were
      // dropped as "ambiguous" (real entrant/status data never attached).
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-multizona-bracket',
          name: 'Copa Multizona Bracket',
          descriptor,
          ...audit,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );

      const { goldWinner, goldEmblemObjectId } = await withTransaction(
        scratch.db as Kysely<Database>,
        async (uow) => {
          async function team(
            alias: string,
            name: string,
          ): Promise<{ entrantId: string; clubId: string }> {
            const club = await enrollments.createClub(uow, {
              organizationId,
              alias: `club-${alias}`,
              name: `Club ${name}`,
              actor: 'user:seed',
              authorizationContext: 'seed',
            });
            const registeredTeam = await enrollments.createTeam(uow, {
              organizationId,
              alias: `team-${alias}`,
              name,
              clubId: club.clubId,
              ...audit,
            });
            const entrant = await enrollments.registerEntrant(uow, {
              tournamentId: created.tournamentId,
              organizationId,
              entrantRef: { kind: 'team', teamId: registeredTeam.teamId },
              ...audit,
            });
            return { entrantId: entrant.entrantId, clubId: club.clubId };
          }

          const stage = await competition.createStageInTournament(uow, {
            tournamentId: created.tournamentId,
            number: 1,
            name: 'Playoffs Multizona',
            format: 'single-elimination',
            organizationId,
            ...audit,
          });

          // Both zones must exist before any fixture (createZone refuses once the stage has
          // fixtures), matching this file's own setup convention above.
          const gold = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 1,
            name: 'Copa de Oro',
            organizationId,
            ...audit,
          });
          const silver = await competition.createZone(uow, {
            stageId: stage.stageId,
            number: 2,
            name: 'Copa de Plata',
            organizationId,
            ...audit,
          });

          const [goldA, goldB, silverA, silverB] = await Promise.all([
            team('gold-a', 'Gold A'),
            team('gold-b', 'Gold B'),
            team('silver-a', 'Silver A'),
            team('silver-b', 'Silver B'),
          ]);

          const emblemObject = await new ObjectMetadataRepository(scratch.db).save(uow, {
            organizationId,
            profile: 'filesystem',
            storageKey: `organizations/${organizationId}/gold-a-emblem`,
            contentType: 'image/png',
            sizeBytes: 1024,
            uploadedBy: 'user:seed',
          });
          const goldEmblemObjectId = emblemObject.objectId;
          await enrollments.updateClub(uow, {
            clubId: goldA.clubId,
            organizationId,
            emblemObjectId: goldEmblemObjectId,
            ...audit,
          });

          // Both zones' terminal (only) round is round 1, position 1 — the exact collision shape.
          await competition.createFixtures(uow, {
            stageId: stage.stageId,
            fixtures: [
              {
                round: 1,
                homeEntrantId: goldA.entrantId,
                awayEntrantId: goldB.entrantId,
                zoneId: gold.zoneId,
              },
              {
                round: 1,
                homeEntrantId: silverA.entrantId,
                awayEntrantId: silverB.entrantId,
                zoneId: silver.zoneId,
              },
            ],
            organizationId,
            ...audit,
          });

          return { goldWinner: goldA, goldEmblemObjectId };
        },
      );

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${created.alias}/stages/1/bracket`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.zones).toHaveLength(2);

      const goldZone = body.zones.find((z: { zoneName?: string }) => z.zoneName === 'Copa de Oro');
      const silverZone = body.zones.find(
        (z: { zoneName?: string }) => z.zoneName === 'Copa de Plata',
      );
      expect(goldZone).toBeDefined();
      expect(silverZone).toBeDefined();

      // Neither zone's round-1/position-1 node is dropped as ambiguous: both resolve to real
      // entrants, not TBD placeholders, despite sharing round/position with the other zone.
      for (const zone of [goldZone, silverZone]) {
        expect(zone.matches).toHaveLength(1);
        const node = zone.matches[0];
        expect(node.round).toBe(1);
        expect(node.position).toBe(1);
        for (const slot of node.slots) {
          expect(slot.kind).toBe('entrant');
          expect(slot.entrantId).toEqual(expect.any(String));
        }
      }

      // The entrant with a recorded club emblem carries it through; the sibling entrant (no
      // emblem) carries neither field.
      const goldSlot = goldZone.matches[0].slots.find(
        (s: { entrantId?: string }) => s.entrantId === goldWinner.entrantId,
      );
      expect(goldSlot.clubId).toBe(goldWinner.clubId);
      expect(goldSlot.emblemObjectId).toBe(goldEmblemObjectId);
      const otherGoldSlot = goldZone.matches[0].slots.find(
        (s: { entrantId?: string }) => s.entrantId !== goldWinner.entrantId,
      );
      expect(otherGoldSlot.emblemObjectId).toBeUndefined();
    });

    it('draws a placement game as its own branch and keeps it off the generated final', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-placement-bracket',
          name: 'Copa Placement Bracket',
          descriptor,
          ...audit,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );

      const entrants = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        const register = async (alias: string): Promise<string> => {
          const team = await enrollments.createTeam(uow, {
            organizationId,
            alias: `team-${alias}`,
            name: `Team ${alias}`,
            ...audit,
          });
          const entrant = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            ...audit,
          });
          return entrant.entrantId;
        };
        const [a, b, c, d] = [
          await register('pa'),
          await register('pb'),
          await register('pc'),
          await register('pd'),
        ] as [string, string, string, string];
        const stage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Copa con puestos',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });
        const zone = await competition.createZone(uow, {
          stageId: stage.stageId,
          number: 1,
          name: 'Copa Unica',
          organizationId,
          ...audit,
        });
        // Two semi-finals, then a final and a third-place game in the same round. Fixtures are
        // matched to the graph by round and position, so the placement game must not take the
        // final's place even though it is created first.
        await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [
            { round: 1, homeEntrantId: a, awayEntrantId: b, zoneId: zone.zoneId },
            { round: 1, homeEntrantId: c, awayEntrantId: d, zoneId: zone.zoneId },
            { round: 2, homeEntrantId: b, awayEntrantId: d, zoneId: zone.zoneId, role: 'place-3' },
            { round: 2, homeEntrantId: a, awayEntrantId: c, zoneId: zone.zoneId },
          ],
          organizationId,
          ...audit,
        });
        return { a, b, c, d };
      });

      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${created.alias}/stages/1/bracket`,
      });
      expect(response.statusCode).toBe(200);
      const zone = response.json().zones[0];
      expect(zone.matches).toHaveLength(4);

      const final = zone.matches.find((m: { matchId: string }) => m.matchId === 'SE-R2-M1');
      expect(final.slots.map((slot: { entrantId: string }) => slot.entrantId)).toEqual([
        entrants.a,
        entrants.c,
      ]);

      const placement = zone.matches.find((m: { role?: string }) => m.role === 'place-3');
      expect(placement).toMatchObject({ bracket: 'placement', round: 2, position: 1 });
      expect(placement.slots.map((slot: { entrantId: string }) => slot.entrantId)).toEqual([
        entrants.b,
        entrants.d,
      ]);
      expect(placement.matchNumber).toEqual(expect.any(Number));
    });

    it('gives every zone a distinct, stage-wide matchNumber that matchReport() resolves back to the same match', async () => {
      const response = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/copa-multizona-bracket/stages/1/bracket`,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const goldZone = body.zones.find((z: { zoneName?: string }) => z.zoneName === 'Copa de Oro');
      const silverZone = body.zones.find(
        (z: { zoneName?: string }) => z.zoneName === 'Copa de Plata',
      );

      // Both zones' terminal round-1/position-1 node would carry the same
      // synthesized number if it were still derived per zone (each zone's
      // own graph restarts at round 1, position 1) — the fix is that the
      // server now attaches a real, stage-wide ordinal instead.
      const goldNumber = goldZone.matches[0].matchNumber;
      const silverNumber = silverZone.matches[0].matchNumber;
      expect(goldNumber).toEqual(expect.any(Number));
      expect(silverNumber).toEqual(expect.any(Number));
      expect(goldNumber).not.toBe(silverNumber);

      const goldEntrantIds = goldZone.matches[0].slots.map(
        (s: { entrantId?: string }) => s.entrantId,
      );
      const silverEntrantIds = silverZone.matches[0].slots.map(
        (s: { entrantId?: string }) => s.entrantId,
      );

      const goldReport = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/copa-multizona-bracket/stages/1/matches/${goldNumber}`,
      });
      expect(goldReport.statusCode).toBe(200);
      const goldReportBody = goldReport.json();
      expect([goldReportBody.homeEntrantId, goldReportBody.awayEntrantId]).toEqual(
        expect.arrayContaining(goldEntrantIds),
      );

      const silverReport = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/copa-multizona-bracket/stages/1/matches/${silverNumber}`,
      });
      expect(silverReport.statusCode).toBe(200);
      const silverReportBody = silverReport.json();
      expect([silverReportBody.homeEntrantId, silverReportBody.awayEntrantId]).toEqual(
        expect.arrayContaining(silverEntrantIds),
      );
    });
  });

  describe('competition context labels and drawn winner projection', () => {
    it('returns stageName, zoneName, groupName, round and winnerEntrantId across report, bracket, overview, matches-view, and live', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-contexto-etiquetas',
          name: 'Copa Contexto Etiquetas',
          descriptor,
          ...audit,
        }),
      );
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );

      const setup = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        const register = async (alias: string): Promise<string> => {
          const team = await enrollments.createTeam(uow, {
            organizationId,
            alias: `ctx-${alias}`,
            name: `Team ${alias}`,
            ...audit,
          });
          const entrant = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            ...audit,
          });
          return entrant.entrantId;
        };
        const [e1, e2, e3, e4] = await Promise.all([
          register('1'),
          register('2'),
          register('3'),
          register('4'),
        ]);

        // Stage 1: Group stage with implicit zone + explicit group "Grupo A"
        const groupStage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Fase de grupos',
          format: 'round-robin',
          organizationId,
          ...audit,
        });
        const implicitZone = await competition.createZone(uow, {
          stageId: groupStage.stageId,
          number: 1,
          name: 'Zona única',
          organizationId,
          ...audit,
        });
        const groupA = await competition.createGroup(uow, {
          zoneId: implicitZone.zoneId,
          number: 1,
          name: 'Grupo A',
          organizationId,
          ...audit,
        });
        const [groupFixture] = await competition.createFixtures(uow, {
          stageId: groupStage.stageId,
          fixtures: [
            {
              round: 1,
              zoneId: implicitZone.zoneId,
              groupId: groupA.groupId,
              homeEntrantId: e1,
              awayEntrantId: e2,
            },
          ],
          organizationId,
          ...audit,
        });
        if (!groupFixture) throw new Error('Expected group fixture');
        const groupMatch = await competition.createMatch(uow, {
          fixtureId: groupFixture.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        await uow.tx
          .updateTable('matches')
          .set({ status: 'in-progress' })
          .where('match_id', '=', groupMatch.matchId)
          .execute();

        // Stage 2: Persisted-graph Cup stage with explicit zone "Copa Oro" and no explicit group
        const cupStage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 2,
          name: 'Copas',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });
        const goldZone = await competition.createZone(uow, {
          stageId: cupStage.stageId,
          number: 1,
          name: 'Copa Oro',
          organizationId,
          ...audit,
        });
        await competition.publishFixturePlans(uow, {
          stageId: cupStage.stageId,
          plans: [
            {
              zoneId: goldZone.zoneId,
              nodes: [
                {
                  nodeKey: 'SE-R1-M1',
                  bracket: 'winners',
                  round: 1,
                  position: 1,
                  sides: [
                    { kind: 'entrant', entrantId: e1, seed: 1 },
                    { kind: 'entrant', entrantId: e2, seed: 2 },
                  ],
                  seriesSpan: 1,
                },
                {
                  nodeKey: 'SE-R1-M2',
                  bracket: 'winners',
                  round: 1,
                  position: 2,
                  sides: [
                    { kind: 'entrant', entrantId: e3, seed: 3 },
                    { kind: 'entrant', entrantId: e4, seed: 4 },
                  ],
                  seriesSpan: 1,
                },
                {
                  nodeKey: 'SE-R2-M1',
                  bracket: 'winners',
                  round: 2,
                  position: 1,
                  sides: [
                    { kind: 'winner-of', matchId: 'SE-R1-M1' },
                    { kind: 'winner-of', matchId: 'SE-R1-M2' },
                  ],
                  seriesSpan: 1,
                },
              ],
            },
          ],
          organizationId,
          ...audit,
        });

        const cupFixtures = await uow.tx
          .selectFrom('fixtures')
          .select(['fixture_id', 'node_key'])
          .where('stage_id', '=', cupStage.stageId)
          .execute();
        const semi1Fixture = cupFixtures.find((f) => f.node_key === 'SE-R1-M1');
        const semi2Fixture = cupFixtures.find((f) => f.node_key === 'SE-R1-M2');
        if (!semi1Fixture || !semi2Fixture) throw new Error('Expected cup fixtures');
        await uow.tx
          .updateTable('fixtures')
          .set({ home_entrant_id: e1, away_entrant_id: e2 })
          .where('fixture_id', '=', semi1Fixture.fixture_id)
          .execute();
        await uow.tx
          .updateTable('fixtures')
          .set({ home_entrant_id: e3, away_entrant_id: e4 })
          .where('fixture_id', '=', semi2Fixture.fixture_id)
          .execute();

        const semi1Match = await uow.tx
          .selectFrom('matches')
          .select('match_id')
          .where('fixture_id', '=', semi1Fixture.fixture_id)
          .executeTakeFirstOrThrow();
        const semi2Match = await uow.tx
          .selectFrom('matches')
          .select('match_id')
          .where('fixture_id', '=', semi2Fixture.fixture_id)
          .executeTakeFirstOrThrow();

        await competition.recordResult(uow, {
          matchId: semi1Match.match_id,
          result: {
            sides: [
              { entrantId: e1, statistics: { goals: 3 } },
              { entrantId: e2, statistics: { goals: 3 } },
            ],
            winnerEntrantId: e2,
            recordedAt: '2026-01-01T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });

        // Non-finalized match carrying an in-progress result must still omit winnerEntrantId.
        await uow.tx
          .updateTable('matches')
          .set({
            status: 'in-progress',
            result: JSON.stringify({
              sides: [
                { entrantId: e3, statistics: { goals: 1 } },
                { entrantId: e4, statistics: { goals: 1 } },
              ],
              winnerEntrantId: e3,
            }),
          })
          .where('match_id', '=', semi2Match.match_id)
          .execute();

        // Stage 3: Generated-graph elimination stage to verify generated bracket winnerEntrantId.
        const genStage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 3,
          name: 'Desempate',
          format: 'single-elimination',
          organizationId,
          ...audit,
        });
        const genZone = await competition.createZone(uow, {
          stageId: genStage.stageId,
          number: 1,
          name: 'Copa Plata',
          organizationId,
          ...audit,
        });
        const [genFix] = await competition.createFixtures(uow, {
          stageId: genStage.stageId,
          fixtures: [{ round: 1, zoneId: genZone.zoneId, homeEntrantId: e1, awayEntrantId: e2 }],
          organizationId,
          ...audit,
        });
        if (!genFix) throw new Error('Expected generated stage fixture');
        const genMatch = await competition.createMatch(uow, {
          fixtureId: genFix.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        await competition.recordResult(uow, {
          matchId: genMatch.matchId,
          result: {
            sides: [
              { entrantId: e1, statistics: { goals: 1 } },
              { entrantId: e2, statistics: { goals: 1 } },
            ],
            winnerEntrantId: e1,
            recordedAt: '2026-01-02T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });

        return { e1, e2, groupMatchId: groupMatch.matchId, semi1MatchId: semi1Match.match_id };
      });

      const root = `/api/organizations/liga-orbital/tournaments/${created.alias}`;
      const [groupReportRes, cupBracketRes, genBracketRes, overviewRes, liveRes, mvRes] =
        await Promise.all([
          request({ method: 'GET', url: `${root}/stages/1/matches/1` }),
          request({ method: 'GET', url: `${root}/stages/2/bracket` }),
          request({ method: 'GET', url: `${root}/stages/3/bracket` }),
          request({ method: 'GET', url: `${root}/overview` }),
          request({ method: 'GET', url: `${root}/live` }),
          request({ method: 'GET', url: `${root}/matches-view` }),
        ]);

      expect(groupReportRes.statusCode).toBe(200);
      const groupReport = groupReportRes.json();
      expect(groupReport.stageName).toBe('Fase de grupos');
      expect(groupReport.groupName).toBe('Grupo A');
      expect(groupReport.zoneName).toBeUndefined();
      expect(groupReport.winnerEntrantId).toBeUndefined();

      expect(cupBracketRes.statusCode).toBe(200);
      const cupBracket = cupBracketRes.json();
      const semi1Node = cupBracket.zones[0].matches.find(
        (m: { matchId: string }) => m.matchId === 'SE-R1-M1',
      );
      const semi2Node = cupBracket.zones[0].matches.find(
        (m: { matchId: string }) => m.matchId === 'SE-R1-M2',
      );
      const finalNode = cupBracket.zones[0].matches.find(
        (m: { matchId: string }) => m.matchId === 'SE-R2-M1',
      );
      expect(semi1Node.winnerEntrantId).toBe(setup.e2);
      expect(semi2Node.winnerEntrantId).toBeUndefined();
      expect(finalNode.winnerEntrantId).toBeUndefined();

      const cupReport1Res = await request({
        method: 'GET',
        url: `${root}/stages/2/matches/${semi1Node.matchNumber}`,
      });
      expect(cupReport1Res.statusCode).toBe(200);
      const cupReport1 = cupReport1Res.json();
      expect(cupReport1.stageName).toBe('Copas');
      expect(cupReport1.zoneName).toBe('Copa Oro');
      expect(cupReport1.groupName).toBeUndefined();
      expect(cupReport1.winnerEntrantId).toBe(setup.e2);

      const cupReport2Res = await request({
        method: 'GET',
        url: `${root}/stages/2/matches/${semi2Node.matchNumber}`,
      });
      expect(cupReport2Res.statusCode).toBe(200);
      expect(cupReport2Res.json().winnerEntrantId).toBeUndefined();

      expect(genBracketRes.statusCode).toBe(200);
      expect(genBracketRes.json().zones[0].matches[0].winnerEntrantId).toBe(setup.e1);

      expect(overviewRes.statusCode).toBe(200);
      const overviewMatches = overviewRes.json().matches as {
        matchId: string;
        stageName?: string;
        zoneName?: string;
        groupName?: string;
      }[];
      expect(overviewMatches.find((m) => m.matchId === setup.groupMatchId)).toMatchObject({
        stageName: 'Fase de grupos',
        groupName: 'Grupo A',
      });
      expect(overviewMatches.find((m) => m.matchId === setup.semi1MatchId)).toMatchObject({
        stageName: 'Copas',
        zoneName: 'Copa Oro',
      });

      expect(liveRes.statusCode).toBe(200);
      const liveMatches = liveRes.json().matches as {
        matchId: string;
        stageName?: string;
        zoneName?: string;
        groupName?: string;
        round?: number;
      }[];
      const liveGroupMatch = liveMatches.find((m) => m.matchId === setup.groupMatchId);
      expect(liveGroupMatch).toMatchObject({
        stageName: 'Fase de grupos',
        groupName: 'Grupo A',
        round: 1,
      });
      expect(liveGroupMatch?.zoneName).toBeUndefined();

      expect(mvRes.statusCode).toBe(200);
      const mvMatches = mvRes.json().matches as {
        matchId: string;
        stageName?: string;
        zoneName?: string;
        groupName?: string;
      }[];
      expect(mvMatches.find((m) => m.matchId === setup.semi1MatchId)).toMatchObject({
        stageName: 'Copas',
        zoneName: 'Copa Oro',
      });
    });
  });

  describe('match report lookup', () => {
    let tournamentAlias: string;
    let groupAId: string;
    let groupBId: string;

    beforeAll(async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);
      const enrollments = new EnrollmentRepository(scratch.db);
      const descriptor = footballDescriptor();
      const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

      const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'copa-numeracion-ambigua',
          name: 'Copa Numeración Ambigua',
          descriptor,
          ...audit,
        }),
      );
      tournamentAlias = created.alias;
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, { tournamentId: created.tournamentId, organizationId, ...audit }),
      );

      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        async function team(alias: string, name: string, abbreviation: string): Promise<string> {
          const club = await enrollments.createClub(uow, {
            organizationId,
            alias: `club-${alias}`,
            name: `Club ${name}`,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });
          const registeredTeam = await enrollments.createTeam(uow, {
            organizationId,
            alias: `team-${alias}`,
            name,
            clubId: club.clubId,
            ...audit,
          });
          const entrant = await enrollments.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            organizationId,
            entrantRef: { kind: 'team', teamId: registeredTeam.teamId },
            abbreviation,
            ...audit,
          });
          return entrant.entrantId;
        }

        const stage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Fase de grupos',
          format: 'round-robin',
          organizationId,
          ...audit,
        });

        const zone = await competition.createZone(uow, {
          stageId: stage.stageId,
          number: 1,
          name: 'Zona única',
          organizationId,
          ...audit,
        });
        const groupA = await competition.createGroup(uow, {
          zoneId: zone.zoneId,
          number: 1,
          name: 'Grupo A',
          organizationId,
          ...audit,
        });
        const groupB = await competition.createGroup(uow, {
          zoneId: zone.zoneId,
          number: 2,
          name: 'Grupo B',
          organizationId,
          ...audit,
        });
        groupAId = groupA.groupId;
        groupBId = groupB.groupId;

        const [a1, a2, a3, b1, b2] = await Promise.all([
          team('amb-a1', 'Ambigua A1', 'AA1'),
          team('amb-a2', 'Ambigua A2', 'AA2'),
          team('amb-a3', 'Ambigua A3', 'AA3'),
          team('amb-b1', 'Ambigua B1', 'AB1'),
          team('amb-b2', 'Ambigua B2', 'AB2'),
        ]);

        // Every fixture here is a single, non-series game — `matches.number`
        // is 1 for every one of them, the exact collision `matchReport()`
        // used to resolve arbitrarily. Two fixtures share Grupo A so the
        // group-filtered matches-view read has more than one row to check.
        await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [
            {
              round: 1,
              homeEntrantId: a1,
              awayEntrantId: a2,
              zoneId: zone.zoneId,
              groupId: groupA.groupId,
            },
            {
              round: 1,
              homeEntrantId: a3,
              awayEntrantId: a1,
              zoneId: zone.zoneId,
              groupId: groupA.groupId,
            },
            {
              round: 1,
              homeEntrantId: b1,
              awayEntrantId: b2,
              zoneId: zone.zoneId,
              groupId: groupB.groupId,
            },
          ],
          organizationId,
          ...audit,
        });
      });
    });

    it('resolves a distinct match for every matchNumber in a stage where every fixture shares matches.number = 1', async () => {
      const seen = new Map<string, { readonly home?: string; readonly away?: string }>();
      for (const matchNumber of [1, 2, 3]) {
        const response = await request({
          method: 'GET',
          url: `/api/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/1/matches/${matchNumber}`,
        });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        seen.set(String(matchNumber), { home: body.homeEntrantId, away: body.awayEntrantId });
      }
      // Three requested ordinals resolved three distinct matches, not the same row repeated.
      const pairs = [...seen.values()].map((v) => `${v.home}:${v.away}`);
      expect(new Set(pairs).size).toBe(3);

      const notFound = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/1/matches/4`,
      });
      expect(notFound.statusCode).toBe(404);
    });

    it('carries on the overview the stage ordinal the public match route addresses each match by', async () => {
      const overview = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${tournamentAlias}/overview`,
      });
      expect(overview.statusCode).toBe(200);
      const body = overview.json() as {
        organizationTimeZone?: string;
        matches: {
          stageNumber: number;
          stageOrdinal?: number;
          homeEntrantId?: string;
          awayEntrantId?: string;
        }[];
      };
      expect(typeof body.organizationTimeZone).toBe('string');

      const stageOne = body.matches.filter((match) => match.stageNumber === 1);
      expect(stageOne.map((match) => match.stageOrdinal).sort()).toEqual([1, 2, 3]);
      for (const match of stageOne) {
        const report = await request({
          method: 'GET',
          url: `/api/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/1/matches/${match.stageOrdinal}`,
        });
        expect(report.statusCode).toBe(200);
        const reported = report.json();
        expect(reported.homeEntrantId).toBe(match.homeEntrantId);
        expect(reported.awayEntrantId).toBe(match.awayEntrantId);
      }
    });

    it('reports the same matchNumber for a match whether the matches-view request is group-filtered or not', async () => {
      const unfiltered = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${tournamentAlias}/matches-view?stageNumber=1`,
      });
      expect(unfiltered.statusCode).toBe(200);
      const unfilteredByMatchId = new Map<string, number>(
        unfiltered
          .json()
          .matches.map((m: { matchId: string; matchNumber: number }) => [m.matchId, m.matchNumber]),
      );

      const filtered = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${tournamentAlias}/matches-view?stageNumber=1&groupId=${groupAId}`,
      });
      expect(filtered.statusCode).toBe(200);
      const filteredMatches = filtered.json().matches as { matchId: string; matchNumber: number }[];
      expect(filteredMatches).toHaveLength(2);
      for (const match of filteredMatches) {
        expect(match.matchNumber).toBe(unfilteredByMatchId.get(match.matchId));
      }

      const otherGroupFiltered = await request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${tournamentAlias}/matches-view?stageNumber=1&groupId=${groupBId}`,
      });
      expect(otherGroupFiltered.statusCode).toBe(200);
      const otherGroupMatches = otherGroupFiltered.json().matches as {
        matchId: string;
        matchNumber: number;
      }[];
      expect(otherGroupMatches).toHaveLength(1);
      for (const match of otherGroupMatches) {
        expect(match.matchNumber).toBe(unfilteredByMatchId.get(match.matchId));
      }

      // No two matches across the whole stage share a matchNumber, group filter or not.
      const allNumbers = [...filteredMatches, ...otherGroupMatches].map((m) => m.matchNumber);
      expect(new Set(allNumbers).size).toBe(allNumbers.length);
    });
  });
});

describe('public privacy read models', () => {
  const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  async function createPrivacyTournament(
    alias: string,
    includesMinors: boolean,
    hideHomePerson = false,
  ) {
    const tournaments = new TournamentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();

    const setup = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: `Privacy ${alias}`,
        descriptor,
        includesMinors,
        ...audit,
      });
      const homePerson = await people.register(uow, {
        organizationId,
        displayName: `Home ${alias}`,
        birthDate: '2010-05-20',
        ...audit,
      });
      const awayPerson = await people.register(uow, {
        organizationId,
        displayName: `Away ${alias}`,
        birthDate: '1995-05-20',
        ...audit,
      });
      await people.setNationality(uow, {
        personId: homePerson.person.personId,
        organizationId,
        nationality: 'AR',
        ...audit,
      });
      const homeEntrant = await enrollments.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: homePerson.person.personId },
        ...audit,
      });
      const awayEntrant = await enrollments.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: awayPerson.person.personId },
        ...audit,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Liga',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: homeEntrant.entrantId,
            awayEntrantId: awayEntrant.entrantId,
          },
        ],
        organizationId,
        ...audit,
      });
      if (!fixture) throw new Error('Privacy fixture was not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: homeEntrant.entrantId, statistics: { goals: 2 } },
            { entrantId: awayEntrant.entrantId, statistics: { goals: 1 } },
          ],
          winnerEntrantId: homeEntrant.entrantId,
          recordedAt: '2026-10-01T12:00:00.000Z',
        },
        organizationId,
        ...audit,
      });
      const knockout = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Eliminatorias',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      const [knockoutFixture] = await competition.createFixtures(uow, {
        stageId: knockout.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: homeEntrant.entrantId,
            awayEntrantId: awayEntrant.entrantId,
          },
        ],
        organizationId,
        ...audit,
      });
      if (!knockoutFixture) throw new Error('Privacy knockout fixture was not created');
      const knockoutMatch = await competition.createMatch(uow, {
        fixtureId: knockoutFixture.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.recordResult(uow, {
        matchId: knockoutMatch.matchId,
        result: {
          sides: [
            { entrantId: homeEntrant.entrantId, statistics: { goals: 2 } },
            { entrantId: awayEntrant.entrantId, statistics: { goals: 1 } },
          ],
          winnerEntrantId: homeEntrant.entrantId,
          recordedAt: '2026-10-02T12:00:00.000Z',
        },
        organizationId,
        ...audit,
      });
      return {
        tournament,
        homePersonId: homePerson.person.personId,
        tournamentId: tournament.tournamentId,
        homeEntrantId: homeEntrant.entrantId,
        matchNumber: match.number,
        knockoutMatchNumber: knockoutMatch.number,
      };
    });
    if (hideHomePerson) {
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        people.setHiddenFromPublic(uow, {
          personId: setup.homePersonId,
          organizationId,
          hiddenFromPublic: true,
          ...audit,
        }),
      );
    }
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.publish(uow, {
        tournamentId: setup.tournamentId,
        organizationId,
        ...audit,
      }),
    );
    return setup;
  }

  it('keeps youth names and match results while removing public profile access', async () => {
    const tournament = await createPrivacyTournament('privacy-youth-public', true);
    const root = `/api/organizations/liga-orbital/tournaments/${tournament.tournament.alias}`;

    const [overview, match, bracket, profile, statistics] = await Promise.all([
      request({ method: 'GET', url: `${root}/overview` }),
      request({ method: 'GET', url: `${root}/stages/1/matches/${tournament.matchNumber}` }),
      request({ method: 'GET', url: `${root}/stages/2/bracket` }),
      request({ method: 'GET', url: `${root}/persons/${tournament.homePersonId}/public/profile` }),
      request({
        method: 'GET',
        url: `${root}/persons/${tournament.homePersonId}/public/statistics?layout=missing`,
      }),
    ]);

    expect(overview.statusCode).toBe(200);
    const overviewBody = JSON.parse(overview.payload as string);
    expect(overviewBody.matches[0]).toMatchObject({
      homeName: 'Home privacy-youth-public',
      homePublicProfileAvailable: false,
      homeScore: 2,
      awayScore: 1,
    });
    expect(overviewBody.standingsPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Home privacy-youth-public',
          publicProfileAvailable: false,
        }),
      ]),
    );
    expect(match.statusCode).toBe(200);
    expect(JSON.parse(match.payload as string)).toMatchObject({
      homeName: 'Home privacy-youth-public',
      homePublicProfileAvailable: false,
      homeScore: 2,
      awayScore: 1,
    });
    expect(bracket.statusCode).toBe(200);
    expect(JSON.stringify(bracket.json())).toContain('Home privacy-youth-public');
    expect(bracket.json().zones[0].matches[0].slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrantId: tournament.homeEntrantId,
          name: 'Home privacy-youth-public',
          publicProfileAvailable: false,
        }),
      ]),
    );
    expect(profile.statusCode).toBe(404);
    expect(statistics.statusCode).toBe(404);
  });

  it('replaces an opted-out adult identity without changing results and 404s profile routes', async () => {
    const tournament = await createPrivacyTournament('privacy-adult-opt-out', false, true);
    const root = `/api/organizations/liga-orbital/tournaments/${tournament.tournament.alias}`;

    const [overview, match, bracket, profile, statistics] = await Promise.all([
      request({ method: 'GET', url: `${root}/overview` }),
      request({ method: 'GET', url: `${root}/stages/1/matches/${tournament.matchNumber}` }),
      request({ method: 'GET', url: `${root}/stages/2/bracket` }),
      request({ method: 'GET', url: `${root}/persons/${tournament.homePersonId}/public/profile` }),
      request({
        method: 'GET',
        url: `${root}/persons/${tournament.homePersonId}/public/statistics?layout=missing`,
      }),
    ]);

    expect(overview.statusCode).toBe(200);
    const overviewBody = JSON.parse(overview.payload as string);
    expect(overviewBody.matches[0]).toMatchObject({
      homeHiddenAtRequest: true,
      homePublicProfileAvailable: false,
      homeScore: 2,
      awayScore: 1,
    });
    expect(overviewBody.matches[0].homeName).toBeUndefined();
    expect(JSON.stringify(overviewBody)).not.toContain('Home privacy-adult-opt-out');
    expect(match.statusCode).toBe(200);
    expect(JSON.parse(match.payload as string)).toMatchObject({
      homeHiddenAtRequest: true,
      homeScore: 2,
      awayScore: 1,
    });
    expect(bracket.statusCode).toBe(200);
    expect(JSON.stringify(bracket.json())).not.toContain('Home privacy-adult-opt-out');
    expect(bracket.json().zones[0].matches[0].slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrantId: tournament.homeEntrantId,
          hiddenAtRequest: true,
          publicProfileAvailable: false,
        }),
      ]),
    );
    expect(profile.statusCode).toBe(404);
    expect(statistics.statusCode).toBe(404);
  });

  it('excludes protected youth tournaments from a public adult career without inferring age', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const statistics = new StatisticRepository(scratch.db);
    const descriptor = footballDescriptor();

    const setup = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const adult = await tournaments.create(uow, {
        organizationId,
        alias: 'privacy-career-adult',
        name: 'Privacy Career Adult',
        descriptor,
        ...audit,
      });
      const youth = await tournaments.create(uow, {
        organizationId,
        alias: 'privacy-career-youth',
        name: 'Privacy Career Youth',
        descriptor,
        includesMinors: true,
        ...audit,
      });
      const { person } = await people.register(uow, {
        organizationId,
        displayName: 'Career Example',
        birthDate: '2010-05-20',
        ...audit,
      });
      const team = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Club Carrera',
        ...audit,
      });
      await people.enlist(uow, {
        personId: person.personId,
        teamId: team.teamId,
        role: 'player',
        organizationId,
        ...audit,
      });

      const matchIds: string[] = [];
      for (const [tournament, goals] of [
        [adult, 3],
        [youth, 99],
      ] as const) {
        const homeEntrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...audit,
        });
        const opponent = await enrollment.createTeam(uow, {
          organizationId,
          name: `Rival ${tournament.alias}`,
          ...audit,
        });
        const awayEntrant = await enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: opponent.teamId },
          ...audit,
        });
        const stage = await competition.createStageInTournament(uow, {
          tournamentId: tournament.tournamentId,
          number: 1,
          name: 'Liga',
          format: 'round-robin',
          organizationId,
          ...audit,
        });
        const [fixture] = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [
            {
              round: 1,
              homeEntrantId: homeEntrant.entrantId,
              awayEntrantId: awayEntrant.entrantId,
            },
          ],
          organizationId,
          ...audit,
        });
        if (!fixture) throw new Error('Career fixture was not created');
        const match = await competition.createMatch(uow, {
          fixtureId: fixture.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        matchIds.push(match.matchId);
        await statistics.projectMatch(uow, {
          organizationId,
          matchId: match.matchId,
          projectionVersion: 1,
          figures: [
            {
              collectorCode: 'career-goals',
              actorGranularity: 'person',
              actorId: person.personId,
              competitionGranularity: 'match',
              competitionId: match.matchId,
              value: goals,
              samples: 1,
            },
          ],
        });
      }
      return { adult, youth, personId: person.personId, matchIds };
    });

    for (const tournament of [setup.adult, setup.youth]) {
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.publish(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          ...audit,
        }),
      );
    }

    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${setup.adult.alias}/persons/${setup.personId}/public/profile`,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string);
    expect(
      body.competitionHistory.map((entry: { tournamentAlias: string }) => entry.tournamentAlias),
    ).toEqual([setup.adult.alias]);
    expect(body.careerStatistics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statistics: expect.arrayContaining([
            expect.objectContaining({ code: 'career-goals', value: 3, samples: 1 }),
          ]),
        }),
      ]),
    );
    expect(JSON.stringify(body.careerStatistics)).not.toContain('99');
    const protectedProfile = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${setup.youth.alias}/persons/${setup.personId}/public/profile`,
    });
    expect(protectedProfile.statusCode).toBe(404);
    expect(String(protectedProfile.headers['cache-control'] ?? '')).not.toContain('public');
  });
});

describe('overview standings of a mixed-format stage', () => {
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  async function publishedTournamentWith(
    alias: string,
    zones: readonly { readonly name: string; readonly format?: 'swiss' | 'single-elimination' }[],
  ) {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();
    const tournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const created = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: created.tournamentId,
        number: 1,
        name: 'Fase',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const declared = [];
      for (const [index, zone] of zones.entries()) {
        declared.push(
          await competition.createZone(uow, {
            stageId: stage.stageId,
            number: index + 1,
            name: zone.name,
            ...(zone.format === undefined ? {} : { format: zone.format }),
            organizationId,
            ...AUDIT,
          }),
        );
      }
      const fixtures = [];
      for (const [index, zone] of declared.entries()) {
        const entrantIds: string[] = [];
        for (const side of ['uno', 'dos']) {
          const team = await enrollment.createTeam(uow, {
            organizationId,
            name: `${alias} ${index} ${side}`,
            ...AUDIT,
          });
          const entrant = await enrollment.registerEntrant(uow, {
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            organizationId,
            ...AUDIT,
          });
          entrantIds.push(entrant.entrantId);
        }
        fixtures.push({
          round: 1,
          zoneId: zone.zoneId,
          homeEntrantId: entrantIds[0] as string,
          awayEntrantId: entrantIds[1] as string,
        });
      }
      const persisted = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures,
        organizationId,
        ...AUDIT,
      });
      for (const [index, fixture] of persisted.entries()) {
        const match = await competition.createMatch(uow, {
          fixtureId: fixture.fixtureId,
          number: index + 1,
          organizationId,
          ...AUDIT,
        });
        await competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [
              { entrantId: fixture.homeEntrantId as string, statistics: { points: 3, played: 1 } },
              { entrantId: fixture.awayEntrantId as string, statistics: { points: 0, played: 1 } },
            ],
            winnerEntrantId: fixture.homeEntrantId as string,
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT,
        });
      }
      return created;
    });
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.publish(uow, { tournamentId: tournament.tournamentId, organizationId, ...AUDIT }),
    );
  }

  const overviewStandings = async (alias: string) => {
    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${alias}/overview`,
    });
    expect(response.statusCode).toBe(200);
    return JSON.parse(response.payload as string).standingsPreview as {
      name: string;
      zoneName?: string;
    }[];
  };

  it('names the zone of every row, in zone order, and leaves a knockout zone out', async () => {
    await publishedTournamentWith('overview-mixed', [
      { name: 'Liga A' },
      { name: 'Liga B', format: 'swiss' },
      { name: 'Copa', format: 'single-elimination' },
    ]);

    const rows = await overviewStandings('overview-mixed');

    expect(rows.map((row) => row.zoneName)).toEqual(['Liga A', 'Liga A', 'Liga B', 'Liga B']);
    expect(rows.map((row) => row.name).join(' ')).not.toContain('overview-mixed 2');
  });

  it('carries no zone on the rows of a stage whose zones all play its own format', async () => {
    await publishedTournamentWith('overview-uniform', [{ name: 'Zona A' }, { name: 'Zona B' }]);

    const rows = await overviewStandings('overview-uniform');

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.zoneName === undefined)).toBe(true);
  });
});

describe('live match clock and organization liveMatches projections', () => {
  it('returns matching clock on /live and /matches-view for timed segments, none for untimed, and liveMatches on organization listing', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const db = scratch.db as Kysely<Database>;

    const football = footballDescriptor();
    const tennis = tennisDescriptor({ descriptorId: newId() });

    const [liveTournament, untimedTournament] = await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, tennis, { organizationId, ...audit });
      const t1 = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-clock-timed',
        name: 'Copa Clock Timed',
        descriptor: football,
        ...audit,
      });
      const t2 = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-clock-untimed',
        name: 'Copa Clock Untimed',
        descriptor: tennis,
        ...audit,
      });
      return [t1, t2] as const;
    });

    await withTransaction(db, async (uow) => {
      await tournaments.publish(uow, {
        tournamentId: liveTournament.tournamentId,
        organizationId,
        ...audit,
      });
      await tournaments.publish(uow, {
        tournamentId: untimedTournament.tournamentId,
        organizationId,
        ...audit,
      });
    });

    const { timedMatchId, untimedMatchId } = await withTransaction(db, async (uow) => {
      const homeTeam = await enrollments.createTeam(uow, {
        organizationId,
        alias: 'clock-home',
        name: 'Clock Home',
        ...audit,
      });
      const awayTeam = await enrollments.createTeam(uow, {
        organizationId,
        alias: 'clock-away',
        name: 'Clock Away',
        ...audit,
      });
      const homeEntrant = await enrollments.registerEntrant(uow, {
        tournamentId: liveTournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: homeTeam.teamId },
        ...audit,
      });
      const awayEntrant = await enrollments.registerEntrant(uow, {
        tournamentId: liveTournament.tournamentId,
        organizationId,
        entrantRef: { kind: 'team', teamId: awayTeam.teamId },
        ...audit,
      });

      const timedStage = await competition.createStageInTournament(uow, {
        tournamentId: liveTournament.tournamentId,
        number: 1,
        name: 'Timed stage',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      const [timedFixture] = await competition.createFixtures(uow, {
        stageId: timedStage.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: homeEntrant.entrantId,
            awayEntrantId: awayEntrant.entrantId,
          },
        ],
        organizationId,
        ...audit,
      });
      if (!timedFixture) throw new Error('Expected timed fixture');
      const timedMatch = await competition.createMatch(uow, {
        fixtureId: timedFixture.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId: timedMatch.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
      await uow.tx
        .updateTable('matches')
        .set({
          result: JSON.stringify({
            sides: [
              { entrantId: homeEntrant.entrantId, statistics: { goals: 2 } },
              { entrantId: awayEntrant.entrantId, statistics: { goals: 1 } },
            ],
          }),
        })
        .where('match_id', '=', timedMatch.matchId)
        .execute();
      const timedSegment = await competition.createSegment(uow, {
        matchId: timedMatch.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: timedSegment.segmentId,
        state: 'active',
        organizationId,
        ...audit,
      });
      await competition.adjustSegmentClock(uow, {
        segmentId: timedSegment.segmentId,
        elapsedSeconds: 585,
        organizationId,
        ...audit,
      });

      const untimedStage = await competition.createStageInTournament(uow, {
        tournamentId: untimedTournament.tournamentId,
        number: 1,
        name: 'Untimed stage',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      const [untimedFixture] = await competition.createFixtures(uow, {
        stageId: untimedStage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...audit,
      });
      if (!untimedFixture) throw new Error('Expected untimed fixture');
      const untimedMatch = await competition.createMatch(uow, {
        fixtureId: untimedFixture.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId: untimedMatch.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
      const untimedSegment = await competition.createSegment(uow, {
        matchId: untimedMatch.matchId,
        type: 'set',
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: untimedSegment.segmentId,
        state: 'active',
        organizationId,
        ...audit,
      });

      return { timedMatchId: timedMatch.matchId, untimedMatchId: untimedMatch.matchId };
    });

    const [liveTimedRes, mvTimedRes] = await Promise.all([
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${liveTournament.alias}/live`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${liveTournament.alias}/matches-view`,
      }),
    ]);
    expect(liveTimedRes.statusCode).toBe(200);
    expect(mvTimedRes.statusCode).toBe(200);

    const liveTimedMatch = JSON.parse(liveTimedRes.payload as string).matches.find(
      (m: { matchId: string }) => m.matchId === timedMatchId,
    );
    const mvTimedMatch = JSON.parse(mvTimedRes.payload as string).matches.find(
      (m: { matchId: string }) => m.matchId === timedMatchId,
    );

    expect(liveTimedMatch.clock).toMatchObject({
      segmentNumber: 1,
      running: true,
    });
    expect(liveTimedMatch.clock.elapsedSeconds).toBeGreaterThanOrEqual(585);
    expect(Date.parse(liveTimedMatch.clock.asOf)).not.toBeNaN();
    expect(mvTimedMatch.clock).toMatchObject({
      segmentNumber: 1,
      running: true,
    });
    expect(mvTimedMatch.clock.elapsedSeconds).toBeGreaterThanOrEqual(585);
    expect(mvTimedMatch.clockSeconds).toBe(mvTimedMatch.clock.elapsedSeconds);
    expect(mvTimedMatch.segments).toEqual([
      expect.objectContaining({
        number: 1,
        type: 'half',
        timed: true,
        state: 'active',
        label: expect.objectContaining({ en: 'Half' }),
      }),
    ]);

    const [liveUntimedRes, mvUntimedRes, timedReportRes, untimedReportRes] = await Promise.all([
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${untimedTournament.alias}/live`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${untimedTournament.alias}/matches-view`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${liveTournament.alias}/stages/1/matches/1`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${untimedTournament.alias}/stages/1/matches/1`,
      }),
    ]);
    expect(liveUntimedRes.statusCode).toBe(200);
    expect(mvUntimedRes.statusCode).toBe(200);
    expect(timedReportRes.statusCode).toBe(200);
    expect(untimedReportRes.statusCode).toBe(200);

    const timedReport = JSON.parse(timedReportRes.payload as string);
    expect(timedReport.clock).toMatchObject({ segmentNumber: 1, running: true });
    expect(timedReport.clock.elapsedSeconds).toBeGreaterThanOrEqual(585);
    expect(Date.parse(timedReport.clock.asOf)).not.toBeNaN();

    const untimedReport = JSON.parse(untimedReportRes.payload as string);
    expect(untimedReport.clock).toBeUndefined();

    const liveUntimedMatch = JSON.parse(liveUntimedRes.payload as string).matches.find(
      (m: { matchId: string }) => m.matchId === untimedMatchId,
    );
    const mvUntimedMatch = JSON.parse(mvUntimedRes.payload as string).matches.find(
      (m: { matchId: string }) => m.matchId === untimedMatchId,
    );
    expect(liveUntimedMatch.clock).toBeUndefined();
    expect(mvUntimedMatch.clock).toBeUndefined();
    expect(mvUntimedMatch.clockSeconds).toBeUndefined();

    const listingRes = await request({
      method: 'GET',
      url: '/api/organizations/liga-orbital/public/tournaments',
    });
    expect(listingRes.statusCode).toBe(200);
    const listingBody = JSON.parse(listingRes.payload as string) as {
      tournaments: {
        alias: string;
        status: string;
        liveMatches: {
          matchId: string;
          stageNumber: number;
          matchNumber: number;
          home: string;
          away: string;
          homeScore: number;
          awayScore: number;
        }[];
      }[];
    };
    const timedListing = listingBody.tournaments.find((t) => t.alias === liveTournament.alias);
    expect(timedListing?.liveMatches).toEqual([
      {
        matchId: timedMatchId,
        stageNumber: 1,
        stageName: 'Timed stage',
        matchNumber: 1,
        home: 'Clock Home',
        away: 'Clock Away',
        homeScore: 2,
        awayScore: 1,
      },
    ]);

    const nonLiveListing = listingBody.tournaments.find((t) => t.alias === 'copa-upcoming-clean');
    expect(nonLiveListing?.liveMatches).toEqual([]);
  });
});

describe('localized deciding factor, event kinds, and listing discipline name', () => {
  it('scopes decidingFactorCode/Rule to the match pair, includes event definitionCode/labels, and exposes discipline.localizedName', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const db = scratch.db as Kysely<Database>;

    const base = footballDescriptor({
      descriptorId: newId(),
      alias: 'rink-hockey-deciding-factor',
      name: { en: 'Rink Hockey', es: 'Hockey sobre patines' },
    });
    const descriptor = {
      ...base,
      eventDefinitions: base.eventDefinitions.map((def) =>
        def.code === 'goal' ? { ...def, label: { en: 'Goal', es: 'Gol' } } : def,
      ),
      defaults: {
        ...base.defaults,
        tiebreakers: [
          'points',
          {
            statisticCode: 'goal-average',
            label: { en: 'Goal Average', es: 'Promedio de goles' },
            ratio: {
              numerator: 'goals-for',
              denominator: 'goals-against',
              zeroDenominator: 'numerator-only',
            },
          },
        ],
      },
    };

    const { tournament, matchABId, matchACId, matchBCId } = await withTransaction(
      db,
      async (uow) => {
        await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
        const created = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-deciding-factor-localized',
          name: 'Copa Deciding Factor Localized',
          descriptor,
          ...audit,
        });

        const [teamA, teamB, teamC] = await Promise.all([
          enrollments.createTeam(uow, { organizationId, name: 'Team Alpha', ...audit }),
          enrollments.createTeam(uow, { organizationId, name: 'Team Beta', ...audit }),
          enrollments.createTeam(uow, { organizationId, name: 'Team Gamma', ...audit }),
        ]);
        const [entrantA, entrantB, entrantC] = await Promise.all([
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: teamA.teamId },
            ...audit,
          }),
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: teamB.teamId },
            ...audit,
          }),
          enrollments.registerEntrant(uow, {
            organizationId,
            tournamentId: created.tournamentId,
            entrantRef: { kind: 'team', teamId: teamC.teamId },
            ...audit,
          }),
        ]);

        const stage = await competition.createStageInTournament(uow, {
          tournamentId: created.tournamentId,
          number: 1,
          name: 'Grupo 1',
          format: 'round-robin',
          organizationId,
          ...audit,
        });

        const [fixtureAC, fixtureBC, fixtureAB] = await competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [
            { round: 1, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantC.entrantId },
            { round: 2, homeEntrantId: entrantB.entrantId, awayEntrantId: entrantC.entrantId },
            { round: 3, homeEntrantId: entrantA.entrantId, awayEntrantId: entrantB.entrantId },
          ],
          organizationId,
          ...audit,
        });
        if (!fixtureAC || !fixtureBC || !fixtureAB) throw new Error('Expected three fixtures');

        const matchAC = await competition.createMatch(uow, {
          fixtureId: fixtureAC.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        const matchBC = await competition.createMatch(uow, {
          fixtureId: fixtureBC.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        const matchAB = await competition.createMatch(uow, {
          fixtureId: fixtureAB.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });

        // A beats C 3-1, B beats C 2-1, A draws B 0-0 -> A and B tie on 4 pts (separated by goal-average 3.0 vs 2.0), C has 0 pts.
        await competition.recordResult(uow, {
          matchId: matchAC.matchId,
          result: {
            sides: [
              {
                entrantId: entrantA.entrantId,
                statistics: { points: 3, 'goals-for': 3, 'goals-against': 1, played: 1, score: 3 },
              },
              {
                entrantId: entrantC.entrantId,
                statistics: { points: 0, 'goals-for': 1, 'goals-against': 3, played: 1, score: 1 },
              },
            ],
            winnerEntrantId: entrantA.entrantId,
            recordedAt: '2026-09-01T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });
        await competition.recordResult(uow, {
          matchId: matchBC.matchId,
          result: {
            sides: [
              {
                entrantId: entrantB.entrantId,
                statistics: { points: 3, 'goals-for': 2, 'goals-against': 1, played: 1, score: 2 },
              },
              {
                entrantId: entrantC.entrantId,
                statistics: { points: 0, 'goals-for': 1, 'goals-against': 2, played: 1, score: 1 },
              },
            ],
            winnerEntrantId: entrantB.entrantId,
            recordedAt: '2026-09-02T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });
        await competition.recordResult(uow, {
          matchId: matchAB.matchId,
          result: {
            sides: [
              {
                entrantId: entrantA.entrantId,
                statistics: { points: 1, 'goals-for': 0, 'goals-against': 0, played: 1, score: 0 },
              },
              {
                entrantId: entrantB.entrantId,
                statistics: { points: 1, 'goals-for': 0, 'goals-against': 0, played: 1, score: 0 },
              },
            ],
            recordedAt: '2026-09-03T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });

        const segment = await competition.createSegment(uow, {
          matchId: matchAC.matchId,
          type: 'half',
          number: 1,
          organizationId,
          ...audit,
        });
        await competition.appendEvent(uow, {
          event: {
            eventId: newId(),
            matchId: matchAC.matchId,
            segmentId: segment.segmentId,
            definitionCode: 'goal',
            occurredAt: '2026-09-01T11:15:00.000Z',
            side: entrantA.entrantId,
            payload: {},
          },
          sequence: 1,
          organizationId,
          ...audit,
        });

        return {
          tournament: created,
          matchABId: matchAB.matchId,
          matchACId: matchAC.matchId,
          matchBCId: matchBC.matchId,
        };
      },
    );

    await withTransaction(db, (uow) =>
      tournaments.publish(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        ...audit,
      }),
    );

    const [mvRes, listingRes] = await Promise.all([
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${tournament.alias}/matches-view`,
      }),
      request({
        method: 'GET',
        url: '/api/organizations/liga-orbital/public/tournaments',
      }),
    ]);

    expect(mvRes.statusCode).toBe(200);
    const mvBody = JSON.parse(mvRes.payload as string) as {
      matches: {
        matchId: string;
        decidingFactor?: string;
        decidingFactorCode?: string;
        decidingFactorRule?: number;
        latestEvent?: {
          definitionCode: string;
          label: string;
          labels?: Record<string, string>;
        };
      }[];
    };

    expect(mvBody.matches).toHaveLength(3);
    const matchAB = mvBody.matches.find((m) => m.matchId === matchABId);
    const matchAC = mvBody.matches.find((m) => m.matchId === matchACId);
    const matchBC = mvBody.matches.find((m) => m.matchId === matchBCId);

    // Pair separated by goal-average tiebreak carries code, rule, and deprecated string
    expect(matchAB).toMatchObject({
      decidingFactorCode: 'goal-average',
      decidingFactorRule: 2,
      decidingFactor: 'Rule 2 (Goal Average)',
    });

    // Pairs separated by points alone carry no deciding factor fields
    expect(matchAC?.decidingFactorCode).toBeUndefined();
    expect(matchAC?.decidingFactorRule).toBeUndefined();
    expect(matchAC?.decidingFactor).toBeUndefined();
    expect(matchBC?.decidingFactorCode).toBeUndefined();
    expect(matchBC?.decidingFactorRule).toBeUndefined();
    expect(matchBC?.decidingFactor).toBeUndefined();

    // latestEvent carries definitionCode and localized labels
    expect(matchAC?.latestEvent).toMatchObject({
      definitionCode: 'goal',
      label: 'Goal',
      labels: { en: 'Goal', es: 'Gol' },
    });

    // Organization tournament listing carries discipline.localizedName
    expect(listingRes.statusCode).toBe(200);
    const listingBody = JSON.parse(listingRes.payload as string) as {
      tournaments: {
        alias: string;
        discipline: {
          name?: string;
          localizedName?: Record<string, string>;
        };
      }[];
    };
    const listed = listingBody.tournaments.find((t) => t.alias === tournament.alias);
    expect(listed?.discipline.name).toBe('Rink Hockey');
    expect(listed?.discipline.localizedName).toEqual({
      en: 'Rink Hockey',
      es: 'Hockey sobre patines',
    });
  });
});

describe('overview table-projection preview, listing progress/schedule/venueCount, and banded bracket offsets', () => {
  it('serves overview standingsPreview from group-phase table projection with groupName, group-relative ranks, stages[], and banded bracket overallPlaceOffset', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const db = scratch.db as Kysely<Database>;

    const base = footballDescriptor({
      descriptorId: newId(),
      alias: 'football-group-standings-overview',
    });
    const descriptor = {
      ...base,
      collectors: (base.collectors ?? []).filter((c) => c.code !== 'goals-for'),
      tableLayouts: [
        {
          code: 'group-standings-default',
          target: 'group-phase' as const,
          label: { en: 'Group Standings', es: 'Tabla de Posiciones' },
          entityGranularity: 'team' as const,
          defaultSort: [
            { columnCode: 'points', direction: 'desc' as const },
            { columnCode: 'gd', direction: 'desc' as const },
          ],
          columns: [
            {
              code: 'rank',
              header: { en: '#' },
              source: { kind: 'rank' as const },
              format: 'number' as const,
            },
            {
              code: 'name',
              header: { en: 'Team' },
              source: { kind: 'entrant-name' as const },
              format: 'text' as const,
            },
            {
              code: 'played',
              header: { en: 'P' },
              source: { kind: 'collector' as const, code: 'played' },
              format: 'number' as const,
            },
            {
              code: 'gf',
              header: { en: 'GF' },
              source: { kind: 'collector' as const, code: 'goals-for' },
              format: 'number' as const,
            },
            {
              code: 'ga',
              header: { en: 'GA' },
              source: { kind: 'collector' as const, code: 'goals-against' },
              format: 'number' as const,
            },
            {
              code: 'gd',
              header: { en: 'GD' },
              source: { kind: 'computed' as const, expression: 'gf - ga' },
              format: 'number' as const,
            },
            {
              code: 'points',
              header: { en: 'Pts' },
              source: { kind: 'collector' as const, code: 'points' },
              format: 'number' as const,
            },
          ],
        },
        ...(base.tableLayouts ?? []),
      ],
    };

    const alias = 'copa-overview-table-projection';
    const { tournamentId, groupAIds } = await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const created = await tournaments.create(uow, {
        organizationId,
        alias,
        name: 'Copa Overview Table Projection',
        descriptor,
        ...audit,
      });

      const registerTeam = async (name: string) => {
        const team = await enrollments.createTeam(uow, { organizationId, name, ...audit });
        const entrant = await enrollments.registerEntrant(uow, {
          organizationId,
          tournamentId: created.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...audit,
        });
        return entrant.entrantId;
      };

      const a2 = await registerTeam('Grupo A Second GD');
      const a1 = await registerTeam('Grupo A Leader GD');
      const a3 = await registerTeam('Grupo A Third');
      const b1 = await registerTeam('Grupo B First');
      const b2 = await registerTeam('Grupo B Second');

      const stage1 = await competition.createStageInTournament(uow, {
        tournamentId: created.tournamentId,
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const stage1Zone = await competition.createZone(uow, {
        stageId: stage1.stageId,
        number: 1,
        name: 'Grupos',
        organizationId,
        ...audit,
      });
      const groupA = await competition.createGroup(uow, {
        zoneId: stage1Zone.zoneId,
        number: 1,
        name: 'Grupo A',
        organizationId,
        ...audit,
      });
      const groupB = await competition.createGroup(uow, {
        zoneId: stage1Zone.zoneId,
        number: 2,
        name: 'Grupo B',
        organizationId,
        ...audit,
      });
      // Additional empty groups so 6 groups × 4 qualifiers = 24 entrants across 3 cup bands of 8.
      for (const [number, name] of [
        [3, 'Grupo C'],
        [4, 'Grupo D'],
        [5, 'Grupo E'],
        [6, 'Grupo F'],
      ] as const) {
        await competition.createGroup(uow, {
          zoneId: stage1Zone.zoneId,
          number,
          name,
          organizationId,
          ...audit,
        });
      }

      const stage2 = await competition.createStageInTournament(uow, {
        tournamentId: created.tournamentId,
        number: 2,
        name: 'Copas',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      for (const [number, name] of [
        [1, 'Copa Oro'],
        [2, 'Copa Plata'],
        [3, 'Copa Bronce'],
      ] as const) {
        await competition.createZone(uow, {
          stageId: stage2.stageId,
          number,
          name,
          organizationId,
          ...audit,
        });
      }

      await competition.createPromotionPlan(uow, {
        zoneId: stage1Zone.zoneId,
        nextStageId: stage2.stageId,
        plan: {
          perGroupAdvance: 4,
          combination: { mode: 'ranked', pipeline: { rules: ['points', 'score-difference'] } },
          bands: [
            { zoneRef: 'Copa Oro', count: 8 },
            { zoneRef: 'Copa Plata', count: 8 },
            { zoneRef: 'Copa Bronce', count: 8 },
          ],
        },
        organizationId,
        ...audit,
      });

      const fixtures = await competition.createFixtures(uow, {
        stageId: stage1.stageId,
        fixtures: [
          {
            round: 1,
            zoneId: stage1Zone.zoneId,
            groupId: groupA.groupId,
            homeEntrantId: a1,
            awayEntrantId: a3,
          },
          {
            round: 2,
            zoneId: stage1Zone.zoneId,
            groupId: groupA.groupId,
            homeEntrantId: a2,
            awayEntrantId: a3,
          },
          {
            round: 3,
            zoneId: stage1Zone.zoneId,
            groupId: groupA.groupId,
            homeEntrantId: a1,
            awayEntrantId: a2,
          },
          {
            round: 1,
            zoneId: stage1Zone.zoneId,
            groupId: groupB.groupId,
            homeEntrantId: b1,
            awayEntrantId: b2,
          },
        ],
        organizationId,
        ...audit,
      });

      const recordMatch = async (
        fixture: (typeof fixtures)[number],
        homeStats: Record<string, number>,
        awayStats: Record<string, number>,
        winnerEntrantId?: string,
      ) => {
        const match = await competition.createMatch(uow, {
          fixtureId: fixture.fixtureId,
          number: 1,
          organizationId,
          ...audit,
        });
        await competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [
              { entrantId: fixture.homeEntrantId as string, statistics: homeStats },
              { entrantId: fixture.awayEntrantId as string, statistics: awayStats },
            ],
            ...(winnerEntrantId === undefined ? {} : { winnerEntrantId }),
            recordedAt: '2026-10-01T12:00:00.000Z',
          },
          organizationId,
          ...audit,
        });
      };

      const [fx0, fx1, fx2, fx3] = fixtures;
      if (!fx0 || !fx1 || !fx2 || !fx3) throw new Error('Expected four fixtures');

      // A1 and A2 finish level on 4 points, separated by goal difference (+3 vs +1).
      await recordMatch(
        fx0,
        { points: 3, 'goals-for': 3, 'goals-against': 0, played: 1, score: 3 },
        { points: 0, 'goals-for': 0, 'goals-against': 3, played: 1, score: 0 },
        a1,
      );
      await recordMatch(
        fx1,
        { points: 3, 'goals-for': 2, 'goals-against': 1, played: 1, score: 2 },
        { points: 0, 'goals-for': 1, 'goals-against': 2, played: 1, score: 1 },
        a2,
      );
      await recordMatch(
        fx2,
        { points: 1, 'goals-for': 0, 'goals-against': 0, played: 1, score: 0 },
        { points: 1, 'goals-for': 0, 'goals-against': 0, played: 1, score: 0 },
      );
      await recordMatch(
        fx3,
        { points: 3, 'goals-for': 1, 'goals-against': 0, played: 1, score: 1 },
        { points: 0, 'goals-for': 0, 'goals-against': 1, played: 1, score: 0 },
        b1,
      );

      return { tournamentId: created.tournamentId, groupAIds: [a1, a2, a3] };
    });

    await withTransaction(db, (uow) =>
      tournaments.publish(uow, {
        tournamentId,
        organizationId,
        ...audit,
      }),
    );

    const [overviewRes, tableRes, bracketRes] = await Promise.all([
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${alias}/overview`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${alias}/stages/1/public/tables/group-standings-default`,
      }),
      request({
        method: 'GET',
        url: `/api/organizations/liga-orbital/tournaments/${alias}/stages/2/bracket`,
      }),
    ]);

    expect(overviewRes.statusCode).toBe(200);
    expect(tableRes.statusCode).toBe(200);
    expect(bracketRes.statusCode).toBe(200);

    const overview = JSON.parse(overviewRes.payload as string) as {
      standingsStageNumber?: number;
      standingsSource?: string;
      stages?: {
        stageNumber: number;
        stageName?: string;
        format: string;
        zones?: { zoneName?: string; format: string }[];
      }[];
      standingsPreview?: {
        rank: number;
        entrantId: string;
        groupName?: string;
        statistics: Record<string, number>;
      }[];
    };
    const table = JSON.parse(tableRes.payload as string) as {
      segments: { groupName?: string; rows: { rank: number; entrantId?: string }[] }[];
    };

    expect(overview.standingsStageNumber).toBe(1);
    expect(overview.standingsSource).toBe('table-projection');
    expect(overview.stages).toEqual([
      {
        stageNumber: 1,
        stageName: 'Fase de grupos',
        format: 'round-robin',
        zones: [{ zoneName: 'Grupos', format: 'round-robin' }],
      },
      {
        stageNumber: 2,
        stageName: 'Copas',
        format: 'single-elimination',
        zones: [
          { zoneName: 'Copa Oro', format: 'single-elimination' },
          { zoneName: 'Copa Plata', format: 'single-elimination' },
          { zoneName: 'Copa Bronce', format: 'single-elimination' },
        ],
      },
    ]);

    const previewGrupoA = (overview.standingsPreview ?? []).filter(
      (r) => r.groupName === 'Grupo A',
    );
    const previewGrupoB = (overview.standingsPreview ?? []).filter(
      (r) => r.groupName === 'Grupo B',
    );
    const tableGrupoA = table.segments.find((s) => s.groupName === 'Grupo A')?.rows ?? [];
    const tableGrupoB = table.segments.find((s) => s.groupName === 'Grupo B')?.rows ?? [];

    expect(previewGrupoA.map((r) => ({ entrantId: r.entrantId, rank: r.rank }))).toEqual(
      tableGrupoA.map((r) => ({ entrantId: r.entrantId, rank: r.rank })),
    );
    expect(previewGrupoA.map((r) => r.entrantId)).toEqual(groupAIds);
    expect(previewGrupoA[0]?.statistics.points).toBe(4);
    expect(previewGrupoA[0]?.statistics.gd).toBe(3);
    expect(previewGrupoB.map((r) => ({ entrantId: r.entrantId, rank: r.rank }))).toEqual(
      tableGrupoB.map((r) => ({ entrantId: r.entrantId, rank: r.rank })),
    );

    const bracket = JSON.parse(bracketRes.payload as string) as {
      zones: { zoneName?: string; overallPlaceOffset?: number }[];
    };
    expect(
      bracket.zones.map((z) => ({
        zoneName: z.zoneName,
        overallPlaceOffset: z.overallPlaceOffset,
      })),
    ).toEqual([
      { zoneName: 'Copa Oro', overallPlaceOffset: 0 },
      { zoneName: 'Copa Plata', overallPlaceOffset: 8 },
      { zoneName: 'Copa Bronce', overallPlaceOffset: 16 },
    ]);
  });

  it('includes progress, schedule, and venueCount for in-progress tournaments in organization listing and omits them when there are no fixtures', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const db = scratch.db as Kysely<Database>;
    const descriptor = footballDescriptor();

    const inProgressAlias = 'copa-listing-progress-active';
    const emptyAlias = 'copa-listing-progress-empty';
    const firstKickoff = '2026-11-01T14:00:00.000Z';
    const lastKickoff = '2026-11-03T18:30:00.000Z';

    const { activeId, emptyId } = await withTransaction(db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const active = await tournaments.create(uow, {
        organizationId,
        alias: inProgressAlias,
        name: 'Copa Listing Progress Active',
        descriptor,
        ...audit,
      });
      const empty = await tournaments.create(uow, {
        organizationId,
        alias: emptyAlias,
        name: 'Copa Listing Progress Empty',
        descriptor,
        ...audit,
      });

      const team1 = await enrollments.createTeam(uow, {
        organizationId,
        name: 'Listing One',
        ...audit,
      });
      const team2 = await enrollments.createTeam(uow, {
        organizationId,
        name: 'Listing Two',
        ...audit,
      });
      const e1 = await enrollments.registerEntrant(uow, {
        organizationId,
        tournamentId: active.tournamentId,
        entrantRef: { kind: 'team', teamId: team1.teamId },
        ...audit,
      });
      const e2 = await enrollments.registerEntrant(uow, {
        organizationId,
        tournamentId: active.tournamentId,
        entrantRef: { kind: 'team', teamId: team2.teamId },
        ...audit,
      });

      const stage1 = await competition.createStageInTournament(uow, {
        tournamentId: active.tournamentId,
        number: 1,
        name: 'Clasificación',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const stage2 = await competition.createStageInTournament(uow, {
        tournamentId: active.tournamentId,
        number: 2,
        name: 'Finales',
        format: 'single-elimination',
        organizationId,
        ...audit,
      });

      const [f1] = await competition.createFixtures(uow, {
        stageId: stage1.stageId,
        fixtures: [{ round: 1, homeEntrantId: e1.entrantId, awayEntrantId: e2.entrantId }],
        organizationId,
        ...audit,
      });
      const [f2] = await competition.createFixtures(uow, {
        stageId: stage2.stageId,
        fixtures: [{ round: 1, homeEntrantId: e1.entrantId, awayEntrantId: e2.entrantId }],
        organizationId,
        ...audit,
      });

      if (!f1 || !f2) throw new Error('Expected two fixtures');

      const m1 = await competition.createMatch(uow, {
        fixtureId: f1.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });
      const m2 = await competition.createMatch(uow, {
        fixtureId: f2.fixtureId,
        number: 1,
        organizationId,
        ...audit,
      });

      await competition.recordResult(uow, {
        matchId: m1.matchId,
        result: {
          sides: [
            { entrantId: e1.entrantId, statistics: { points: 3, played: 1 } },
            { entrantId: e2.entrantId, statistics: { points: 0, played: 1 } },
          ],
          winnerEntrantId: e1.entrantId,
          recordedAt: '2026-11-01T16:00:00.000Z',
        },
        organizationId,
        ...audit,
      });

      const now = new Date();
      const venue1 = newId();
      const venue2 = newId();
      const scheduleId = newId();
      const slot1 = newId();
      const slot2 = newId();

      await uow.tx
        .insertInto('venues')
        .values([
          {
            venue_id: venue1,
            organization_id: organizationId,
            alias: `venue-listing-1-${venue1.slice(0, 8)}`,
            name: 'Estadio Uno',
            concurrent_capacity: 1,
            address: null,
            details: null,
            created_at: now,
          },
          {
            venue_id: venue2,
            organization_id: organizationId,
            alias: `venue-listing-2-${venue2.slice(0, 8)}`,
            name: 'Estadio Dos',
            concurrent_capacity: 1,
            address: null,
            details: null,
            created_at: now,
          },
        ])
        .execute();

      await uow.tx
        .insertInto('schedules')
        .values({
          schedule_id: scheduleId,
          organization_id: organizationId,
          name: 'Listing Schedule',
          starts_at: String(Date.parse(firstKickoff)),
          ends_at: String(Date.parse(lastKickoff)),
          slot_minutes: 90,
          turnaround_minutes: 15,
          created_at: now,
        })
        .execute();
      await uow.tx
        .insertInto('schedule_venues')
        .values([
          { schedule_id: scheduleId, venue_id: venue1 },
          { schedule_id: scheduleId, venue_id: venue2 },
        ])
        .execute();
      await uow.tx
        .insertInto('schedule_slots')
        .values([
          {
            slot_id: slot1,
            schedule_id: scheduleId,
            venue_id: venue1,
            starts_at: String(Date.parse(firstKickoff)),
            created_at: now,
          },
          {
            slot_id: slot2,
            schedule_id: scheduleId,
            venue_id: venue2,
            starts_at: String(Date.parse(lastKickoff)),
            created_at: now,
          },
        ])
        .execute();
      await uow.tx
        .insertInto('match_schedule_assignments')
        .values([
          { match_id: m1.matchId, slot_id: slot1, published: true, created_at: now },
          { match_id: m2.matchId, slot_id: slot2, published: true, created_at: now },
        ])
        .execute();

      return { activeId: active.tournamentId, emptyId: empty.tournamentId };
    });

    await withTransaction(db, async (uow) => {
      await tournaments.publish(uow, { tournamentId: activeId, organizationId, ...audit });
      await tournaments.publish(uow, { tournamentId: emptyId, organizationId, ...audit });
    });

    const response = await request({
      method: 'GET',
      url: '/api/organizations/liga-orbital/public/tournaments',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string) as {
      tournaments: {
        alias: string;
        progress?: {
          currentStageNumber?: number;
          currentStageName?: string;
          resolvedMatches: number;
          totalMatches: number;
        };
        schedule?: { firstKickoffAt?: string; lastKickoffAt?: string };
        venueCount?: number;
      }[];
    };

    const activeItem = body.tournaments.find((t) => t.alias === inProgressAlias);
    expect(activeItem?.progress).toEqual({
      currentStageNumber: 2,
      currentStageName: 'Finales',
      resolvedMatches: 1,
      totalMatches: 2,
    });
    expect(activeItem?.schedule).toEqual({
      firstKickoffAt: firstKickoff,
      lastKickoffAt: lastKickoff,
    });
    expect(activeItem?.venueCount).toBe(2);

    const emptyItem = body.tournaments.find((t) => t.alias === emptyAlias);
    expect(emptyItem?.progress).toBeUndefined();
    expect(emptyItem?.schedule).toBeUndefined();
    expect(emptyItem?.venueCount).toBeUndefined();
  });
});
