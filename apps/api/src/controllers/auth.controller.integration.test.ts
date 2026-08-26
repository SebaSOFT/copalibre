import { jest } from '@jest/globals';
import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrincipalThrottlerGuard } from '../auth/principal-throttler.guard.js';
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
import { SUPER_ADMIN_SCOPE } from '../auth/access-requirement.js';
import { AUTH_THROTTLE_LIMIT, AUTH_THROTTLE_TTL_MS } from './auth.controller.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { NativeAuthController, PersonalAccessTokenController } from './auth.controller.js';

const TOKENS: Readonly<Record<string, AuthenticatedSubject>> = {
  'admin-token': {
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    principalId: '550e8400-e29b-41d4-a716-446655440000',
    scopes: ['copalibre.control'],
  },
  // 0142: a caller whose own session legitimately carries the privileged
  // scope — used to prove even that caller cannot mint it onto a PAT.
  'superadmin-token': {
    subjectId: '550e8400-e29b-41d4-a716-446655440001',
    principalId: '550e8400-e29b-41d4-a716-446655440001',
    scopes: ['copalibre.control', SUPER_ADMIN_SCOPE],
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
      imports: [
        // Same permissive default as AppModule; the strict per-route limits
        // under test come from the controllers' own @Throttle decorators.
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }]),
      ],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: TokenVerifier, useValue: new FakeTokenVerifier() },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      // trustProxy mirrors main.ts so a request's `ip` — and therefore the
      // per-IP rate-limit bucket — follows X-Forwarded-For in these tests.
      new FastifyAdapter({ trustProxy: true }),
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
      await (scratch.db as Kysely<Database>)
        .insertInto('identity_principals')
        .values({
          principal_id: principalId,
          email,
          password_hash: passwordHash,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
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

    it('POST /auth/forgot-password enqueues a password-reset-requested outbox event carrying the reset token', async () => {
      const response = await request({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email },
      });
      expect(response.statusCode).toBe(200);

      const events = await (scratch.db as Kysely<Database>)
        .selectFrom('outbox_events')
        .selectAll()
        .where('event_type', '=', 'password-reset-requested')
        .orderBy('created_at', 'desc')
        .execute();

      expect(events.length).toBeGreaterThan(0);
      const payload = events[0]?.payload as {
        recipientEmail?: string;
        token?: string;
        expiresAt?: string;
      };
      expect(payload.recipientEmail).toBe(email);
      expect(typeof payload.token).toBe('string');
      expect(typeof payload.expiresAt).toBe('string');
    });

    it('POST /auth/forgot-password for an unknown email enqueues nothing, to avoid enumeration', async () => {
      const before = await (scratch.db as Kysely<Database>)
        .selectFrom('outbox_events')
        .select(({ fn }) => fn.count<number>('event_id').as('count'))
        .where('event_type', '=', 'password-reset-requested')
        .executeTakeFirstOrThrow();

      const response = await request({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: 'nobody-registered@example.com' },
      });
      expect(response.statusCode).toBe(200);

      const after = await (scratch.db as Kysely<Database>)
        .selectFrom('outbox_events')
        .select(({ fn }) => fn.count<number>('event_id').as('count'))
        .where('event_type', '=', 'password-reset-requested')
        .executeTakeFirstOrThrow();

      expect(Number(after.count)).toBe(Number(before.count));
    });

    it('POST /auth/reset-password correctly updates the password hash in the database when provided a valid token', async () => {
      const { rawToken } = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new AuthVerificationTokenRepository(scratch.db).create(uow, {
          principalId,
          kind: 'password-reset',
          ttlMs: 60 * 60 * 1000,
        }),
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
      await (scratch.db as Kysely<Database>)
        .insertInto('identity_principals')
        .values([
          {
            principal_id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'admin@example.com',
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            principal_id: '550e8400-e29b-41d4-a716-446655440001',
            email: 'superadmin@example.com',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])
        .execute();
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

    // 0142 scope policy regression cases. Each rejection case asserts the
    // token count for that principal is unchanged, so a 403 can never have
    // persisted a row anyway.
    async function patCount(principalId: string): Promise<number> {
      const row = await (scratch.db as Kysely<Database>)
        .selectFrom('personal_access_tokens')
        .select(({ fn }) => fn.count<number>('token_id').as('count'))
        .where('principal_id', '=', principalId)
        .executeTakeFirstOrThrow();
      return Number(row.count);
    }

    it('POST /auth/pat with a subset of the caller scopes creates exactly those scopes', async () => {
      const response = await request({
        method: 'POST',
        url: '/auth/pat',
        token: 'superadmin-token',
        payload: { label: 'Subset Token', scopes: ['copalibre.control'], expiresInDays: 30 },
      });
      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.payload).scopes).toEqual(['copalibre.control']);
    });

    it('POST /auth/pat without scopes still defaults to the caller own scopes', async () => {
      const response = await request({
        method: 'POST',
        url: '/auth/pat',
        token: 'admin-token',
        payload: { label: 'Default Scopes Token', expiresInDays: 30 },
      });
      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.payload).scopes).toEqual(['copalibre.control']);
    });

    it('POST /auth/pat requesting a scope the caller does not hold returns 403 and persists nothing', async () => {
      const before = await patCount('550e8400-e29b-41d4-a716-446655440000');
      const response = await request({
        method: 'POST',
        url: '/auth/pat',
        token: 'admin-token',
        payload: {
          label: 'Escalation Attempt',
          scopes: ['copalibre.integration'],
          expiresInDays: 30,
        },
      });
      expect(response.statusCode).toBe(403);
      expect(await patCount('550e8400-e29b-41d4-a716-446655440000')).toBe(before);
    });

    it(`POST /auth/pat requesting ${SUPER_ADMIN_SCOPE} returns 403 even when the caller holds it`, async () => {
      const before = await patCount('550e8400-e29b-41d4-a716-446655440001');
      const response = await request({
        method: 'POST',
        url: '/auth/pat',
        token: 'superadmin-token',
        payload: {
          label: 'Privileged Escalation Attempt',
          scopes: [SUPER_ADMIN_SCOPE],
          expiresInDays: 30,
        },
      });
      expect(response.statusCode).toBe(403);
      expect(await patCount('550e8400-e29b-41d4-a716-446655440001')).toBe(before);
    });

    it('POST /auth/pat still accepts scopes null and an empty scopes array, as before this change', async () => {
      const nullResponse = await request({
        method: 'POST',
        url: '/auth/pat',
        token: 'admin-token',
        payload: { label: 'Null Scopes Token', scopes: null, expiresInDays: 30 },
      });
      expect(nullResponse.statusCode).toBe(201);
      expect(JSON.parse(nullResponse.payload).scopes).toEqual(['copalibre.control']);

      const emptyResponse = await request({
        method: 'POST',
        url: '/auth/pat',
        token: 'admin-token',
        payload: { label: 'Empty Scopes Token', scopes: [], expiresInDays: 30 },
      });
      expect(emptyResponse.statusCode).toBe(201);
      expect(JSON.parse(emptyResponse.payload).scopes).toEqual([]);
    });

    it('POST /auth/pat rejects non-string scope entries with 400', async () => {
      const before = await patCount('550e8400-e29b-41d4-a716-446655440000');
      const response = await request({
        method: 'POST',
        url: '/auth/pat',
        token: 'admin-token',
        payload: { label: 'Bad Shape', scopes: [42], expiresInDays: 30 },
      });
      expect(response.statusCode).toBe(400);
      expect(await patCount('550e8400-e29b-41d4-a716-446655440000')).toBe(before);
    });
  });

  // 0145: per-IP rate limiting on the unauthenticated brute-forceable
  // endpoints. Every case sends an explicit X-Forwarded-For so it owns a
  // fresh bucket, independent of the requests the suites above already made.
  describe('auth endpoint rate limiting', () => {
    function fromIp(ip: string): (payload: unknown) => Promise<{ statusCode: number }> {
      return (payload) =>
        (app as NestFastifyApplication).inject({
          method: 'POST',
          url: '/auth/login',
          headers: { 'x-forwarded-for': ip },
          payload: payload as never,
        }) as unknown as Promise<{ statusCode: number }>;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('evaluates login attempts at or below the per-window limit normally', async () => {
      const send = fromIp('10.9.0.1');
      for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
        const response = await send({ email: 'test@example.com', password: 'wrong' });
        expect(response.statusCode).toBe(401);
      }
    });

    it('rejects further attempts from that IP with 429 once the limit is exceeded', async () => {
      const send = fromIp('10.9.0.2');
      for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
        const response = await send({ email: 'test@example.com', password: 'wrong' });
        expect(response.statusCode).toBe(401);
      }
      const over = await send({ email: 'test@example.com', password: 'my-secret-password' });
      expect(over.statusCode).toBe(429);
    });

    it('tracks different client IPs independently', async () => {
      const otherIp = fromIp('10.9.0.3');
      const response = await otherIp({ email: 'test@example.com', password: 'whatever' });
      expect(response.statusCode).toBe(401);
    });

    it('allows attempts again after the window elapses', async () => {
      const send = fromIp('10.9.0.4');
      for (let i = 0; i < AUTH_THROTTLE_LIMIT + 1; i++) {
        await send({ email: 'test@example.com', password: 'wrong' });
      }
      expect((await send({ email: 'test@example.com', password: 'wrong' })).statusCode).toBe(429);

      // Advance the clock past the throttle window without touching timers —
      // the in-memory storage computes windows from Date.now().
      const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + AUTH_THROTTLE_TTL_MS + 1);
      try {
        const afterWindow = await send({ email: 'test@example.com', password: 'wrong' });
        expect(afterWindow.statusCode).toBe(401);
      } finally {
        spy.mockRestore();
      }
    });

    it('applies its own per-IP window to forgot-password and reset-password', async () => {
      const injectIp = (url: string, payload: unknown) =>
        (app as NestFastifyApplication).inject({
          method: 'POST',
          url,
          headers: { 'x-forwarded-for': '10.9.0.5' },
          payload: payload as never,
        });
      for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
        const response = await injectIp('/auth/forgot-password', { email: 'test@example.com' });
        expect(response.statusCode).toBe(200);
      }
      expect(
        (await injectIp('/auth/forgot-password', { email: 'test@example.com' })).statusCode,
      ).toBe(429);

      // Separate route, separate bucket — but the same per-IP window applies.
      // A too-short password keeps the response deterministic (400) while the
      // request is still being evaluated.
      for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
        const response = await injectIp('/auth/reset-password', {
          token: 'irrelevant',
          newPassword: 'short',
        });
        expect(response.statusCode).toBe(400);
      }
      const overLimit = await injectIp('/auth/reset-password', {
        token: 'irrelevant',
        newPassword: 'short',
      });
      expect(overLimit.statusCode).toBe(429);
    });
  });
});
