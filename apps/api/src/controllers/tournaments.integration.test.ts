import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import { TournamentRepository, withTransaction, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { TournamentsController } from './tournaments.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([TournamentsController]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('organization-scoped tournament routes', () => {
  it('404s a tournament alias that exists in no organization', async () => {
    const response = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/no-such-copa',
    });
    expect(response.statusCode).toBe(404);
  });

  it('404s a tournament that is still in draft state', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();

    const draftTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-draft',
        name: 'Copa Draft',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${draftTournament.alias}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('200s a tournament that is published', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();

    const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-published',
        name: 'Copa Published',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    const publishedTournament = await withTransaction(
      scratch.db as Kysely<Database>,
      async (uow) => {
        return tournaments.publish(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      },
    );

    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}`,
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload as string).alias).toBe(publishedTournament.alias);
  });

  it('returns 404 for a draft tournament', async () => {
    const tournaments = new TournamentRepository(scratch.db as Kysely<Database>);
    const descriptor = footballDescriptor();
    const draft = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-draft-test',
        name: 'Copa Draft Test',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${draft.alias}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it("lists the organization's active tournaments, excluding archived (0113)", async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const draft = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: 'copa-active-draft',
        name: 'Copa Active Draft',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const toArchive = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: 'copa-archived',
        name: 'Copa Archived',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    await scratch.db
      .updateTable('tournaments')
      .set({ status: 'archived' })
      .where('tournament_id', '=', toArchive.tournamentId)
      .execute();

    const noToken = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments',
    });
    expect(noToken.statusCode).toBe(401);

    const response = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    const aliases = (JSON.parse(response.payload as string) as { alias: string }[]).map(
      (t) => t.alias,
    );
    expect(aliases).toContain(draft.alias);
    expect(aliases).not.toContain(toArchive.alias);
  });
});
