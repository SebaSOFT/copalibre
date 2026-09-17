import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  PersonRepository,
  EnrollmentRepository,
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
      ...footballDescriptor(),
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

  it('404s on draft tournament for every route', async () => {
    const routes = ['overview', 'live', 'stages/1/bracket', 'stages/1/matches/1'];
    for (const route of routes) {
      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${draftTournament.alias}/${route}`,
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it('404s on nonexistent organization/tournament/stage', async () => {
    const responseOrg = await request({
      method: 'GET',
      url: `/organizations/unknown-org/tournaments/${publishedTournament.alias}/overview`,
    });
    expect(responseOrg.statusCode).toBe(404);

    const responseTourn = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/unknown-tourn/overview`,
    });
    expect(responseTourn.statusCode).toBe(404);

    const responseStage = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/999/bracket`,
    });
    expect(responseStage.statusCode).toBe(404);
  });

  it('returns real data with entrant names resolved for published tournament', async () => {
    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/overview`,
    });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload as string);
    expect(data.tournamentAlias).toBe(publishedTournament.alias);
    expect(data.organizationAlias).toBe('liga-orbital');
    expect(data.disciplineImages).toEqual([{ key: 'modules/football/1.0.0/football-01.jpg' }]);
    expect(Array.isArray(data.matches)).toBe(true);
    expect(data.status).toBeDefined();
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

    const base = `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/${stage.number}/matches`;
    const response = await request({ method: 'GET', url: `${base}/${match.number}` });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload as string)).toMatchObject({
      stageNumber: stage.number,
      matchNumber: match.number,
      status: 'upcoming',
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
          url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/999/matches/1`,
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
            address: null,
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
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/${stage.number}/matches/${match.number}`,
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
    });
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
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/stages/${stage.number}/matches/${match.number}`,
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
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/${person.personId}/public/profile`,
    });

    expect(response.statusCode).toBe(200);
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
        }),
      ]),
    );

    expect(body.careerStatistics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disciplineDescriptorId: publishedTournament.disciplineRef.descriptorId,
          statistics: expect.arrayContaining([
            expect.objectContaining({
              code: 'career-goals',
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
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/${person.personId}/public/profile`,
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
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}/persons/01890000-0000-7000-8000-999999999999/public/profile`,
    });
    expect(unknownResponse.statusCode).toBe(404);
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
        url: `/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=player-stats`,
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
        url: `/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload as string).layoutCode).toBe('player-stats');
    });

    it('404s a team-granularity (non-person) layout named for the drilldown', async () => {
      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=team-standings-drilldown`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an undeclared layout code', async () => {
      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${scorerId}/public/statistics?layout=nonexistent`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an unpublished (draft) tournament', async () => {
      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${drilldownDraftTournament.alias}/persons/${scorerId}/public/statistics`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('404s an unknown or cross-organization person', async () => {
      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/01890000-0000-7000-8000-999999999999/public/statistics`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('has no inferred tournament total or match rows for a person never named on a match roster', async () => {
      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/tournaments/${drilldownTournament.alias}/persons/${benchedId}/public/statistics?layout=player-stats`,
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
        url: `/organizations/liga-orbital/public/tournaments`,
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
        url: `/organizations/nonexistent-org-alias/public/tournaments`,
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
        url: `/organizations/liga-orbital/public/tournaments`,
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
        url: `/organizations/liga-orbital/public/tournaments`,
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
      expect(found.winners[0].champion.name).toBe('Team Alpha');
      expect(found.winners[0].champion.abbreviation).toBe('ALP');
      expect(found.winners[0].runnerUp.entrantId).toBe(runnerEntrant.entrantId);
      expect(found.winners[0].runnerUp.name).toBe('Team Beta');
      expect(found.winners[0].runnerUp.abbreviation).toBe('BET');
    });

    it('resolves each zone independently, skipping only a zone whose terminal round is ambiguous (openspec 0245)', async () => {
      // Reproduces the panamericano-clubes-2025 shape that surfaced the bug:
      // a multi-zone terminal stage where one zone's deepest round holds more
      // than one finalized match (a real final alongside a classification
      // match) — resolveTournamentWinners must skip only that zone, not the
      // whole tournament.
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

      const { silverChamp, silverRunnerUp } = await withTransaction(
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

          const [goldA1, goldA2, goldB1, goldB2, silverChamp, silverRunnerUp] = await Promise.all([
            team('gold-a1', 'Gold Finalist A'),
            team('gold-a2', 'Gold Finalist B'),
            team('gold-b1', 'Gold Classification A'),
            team('gold-b2', 'Gold Classification B'),
            team('silver-1', 'Silver Champion'),
            team('silver-2', 'Silver Runner-up'),
          ]);

          // Gold zone: terminal round has TWO finalized matches (final +
          // classification) — ambiguous, must be skipped. Silver zone: a
          // normal single-match terminal round — must still resolve correctly
          // alongside the ambiguous gold zone.
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
                round: 1,
                homeEntrantId: silverChamp.entrantId,
                awayEntrantId: silverRunnerUp.entrantId,
                zoneId: silver.zoneId,
              },
            ],
            organizationId,
            ...audit,
          });
          for (const [fixture, winnerEntrantId] of [
            [fixtures[0], goldA1.entrantId],
            [fixtures[1], goldB1.entrantId],
            [fixtures[2], silverChamp.entrantId],
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

          return { silverChamp, silverRunnerUp };
        },
      );

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/public/tournaments`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload as string);
      const found = body.tournaments.find(
        (t: { tournamentId: string }) => t.tournamentId === created.tournamentId,
      );
      expect(found).toBeDefined();
      expect(found.winners).toBeDefined();
      const zoneNames = found.winners.map((zone: { zoneName?: string }) => zone.zoneName);
      // The ambiguous gold zone is skipped entirely — not present, and its
      // absence never prevents the silver zone from resolving.
      expect(zoneNames).not.toContain('Copa de Oro');
      expect(zoneNames).toContain('Copa de Plata');
      const silverZone = found.winners.find(
        (zone: { zoneName?: string }) => zone.zoneName === 'Copa de Plata',
      );
      expect(silverZone.champion.entrantId).toBe(silverChamp.entrantId);
      expect(silverZone.runnerUp.entrantId).toBe(silverRunnerUp.entrantId);
    });

    it('resolves champions and runners-up for finished placement/round-robin tournaments', async () => {
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

      const { rank1Entrant, rank2Entrant } = await withTransaction(
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
                { entrantId: entrantA.entrantId, statistics: { goals: 2 } },
                { entrantId: entrantB.entrantId, statistics: { goals: 0 } },
              ],
              winnerEntrantId: entrantA.entrantId,
              recordedAt: new Date().toISOString(),
            },
            organizationId,
            actor: 'user:seed',
            authorizationContext: 'seed',
          });

          return { rank1Entrant: entrantA, rank2Entrant: entrantB };
        },
      );

      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'finished' })
        .where('tournament_id', '=', created.tournamentId)
        .execute();

      const response = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/public/tournaments`,
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
        url: `/organizations/liga-orbital/public/tournaments`,
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
});
