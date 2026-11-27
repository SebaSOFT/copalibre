import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  EnrollmentRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  buildPublicProjectionsApp,
  seedPublicProjectionTournaments,
  type PublicProjectionsApp,
} from './public-projections.integration-fixtures.js';

let app: INestApplication;
let scratch: PublicProjectionsApp['scratch'];
let organizationId = '';
let request: PublicProjectionsApp['request'];
let publishedTournament: Awaited<
  ReturnType<typeof seedPublicProjectionTournaments>
>['publishedTournament'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildPublicProjectionsApp());
  const seeded = await seedPublicProjectionTournaments(scratch, organizationId);
  publishedTournament = seeded.publishedTournament;
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('public projections routes', () => {
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
