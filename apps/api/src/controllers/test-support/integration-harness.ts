import { Module, type Type } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { OrganizationRepository, withTransaction, type Database } from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../../packages/persistence/src/test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../../auth/request-context.js';
import { TokenVerifier } from '../../auth/token-verifier.js';
import { DATABASE } from '../../database.token.js';
import { API_BODY_LIMIT_BYTES } from '../../http-body-limit.js';

/**
 * End-to-end through the real HTTP stack (Fastify + guard + policy +
 * repositories + PostgreSQL). The only stub is token *verification*: issuing
 * real RS256 tokens is covered by the unit suite, so here a fake verifier maps
 * an opaque token string to a subject, keeping these tests about
 * authorization and wiring.
 */
export const TOKENS: Readonly<Record<string, AuthenticatedSubject>> = {
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
  'super-admin': {
    subjectId: 'super-admin-1',
    scopes: ['copalibre.super-admin'],
  },
};

export class FakeTokenVerifier {
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

export async function buildTestApp(controllers: Type<unknown>[]): Promise<{
  app: NestFastifyApplication;
  scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  organizationId: string;
  request: (options: {
    method: 'GET' | 'POST';
    url: string;
    token?: string;
    payload?: unknown;
  }) => ReturnType<NestFastifyApplication['inject']>;
}> {
  const scratch = await createMigratedDatabase('api');
  let organizationId = '';

  @Module({
    controllers,
    providers: [
      { provide: DATABASE, useValue: scratch.db },
      { provide: TokenVerifier, useValue: new FakeTokenVerifier(() => organizationId) },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      Reflector,
    ],
  })
  class TestModule {}

  const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ bodyLimit: API_BODY_LIMIT_BYTES }),
  );
  app.enableCors({ origin: 'https://app.example.com' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const organization = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    new OrganizationRepository(scratch.db).create(uow, {
      alias: 'liga-orbital',
      name: 'Liga Orbital',
      actor: 'user:seed',
      authorizationContext: 'seed',
    }),
  );
  organizationId = organization.organizationId;

  function request(options: {
    method: 'GET' | 'POST';
    url: string;
    token?: string;
    payload?: unknown;
  }) {
    return app.inject({
      method: options.method,
      url: options.url,
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
      payload: options.payload as never,
    });
  }

  return { app, scratch, organizationId, request };
}
