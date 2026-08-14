import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import { TournamentRepository, withTransaction, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { PublicProjectionsController } from './public-projections.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([PublicProjectionsController]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('public projections routes (0067)', () => {
  let publishedTournament: Awaited<ReturnType<TournamentRepository['create']>>;
  let draftTournament: Awaited<ReturnType<TournamentRepository['create']>>;

  beforeAll(async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();

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
    const routes = ['overview', 'live', 'stages/1/bracket'];
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
    expect(Array.isArray(data.matches)).toBe(true);
  });
});
