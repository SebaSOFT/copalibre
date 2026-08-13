import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import {
  AuthVerificationTokenRepository,
  withTransaction,
  newId,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { NativeAuthController, PersonalAccessTokenController } from './auth.controller.js';

const TOKENS: Readonly<Record<string, AuthenticatedSubject>> = {
  'admin-token': {
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    principalId: '550e8400-e29b-41d4-a716-446655440000',
    scopes: ['copalibre.control'],
  },
};

class FakeTokenVerifier {
  verify(token: string): Promise<AuthenticatedSubject> {
    const subject = TOKENS[token];
    if (!subject) return Promise.reject(new Error('unknown token'));
    return Promise.resolve(subject);
  }
}

describe('Auth Controllers', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  
  beforeAll(async () => {
    process.env.COPALIBRE_JWT_SECRET = 'test-secret-12345678901234567890';
    process.env.COPALIBRE_JWT_ISSUER = 'test-issuer';
    process.env.COPALIBRE_JWT_AUDIENCE = 'test-audience';

    scratch = await createMigratedDatabase('auth');

    @Module({
      controllers: [NativeAuthController, PersonalAccessTokenController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: TokenVerifier, useValue: new FakeTokenVerifier() },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function request(options: {
    method: 'GET' | 'POST' | 'DELETE';
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

  describe('NativeAuthController', () => {
    const email = 'test@example.com';
    const password = 'my-secret-password';
    let principalId: string;

    beforeAll(async () => {
      const passwordHash = await argon2.hash(password);
      principalId = newId();
      await (scratch.db as Kysely<Database>).insertInto('identity_principals').values({
        principal_id: principalId,
        email,
        password_hash: passwordHash,
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();
    });

    it('POST /auth/login returns 200 with an access token for valid credentials', async () => {
      const response = await request({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password },
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).accessToken).toBeDefined();
    });

    it('POST /auth/login returns 401 for invalid credentials', async () => {
      const response = await request({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('POST /auth/forgot-password returns 200', async () => {
      const response = await request({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email },
      });
      expect(response.statusCode).toBe(200);
    });

    it('POST /auth/reset-password correctly updates the password hash in the database when provided a valid token', async () => {
      const { rawToken } = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new AuthVerificationTokenRepository(scratch.db).create(uow, {
          principalId,
          kind: 'password-reset',
          ttlMs: 60 * 60 * 1000,
        })
      );

      const response = await request({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { token: rawToken, newPassword: 'new-secret-password' },
      });
      expect(response.statusCode).toBe(200);

      const principal = await (scratch.db as Kysely<Database>)
        .selectFrom('identity_principals')
        .selectAll()
        .where('principal_id', '=', principalId)
        .executeTakeFirst();
      
      expect(principal?.password_hash).toBeDefined();
      const valid = await argon2.verify(principal?.password_hash ?? '', 'new-secret-password');
      expect(valid).toBe(true);
    });
  });

  describe('PersonalAccessTokenController', () => {
    let tokenId: string;

    beforeAll(async () => {
      await (scratch.db as Kysely<Database>).insertInto('identity_principals').values({
        principal_id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'admin@example.com',
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();
    });

    it('POST /auth/pat creates a token', async () => {
      const response = await request({
        method: 'POST',
        url: '/auth/pat',
        token: 'admin-token',
        payload: {
          label: 'Test Token',
          expiresInDays: 30,
        },
      });
      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      expect(data.tokenId).toBeDefined();
      expect(data.token).toBeDefined();
      tokenId = data.tokenId;
    });

    it('GET /auth/pat lists it', async () => {
      const response = await request({
        method: 'GET',
        url: '/auth/pat',
        token: 'admin-token',
      });
      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data).toHaveLength(1);
      expect(data[0].tokenId).toBe(tokenId);
    });

    it('DELETE /auth/pat/:id revokes it', async () => {
      const response = await request({
        method: 'DELETE',
        url: `/auth/pat/${tokenId}`,
        token: 'admin-token',
      });
      expect(response.statusCode).toBe(200);

      const getResponse = await request({
        method: 'GET',
        url: '/auth/pat',
        token: 'admin-token',
      });
      const data = JSON.parse(getResponse.payload);
      expect(data).toHaveLength(1);
      expect(data[0].revoked).toBe(true);
    });
  });
});
