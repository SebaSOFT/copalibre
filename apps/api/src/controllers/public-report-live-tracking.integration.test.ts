import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { PublicProjectionsController } from './public-projections.controller.js';

/**
 * The public match report says whether its page should follow the match stream: `tracksLiveIndicators`
 * is set for every status when the discipline shows a counter or declares a timed penalty, and absent
 * otherwise, so a discipline with neither never polls. The report always names its match.
 */
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
let organizationId = '';
const ALIAS = 'copa-sin-contadores';
const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([PublicProjectionsController]));
  const tournaments = new TournamentRepository(scratch.db);
  const competition = new CompetitionRepository(scratch.db);
  const descriptor = footballDescriptor();
  const tournamentId = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
    const tournament = await tournaments.create(uow, {
      organizationId,
      alias: ALIAS,
      name: 'Copa Sin Contadores',
      descriptor,
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
      fixtures: [{ round: 1 }],
      organizationId,
      ...AUDIT,
    });
    await competition.createMatch(uow, {
      fixtureId: fixture?.fixtureId ?? '',
      number: 1,
      organizationId,
      ...AUDIT,
    });
    return tournament.tournamentId;
  });
  // Publishing reads the tournament back, so it runs in a transaction of its own.
  await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    tournaments.publish(uow, { tournamentId, organizationId, ...AUDIT }),
  );
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('public match report stream tracking', () => {
  it('names the match and omits tracksLiveIndicators when the discipline shows no counter and has no timed penalty', async () => {
    const response = await request({
      method: 'GET',
      url: `/api/organizations/liga-orbital/tournaments/${ALIAS}/stages/1/matches/1`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(typeof body.matchId).toBe('string');
    expect(body).not.toHaveProperty('tracksLiveIndicators');
    expect(body).not.toHaveProperty('counters');
  });
});
