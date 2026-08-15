import { Module, type INestApplication } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { TokenVerifier, type AuthenticatedSubject } from '@copalibre/auth';
import { OrganizationRepository, withTransaction, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { createMigratedDatabase } from '../../../packages/persistence/src/test-support/scratch-database.js';
import { DATABASE } from './database.token.js';
import { EventsController, LongPollController } from './events.controller.js';
import { StreamAuthGuard } from './stream/stream-auth.guard.js';

/**
 * The streams through the real HTTP stack.
 *
 * Token *verification* is stubbed — issuing RS256 tokens is the auth package's
 * own suite — so these tests are about the wiring: the headers a stream sets,
 * what the public path requires (nothing), and what the authenticated path
 * refuses.
 */

/** `entity_id` is a uuid column, so the fixture is one. */
const MATCH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const SUBJECT: AuthenticatedSubject = {
  subjectId: 'operator-1',
  organizationId: 'org-1',
  scopes: ['copalibre.control'],
};

class FakeTokenVerifier {
  verify(token: string): Promise<AuthenticatedSubject> {
    if (token !== 'good') return Promise.reject(new Error('unknown token'));
    return Promise.resolve(SUBJECT);
  }
}

describe('event streams (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let db: Kysely<Database>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('events-http');
    db = scratch.db;

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: 'liga',
        name: 'Liga',
        actor: 'user:test',
        authorizationContext: 'scope:test',
      }),
    );
    organizationId = organization.organizationId;

    await withTransaction(db, (uow) =>
      uow.publishEvent({
        organizationId,
        stream: `match:${MATCH}`,
        entityId: MATCH,
        eventType: 'match.finalized',
        projectionVersion: 1,
        payload: { matchId: MATCH, result: { home: 1 }, refereeNotes: 'privado' },
      }),
    );

    @Module({
      controllers: [EventsController, LongPollController],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: TokenVerifier, useClass: FakeTokenVerifier },
        StreamAuthGuard,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function inject(options: Parameters<NestFastifyApplication['inject']>[0]) {
    return (app as NestFastifyApplication).inject(options);
  }

  it('refuses the control stream with no Authorization header', async () => {
    const response = await inject({ method: 'GET', url: '/events/control/liga' });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a token smuggled into the query string', async () => {
    const response = await inject({
      method: 'GET',
      url: '/events/control/liga?access_token=leaked',
      headers: { authorization: 'Bearer good' },
    });

    // Accepting it once means a client ships that way, and the token is then in
    // proxy logs, browser history, metrics and screenshots forever.
    expect(response.statusCode).toBe(401);
    expect(response.body).toContain('never appear in a URL');
  });

  it('refuses a token the verifier does not recognise', async () => {
    const response = await inject({
      method: 'GET',
      url: '/events/control/liga',
      headers: { authorization: 'Bearer forged' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('answers the public stream with no Authorization header at all', async () => {
    // A spectator has no account, and requiring one to see a score would be a
    // different product.
    const response = await inject({
      method: 'GET',
      url: `/events/public/liga/tournaments/${organizationId}`,
      headers: { 'last-event-id': '00000000-0000-4000-8000-000000000000' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    // `no-transform` matters as much as `no-cache`: a proxy that "optimises" the
    // body buffers it, and a buffered stream arrives after the match ended.
    expect(response.headers['cache-control']).toBe('no-cache, no-transform');
    expect(response.headers['x-accel-buffering']).toBe('no');
  });

  it('emits immediate and idle heartbeats for the reverse-proxy diagnostic', async () => {
    const response = await inject({ method: 'GET', url: '/events/proxy-check' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache, no-transform');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.body).toContain(': copalibre-proxy-check-1');
    expect(response.body).toContain(': copalibre-proxy-check-2');
  });

  it('tells a public client with an unknown cursor to fetch the projection', async () => {
    const response = await inject({
      method: 'GET',
      url: `/events/public/liga/tournaments/${organizationId}`,
      headers: { 'last-event-id': '00000000-0000-4000-8000-000000000000' },
    });

    expect(response.body).toContain('replay.expired');
    expect(response.body).toContain('fetch-projection');
  });

  it('404s a stream for an organization nobody has', async () => {
    const response = await inject({
      method: 'GET',
      url: '/events/public/no-such-liga/tournaments/x',
    });

    expect(response.statusCode).toBe(404);
  });

  it('serves the long poll from the same replay resolution', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/events?organization=liga&wait=0',
      headers: { authorization: 'Bearer good' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { events: { eventType: string }[] };
    // Creating the organization published its own event, and a control
    // subscriber sees everything its organization emitted — the sanitising is
    // the public stream's job, not this one's.
    expect(body.events.map((event) => event.eventType)).toEqual([
      'organization.created',
      'match.finalized',
    ]);
  });

  it('returns an empty batch and the same cursor when the wait elapses', async () => {
    const first = JSON.parse(
      (
        await inject({
          method: 'GET',
          url: '/api/events?organization=liga&wait=0',
          headers: { authorization: 'Bearer good' },
        })
      ).body,
    ) as { cursor?: string };

    const second = JSON.parse(
      (
        await inject({
          method: 'GET',
          url: `/api/events?organization=liga&wait=0&after=${first.cursor ?? ''}`,
          headers: { authorization: 'Bearer good' },
        })
      ).body,
    ) as { events: unknown[]; cursor?: string };

    // The client asks again with the same position rather than having to reason
    // about what a timeout meant.
    expect(second.events).toEqual([]);
    expect(second.cursor).toBe(first.cursor);
  });

  it('refuses the long poll without a bearer token', async () => {
    const response = await inject({ method: 'GET', url: '/api/events?organization=liga' });

    expect(response.statusCode).toBe(401);
  });
});
