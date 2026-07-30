import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { OrganizationRepository, withTransaction, type Database } from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database';
import type { Kysely } from 'kysely';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedSubject } from '../auth/request-context';
import { TokenVerifier } from '../auth/token-verifier';
import { DATABASE } from '../database.token';
import { HealthController } from '../health.controller';
import { OrganizationsController } from './organizations.controller';
import { TournamentsController } from './tournaments.controller';

/**
 * End-to-end through the real HTTP stack (Fastify + guard + policy +
 * repositories + PostgreSQL). The only stub is token *verification*: issuing
 * real RS256 tokens is covered by the unit suite, so here a fake verifier maps
 * an opaque token string to a subject, keeping these tests about
 * authorization and wiring.
 */
const TOKENS: Readonly<Record<string, AuthenticatedSubject>> = {
  'organizer-org1': {
    subjectId: 'organizer-1',
    organizationId: 'ORG_1',
    scopes: ['copalibre.control'],
  },
  'organizer-org2': {
    subjectId: 'organizer-2',
    organizationId: 'ORG_2',
    scopes: ['copalibre.control'],
  },
  'participant-org1': {
    subjectId: 'participant-1',
    organizationId: 'ORG_1',
    scopes: ['copalibre.participant'],
  },
};

class FakeTokenVerifier {
  constructor(private readonly organizationId: () => string) {}

  verify(token: string): Promise<AuthenticatedSubject> {
    const subject = TOKENS[token];
    if (!subject) return Promise.reject(new Error('unknown token'));
    // Substitute the real organization id created in beforeAll.
    return Promise.resolve({
      ...subject,
      organizationId:
        subject.organizationId === 'ORG_1' ? this.organizationId() : 'other-organization',
    });
  }
}

describe('api routes (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('api');

    @Module({
      controllers: [HealthController, OrganizationsController, TournamentsController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: TokenVerifier, useValue: new FakeTokenVerifier(() => organizationId) },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-orbital',
        name: 'Liga Orbital',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function request(options: {
    method: 'GET' | 'POST';
    url: string;
    token?: string;
    payload?: unknown;
  }) {
    return (app as NestFastifyApplication).inject({
      method: options.method,
      url: options.url,
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
      payload: options.payload as never,
    });
  }

  describe('public-read plane', () => {
    it('serves the liveness probe anonymously', async () => {
      const response = await request({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ role: 'api' });
    });

    it('reads an organization by alias with no token', async () => {
      const response = await request({ method: 'GET', url: '/organizations/liga-orbital' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ alias: 'liga-orbital', name: 'Liga Orbital' });
    });

    it('404s an unknown alias', async () => {
      const response = await request({ method: 'GET', url: '/organizations/no-such-org' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('admin-control plane', () => {
    it('401s with no token', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('401s with an unverifiable token', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'forged',
        payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('403s a verified token that lacks the control scope', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'participant-org1',
        payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
      });
      expect(response.statusCode).toBe(403);
    });

    it('creates an organization with a control-scoped token', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations',
        token: 'organizer-org1',
        payload: { alias: 'club-cometa', name: 'Club Cometa' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ alias: 'club-cometa' });
    });

    it('403s an organizer scoped to a different organization', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments',
        token: 'organizer-org2',
        payload: {
          alias: 'copa-ajena',
          name: 'Copa Ajena',
          descriptorId: '01890000-0000-7000-8000-000000000001',
          descriptorVersion: 1,
        },
      });
      // Cross-organization access is denied by policy, before the descriptor
      // lookup would have rejected it — proving policy runs first.
      expect(response.statusCode).toBe(403);
    });

    it('400s a tournament referencing an unknown descriptor', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments',
        token: 'organizer-org1',
        payload: {
          alias: 'copa-sin-disciplina',
          name: 'Copa Sin Disciplina',
          descriptorId: '01890000-0000-7000-8000-0000000000ff',
          descriptorVersion: 9,
        },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('token transport rules', () => {
    it('treats a token passed as a query parameter as unauthenticated', async () => {
      const response = await request({
        method: 'POST',
        url: '/organizations?access_token=organizer-org1',
        payload: { alias: 'via-query', name: 'Via Query' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects a non-bearer authorization scheme', async () => {
      const response = await (app as NestFastifyApplication).inject({
        method: 'POST',
        url: '/organizations',
        headers: { authorization: 'Basic organizer-org1' },
        payload: { alias: 'via-basic', name: 'Via Basic' } as never,
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('organization-scoped tournament routes', () => {
    it('404s a tournament alias that exists in no organization', async () => {
      const response = await request({
        method: 'GET',
        url: '/organizations/liga-orbital/tournaments/no-such-copa',
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
