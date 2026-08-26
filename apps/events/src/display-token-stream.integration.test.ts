import { createHash } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { TokenVerifier, type AuthenticatedSubject } from '@copalibre/auth';
import { winConditionScript, type DisciplineDescriptor } from '@copalibre/domain';
import {
  DisplayTokenRepository,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { createMigratedDatabase } from '../../../packages/persistence/src/test-support/scratch-database.js';
import { DATABASE } from './database.token.js';
import { EventsController, LongPollController } from './events.controller.js';
import { DisplayTokenAuthGuard } from './stream/display-token-auth.guard.js';
import { StreamAuthGuard } from './stream/stream-auth.guard.js';

/**
 * The `/tv/**` stream's device-scoped authorization, through the real HTTP
 * stack — companion to `events.integration.test.ts`,
 * which covers the public and control streams the same way.
 */

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

function descriptor(): DisciplineDescriptor {
  const descriptorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  return {
    descriptorId,
    alias: 'orbital-field',
    version: '1.0.0',
    name: 'Orbital Field',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 5, maxPlayers: 9 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'score' }),
    notificationRuleCapabilities: [],
    defaults: { scoring: { pointsPerWin: 3 }, tiebreakers: ['points'] },
    fieldPolicies: {},
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('the /tv/** stream is gated by a device-scoped display token (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let db: Kysely<Database>;
  let tokens: DisplayTokenRepository;
  let organizationAlias: string;
  let tournamentAlias: string;
  let tournamentId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('events-tv-http');
    db = scratch.db;
    tokens = new DisplayTokenRepository(db);

    organizationAlias = 'liga-tv';
    tournamentAlias = 'apertura-2026';

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga TV',
        actor: 'user:test',
        authorizationContext: 'scope:test',
      }),
    );
    const tournament = await withTransaction(db, (uow) =>
      new TournamentRepository(db).create(uow, {
        organizationId: organization.organizationId,
        alias: tournamentAlias,
        name: 'Apertura 2026',
        descriptor: descriptor(),
        actor: 'user:test',
        authorizationContext: 'scope:test',
      }),
    );
    tournamentId = tournament.tournamentId;

    @Module({
      controllers: [EventsController, LongPollController],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: TokenVerifier, useClass: FakeTokenVerifier },
        StreamAuthGuard,
        DisplayTokenAuthGuard,
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

  it('refuses the stream with no Authorization header', async () => {
    const response = await inject({
      method: 'GET',
      url: `/events/tv/${organizationAlias}/tournaments/${tournamentAlias}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a display token smuggled into the query string', async () => {
    const response = await inject({
      method: 'GET',
      url: `/events/tv/${organizationAlias}/tournaments/${tournamentAlias}?token=leaked`,
      headers: { authorization: 'Bearer whatever' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('answers with a live display token, then rejects it on the very next request once revoked (7.1)', async () => {
    const raw = 'kiosk-token-to-revoke';
    const org = await new OrganizationRepository(db).findByAlias(organizationAlias);
    if (!org) throw new Error('Expected organization fixture');

    const issued = await withTransaction(db, (uow) =>
      tokens.issue(uow, {
        organizationId: org.organizationId,
        tournamentId,
        tokenHash: hash(raw),
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    // An old last-event-id triggers the replay-expired fast path, so the
    // stream ends the response immediately instead of holding the connection
    // open the way a real kiosk's stream stays open indefinitely.
    const before = await inject({
      method: 'GET',
      url: `/events/tv/${organizationAlias}/tournaments/${tournamentAlias}`,
      headers: {
        authorization: `Bearer ${raw}`,
        'last-event-id': '00000000-0000-4000-8000-000000000000',
      },
    });
    expect(before.statusCode).toBe(200);

    await withTransaction(db, (uow) =>
      tokens.revoke(uow, {
        displayTokenId: issued.displayTokenId,
        organizationId: org.organizationId,
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    const after = await inject({
      method: 'GET',
      url: `/events/tv/${organizationAlias}/tournaments/${tournamentAlias}`,
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it(
    "revoking one device's token leaves another device's token, and a " +
      "person's JWT, unaffected (7.2)",
    async () => {
      const org = await new OrganizationRepository(db).findByAlias(organizationAlias);
      if (!org) throw new Error('Expected organization fixture');

      const deviceA = 'kiosk-token-device-a';
      const deviceB = 'kiosk-token-device-b';
      const issuedA = await withTransaction(db, (uow) =>
        tokens.issue(uow, {
          organizationId: org.organizationId,
          tournamentId,
          tokenHash: hash(deviceA),
          actor: 'user:operator',
          authorizationContext: 'copalibre.control',
        }),
      );
      await withTransaction(db, (uow) =>
        tokens.issue(uow, {
          organizationId: org.organizationId,
          tournamentId,
          tokenHash: hash(deviceB),
          actor: 'user:operator',
          authorizationContext: 'copalibre.control',
        }),
      );

      await withTransaction(db, (uow) =>
        tokens.revoke(uow, {
          displayTokenId: issuedA.displayTokenId,
          organizationId: org.organizationId,
          actor: 'user:operator',
          authorizationContext: 'copalibre.control',
        }),
      );

      const revokedDevice = await inject({
        method: 'GET',
        url: `/events/tv/${organizationAlias}/tournaments/${tournamentAlias}`,
        headers: { authorization: `Bearer ${deviceA}` },
      });
      expect(revokedDevice.statusCode).toBe(401);

      const otherDevice = await inject({
        method: 'GET',
        url: `/events/tv/${organizationAlias}/tournaments/${tournamentAlias}`,
        headers: {
          authorization: `Bearer ${deviceB}`,
          'last-event-id': '00000000-0000-4000-8000-000000000000',
        },
      });
      expect(otherDevice.statusCode).toBe(200);

      // A person's JWT is a completely different mechanism (`StreamAuthGuard`,
      // not `DisplayTokenAuthGuard`); revoking a device token cannot touch it.
      const personJwt = await inject({
        method: 'GET',
        url: `/events/control/${organizationAlias}`,
        headers: {
          authorization: 'Bearer good',
          'last-event-id': '00000000-0000-4000-8000-000000000000',
        },
      });
      expect(personJwt.statusCode).toBe(200);
    },
  );

  it('404s for a tournament alias nobody has, once the token itself checks out', async () => {
    const org = await new OrganizationRepository(db).findByAlias(organizationAlias);
    if (!org) throw new Error('Expected organization fixture');

    const raw = 'kiosk-token-no-such-tournament';
    await withTransaction(db, (uow) =>
      tokens.issue(uow, {
        organizationId: org.organizationId,
        tournamentId,
        tokenHash: hash(raw),
        actor: 'user:operator',
        authorizationContext: 'copalibre.control',
      }),
    );

    const response = await inject({
      method: 'GET',
      url: `/events/tv/${organizationAlias}/tournaments/no-such-tournament`,
      headers: { authorization: `Bearer ${raw}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
