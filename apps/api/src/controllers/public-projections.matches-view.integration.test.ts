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

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildPublicProjectionsApp());
  await seedPublicProjectionTournaments(scratch, organizationId);
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
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
