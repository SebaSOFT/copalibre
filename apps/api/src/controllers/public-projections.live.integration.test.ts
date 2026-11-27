import type { INestApplication } from '@nestjs/common';
import { CompetitionRepository, withTransaction, type Database } from '@copalibre/persistence';
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
});
