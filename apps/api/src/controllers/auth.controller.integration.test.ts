import { vi } from 'vitest';
import { Module, type INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiValidationPipe } from '../http/validation.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrincipalThrottlerGuard } from '../auth/principal-throttler.guard.js';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import {
  AuthVerificationTokenRepository,
  PersonalAccessTokenRepository,
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
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { NativeAuthController, PersonalAccessTokenController } from './auth.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { createTokenVerifierFromEnv } from '../modules/core.module.js';
import { applyApiPathPrefix } from '../http/api-path-prefix.js';

const TOKENS: Readonly<Record<string, AuthenticatedSubject>> = {
  'admin-token': {
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    principalId: '550e8400-e29b-41d4-a716-446655440000',
    scopes: ['copalibre.control'],
  },
  // a caller whose own session legitimately carries the privileged
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

function setCookieFor(response: { headers: Record<string, unknown> }, name: string): string {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : [header];
  const raw = values.find((value) => typeof value === 'string' && value.startsWith(`${name}=`));
  if (typeof raw !== 'string') throw new Error(`Response carried no ${name} cookie`);
  return raw;
}

function cookiePairFrom(response: { headers: Record<string, unknown> }, name: string): string {
  const pair = setCookieFor(response, name).split(';')[0];
  if (!pair) throw new Error(`${name} Set-Cookie header was empty`);
  return pair;
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
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
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
    applyApiPathPrefix(app);
    app.useGlobalPipes(createApiValidationPipe());
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
    cookie?: string;
    ip?: string;
    payload?: unknown;
  }) {
    return (app as NestFastifyApplication).inject({
      method: options.method,
      url: options.url,
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.ip ? { 'x-forwarded-for': options.ip } : {}),
      },
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

    it('serves the key set only under /api', async () => {
      const served = await request({ method: 'GET', url: '/api/auth/jwks.json' });
      expect(served.statusCode).toBe(200);
      expect((served.json() as { keys: unknown[] }).keys.length).toBeGreaterThan(0);

      for (const url of ['/auth/jwks.json', '/.well-known/jwks.json']) {
        expect((await request({ method: 'GET', url })).statusCode).toBe(404);
      }
    });

    it('POST /auth/login returns 200 with session metadata, never the token', async () => {
      const response = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.accessToken).toBeUndefined();
      expect(body).toMatchObject({ subject: principalId, method: 'native' });
      expect(body.scopes).toContain('copalibre.control');
    });

    it('POST /auth/login returns 401 for invalid credentials', async () => {
      const response = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    });

    // the global ValidationPipe rejects a body failing its DTO with 400
    // at the edge, instead of surfacing as a handler TypeError (500).
    it('POST /auth/login without a password returns 400 from validation', async () => {
      const response = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email },
      });
      expect(response.statusCode).toBe(400);
    });

    it('POST /auth/login rejects an undocumented extra property with 400', async () => {
      const response = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'wrong-password', isAdmin: true },
      });
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('property isAdmin should not exist');
    });

    it('POST /auth/forgot-password returns 200', async () => {
      const response = await request({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email },
      });
      expect(response.statusCode).toBe(200);
    });

    it('POST /auth/forgot-password enqueues a password-reset-requested outbox event carrying the reset token', async () => {
      const response = await request({
        method: 'POST',
        url: '/api/auth/forgot-password',
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
        url: '/api/auth/forgot-password',
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
        url: '/api/auth/reset-password',
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

    it('POST /auth/reset-password ends the refresh sessions opened before it', async () => {
      const repository = new AuthVerificationTokenRepository(scratch.db);
      const refresh = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        repository.create(uow, { principalId, kind: 'session-refresh', ttlMs: 60_000 }),
      );
      const reset = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        repository.create(uow, { principalId, kind: 'password-reset', ttlMs: 60_000 }),
      );

      const response = await request({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: reset.rawToken, newPassword: 'another-secret-password' },
      });
      expect(response.statusCode).toBe(200);

      const renewed = await request({
        method: 'POST',
        url: '/api/auth/refresh',
        cookie: `copalibre_refresh_token=${refresh.rawToken}`,
      });
      expect(renewed.statusCode).toBe(401);
    });

    it('POST /auth/reset-password refuses a refresh credential and leaves it usable', async () => {
      const repository = new AuthVerificationTokenRepository(scratch.db);
      const refresh = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        repository.create(uow, { principalId, kind: 'session-refresh', ttlMs: 60_000 }),
      );

      const response = await request({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: refresh.rawToken, newPassword: 'hijacked-password' },
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload)).toMatchObject({ errorCode: 'auth-bad-request' });

      await expect(
        withTransaction(scratch.db as Kysely<Database>, (uow) =>
          repository.consume(uow, refresh.rawToken, 'session-refresh'),
        ),
      ).resolves.toMatchObject({ principalId });
    });
  });

  describe('native session silent renewal', () => {
    const email = 'refresh-target@example.com';
    const password = 'my-secret-password';

    beforeAll(async () => {
      const passwordHash = await argon2.hash(password);
      await (scratch.db as Kysely<Database>)
        .insertInto('identity_principals')
        .values({
          principal_id: newId(),
          email,
          password_hash: passwordHash,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    });

    it('logs in and reads the organization endpoint with no remote JWKS configured', async () => {
      const previousJwksUri = process.env.COPALIBRE_JWKS_URI;
      const previousNativeIssuer = process.env.COPALIBRE_NATIVE_JWT_ISSUER;
      delete process.env.COPALIBRE_JWKS_URI;
      process.env.COPALIBRE_NATIVE_JWT_ISSUER = 'http://localhost:8080';
      let nativeApp: NestFastifyApplication | undefined;
      try {
        const verifier = await createTokenVerifierFromEnv();
        @Module({
          controllers: [NativeAuthController, OrganizationsController],
          imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }])],
          providers: [
            { provide: DATABASE, useValue: scratch.db },
            { provide: OBJECT_STORAGE, useValue: {} },
            { provide: TokenVerifier, useValue: verifier },
            { provide: APP_FILTER, useClass: ApiExceptionFilter },
            { provide: APP_GUARD, useClass: JwtAuthGuard },
            { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
            Reflector,
          ],
        })
        class NativeOnlyModule {}

        const moduleRef = await Test.createTestingModule({ imports: [NativeOnlyModule] }).compile();
        nativeApp = moduleRef.createNestApplication<NestFastifyApplication>(
          new FastifyAdapter({ trustProxy: true }),
        );
        applyApiPathPrefix(nativeApp);
        nativeApp.useGlobalPipes(createApiValidationPipe());
        await nativeApp.init();
        await nativeApp.getHttpAdapter().getInstance().ready();

        const login = await nativeApp.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { 'x-forwarded-for': '10.9.4.1' },
          payload: { email, password },
        });
        expect(login.statusCode).toBe(200);
        const organizations = await nativeApp.inject({
          method: 'GET',
          url: '/api/organizations?mine=true',
          headers: { cookie: cookiePairFrom(login, '__Host-copalibre_session') },
        });
        expect(organizations.statusCode).toBe(200);
        expect(JSON.parse(organizations.payload)).toEqual([]);
      } finally {
        await nativeApp?.close();
        if (previousJwksUri === undefined) delete process.env.COPALIBRE_JWKS_URI;
        else process.env.COPALIBRE_JWKS_URI = previousJwksUri;
        if (previousNativeIssuer === undefined) delete process.env.COPALIBRE_NATIVE_JWT_ISSUER;
        else process.env.COPALIBRE_NATIVE_JWT_ISSUER = previousNativeIssuer;
      }
    });

    function refreshCookieFrom(response: { headers: Record<string, unknown> }): string {
      return cookiePairFrom(response, 'copalibre_refresh_token');
    }

    it('POST /auth/login sets an HttpOnly, SameSite=Strict refresh cookie alongside the session cookie', async () => {
      const ip = '10.9.1.1';
      const response = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
        ip,
      });
      expect(response.statusCode).toBe(200);
      const raw = setCookieFor(response, 'copalibre_refresh_token');
      expect(raw).toContain('copalibre_refresh_token=');
      expect(raw).toContain('HttpOnly');
      expect(raw).toContain('SameSite=Strict');
      expect(raw).toContain('Path=/api/auth');
    });

    it('POST /auth/refresh with a valid cookie issues a fresh session cookie and rotates the refresh cookie', async () => {
      const ip = '10.9.1.2';
      const login = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
        ip,
      });
      const cookie = refreshCookieFrom(login);

      const refreshed = await request({ method: 'POST', url: '/api/auth/refresh', cookie, ip });
      expect(refreshed.statusCode).toBe(200);
      expect(JSON.parse(refreshed.payload).accessToken).toBeUndefined();
      expect(setCookieFor(refreshed, '__Host-copalibre_session')).toContain('HttpOnly');
      const rotatedCookie = refreshCookieFrom(refreshed);
      expect(rotatedCookie).not.toBe(cookie);
    });

    it('allows 30 refreshes per principal across cookie rotation and client IP changes, then returns 429', async () => {
      const rateLimitEmail = 'refresh-rate-limit@example.com';
      const rateLimitPassword = 'rate-limit-secret-password';
      await (scratch.db as Kysely<Database>)
        .insertInto('identity_principals')
        .values({
          principal_id: newId(),
          email: rateLimitEmail,
          password_hash: await argon2.hash(rateLimitPassword),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
      const login = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: rateLimitEmail, password: rateLimitPassword },
        ip: '10.9.1.8',
      });
      let cookie = refreshCookieFrom(login);

      for (let attempt = 0; attempt < 30; attempt++) {
        const refreshed = await request({
          method: 'POST',
          url: '/api/auth/refresh',
          cookie,
          ip: `10.9.2.${attempt + 1}`,
        });
        expect(refreshed.statusCode).toBe(200);
        cookie = refreshCookieFrom(refreshed);
      }

      expect(
        (await request({ method: 'POST', url: '/api/auth/refresh', cookie, ip: '10.9.3.1' }))
          .statusCode,
      ).toBe(429);
    });

    it('POST /auth/refresh with no cookie returns 401', async () => {
      const response = await request({ method: 'POST', url: '/api/auth/refresh', ip: '10.9.1.3' });
      expect(response.statusCode).toBe(401);
    });

    it('POST /auth/refresh rejects a replayed (already-consumed) refresh token', async () => {
      const ip = '10.9.1.4';
      const login = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
        ip,
      });
      const cookie = refreshCookieFrom(login);

      const first = await request({ method: 'POST', url: '/api/auth/refresh', cookie, ip });
      expect(first.statusCode).toBe(200);

      const replay = await request({ method: 'POST', url: '/api/auth/refresh', cookie, ip });
      expect(replay.statusCode).toBe(401);
    });

    it('POST /auth/logout revokes the refresh cookie so a later refresh with it fails', async () => {
      const ip = '10.9.1.5';
      const login = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
        ip,
      });
      const cookie = refreshCookieFrom(login);

      const logout = await request({ method: 'POST', url: '/api/auth/logout', cookie, ip });
      expect(logout.statusCode).toBe(200);
      for (const name of [
        '__Host-copalibre_session',
        'copalibre_csrf',
        'copalibre_refresh_token',
      ]) {
        expect(setCookieFor(logout, name)).toContain('Max-Age=0');
      }

      const refreshAfterLogout = await request({
        method: 'POST',
        url: '/api/auth/refresh',
        cookie,
        ip,
      });
      expect(refreshAfterLogout.statusCode).toBe(401);
    });

    it('POST /auth/logout with no cookie still returns 200', async () => {
      const response = await request({ method: 'POST', url: '/api/auth/logout', ip: '10.9.1.6' });
      expect(response.statusCode).toBe(200);
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
        url: '/api/auth/pat',
        token: 'admin-token',
        payload: {
          label: 'Test Token',
          scopes: ['copalibre.control'],
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
        url: '/api/auth/pat',
        token: 'admin-token',
      });
      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data).toHaveLength(1);
      expect(data[0].tokenId).toBe(tokenId);
    });

    it('dry-runs, revokes, and restores an unused PAT without preview writes', async () => {
      const preview = await request({
        method: 'DELETE',
        url: `/api/auth/pat/${tokenId}?dryRun=true`,
        token: 'admin-token',
      });
      expect(preview.statusCode).toBe(200);
      expect(JSON.parse(preview.payload)).toMatchObject({
        dryRun: true,
        reversible: true,
        tokens: 1,
      });
      const beforeRevoke = await (scratch.db as Kysely<Database>)
        .selectFrom('personal_access_tokens')
        .select(['revoked_at', 'deleted_at'])
        .where('token_id', '=', tokenId)
        .executeTakeFirstOrThrow();
      expect(beforeRevoke).toEqual({ revoked_at: null, deleted_at: null });

      const response = await request({
        method: 'DELETE',
        url: `/api/auth/pat/${tokenId}`,
        token: 'admin-token',
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toMatchObject({
        dryRun: false,
        reversible: true,
        tokens: 1,
      });

      const getResponse = await request({
        method: 'GET',
        url: '/api/auth/pat',
        token: 'admin-token',
      });
      expect(JSON.parse(getResponse.payload)).toHaveLength(0);

      const restored = await request({
        method: 'POST',
        url: `/api/auth/pat/${tokenId}/restore`,
        token: 'admin-token',
      });
      expect(restored.statusCode).toBe(200);
      expect(JSON.parse(restored.payload)).toMatchObject({ tokenId, revoked: false });
    });

    it('dry-runs and confirms an in-use PAT revoke as irreversible', async () => {
      const created = await request({
        method: 'POST',
        url: '/api/auth/pat',
        token: 'admin-token',
        payload: { label: 'Used Token', scopes: ['copalibre.control'], expiresInDays: 30 },
      });
      const usedTokenId = JSON.parse(created.payload).tokenId as string;
      await new PersonalAccessTokenRepository(scratch.db as Kysely<Database>).touchLastUsed(
        usedTokenId,
      );

      const preview = await request({
        method: 'DELETE',
        url: `/api/auth/pat/${usedTokenId}?dryRun=true`,
        token: 'admin-token',
      });
      expect(preview.statusCode).toBe(200);
      expect(JSON.parse(preview.payload)).toMatchObject({
        dryRun: true,
        reversible: false,
        tokens: 1,
      });
      const stillActive = await (scratch.db as Kysely<Database>)
        .selectFrom('personal_access_tokens')
        .select(['revoked_at', 'deleted_at'])
        .where('token_id', '=', usedTokenId)
        .executeTakeFirstOrThrow();
      expect(stillActive).toEqual({ revoked_at: null, deleted_at: null });

      const revoked = await request({
        method: 'DELETE',
        url: `/api/auth/pat/${usedTokenId}`,
        token: 'admin-token',
      });
      expect(revoked.statusCode).toBe(200);
      expect(JSON.parse(revoked.payload)).toMatchObject({
        dryRun: false,
        reversible: false,
        tokens: 1,
      });

      const audit = await (scratch.db as Kysely<Database>)
        .selectFrom('audit_log')
        .select(['actor', 'resulting_state'])
        .where('entity_type', '=', 'personal-access-token')
        .where('entity_id', '=', usedTokenId)
        .where('action', '=', 'pat.revoked')
        .executeTakeFirstOrThrow();
      expect(audit).toMatchObject({
        actor: 'user:550e8400-e29b-41d4-a716-446655440000',
        resulting_state: { revoked: true, reversible: false, tokens: 1 },
      });
    });

    // Scope policy regression cases. Each rejection case asserts the
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
        url: '/api/auth/pat',
        token: 'superadmin-token',
        payload: { label: 'Subset Token', scopes: ['copalibre.control'], expiresInDays: 30 },
      });
      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.payload).scopes).toEqual(['copalibre.control']);
    });

    it('GET /auth/pat/scopes returns only grantable caller scopes', async () => {
      const response = await request({
        method: 'GET',
        url: '/api/auth/pat/scopes',
        token: 'superadmin-token',
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ scopes: ['copalibre.control'] });
    });

    it('POST /auth/pat requires explicitly selected scopes', async () => {
      const before = await patCount('550e8400-e29b-41d4-a716-446655440000');
      const response = await request({
        method: 'POST',
        url: '/api/auth/pat',
        token: 'admin-token',
        payload: { label: 'Default Scopes Token', expiresInDays: 30 },
      });
      expect(response.statusCode).toBe(400);
      expect(await patCount('550e8400-e29b-41d4-a716-446655440000')).toBe(before);
    });

    it('POST /auth/pat requesting a scope the caller does not hold returns 403 and persists nothing', async () => {
      const before = await patCount('550e8400-e29b-41d4-a716-446655440000');
      const response = await request({
        method: 'POST',
        url: '/api/auth/pat',
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
        url: '/api/auth/pat',
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

    it('POST /auth/pat rejects null or an empty scopes array', async () => {
      const before = await patCount('550e8400-e29b-41d4-a716-446655440000');
      const nullResponse = await request({
        method: 'POST',
        url: '/api/auth/pat',
        token: 'admin-token',
        payload: { label: 'Null Scopes Token', scopes: null, expiresInDays: 30 },
      });
      expect(nullResponse.statusCode).toBe(400);

      const emptyResponse = await request({
        method: 'POST',
        url: '/api/auth/pat',
        token: 'admin-token',
        payload: { label: 'Empty Scopes Token', scopes: [], expiresInDays: 30 },
      });
      expect(emptyResponse.statusCode).toBe(400);
      expect(await patCount('550e8400-e29b-41d4-a716-446655440000')).toBe(before);
    });

    it('POST /auth/pat rejects non-string scope entries with 400', async () => {
      const before = await patCount('550e8400-e29b-41d4-a716-446655440000');
      const response = await request({
        method: 'POST',
        url: '/api/auth/pat',
        token: 'admin-token',
        payload: { label: 'Bad Shape', scopes: [42], expiresInDays: 30 },
      });
      expect(response.statusCode).toBe(400);
      expect(await patCount('550e8400-e29b-41d4-a716-446655440000')).toBe(before);
    });
  });

  // per-IP rate limiting on the unauthenticated brute-forceable
  // endpoints. Every case sends an explicit X-Forwarded-For so it owns a
  // fresh bucket, independent of the requests the suites above already made.
  describe('auth endpoint rate limiting', () => {
    function fromIp(ip: string): (payload: unknown) => Promise<{ statusCode: number }> {
      return (payload) =>
        (app as NestFastifyApplication).inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { 'x-forwarded-for': ip },
          payload: payload as never,
        }) as unknown as Promise<{ statusCode: number }>;
    }

    afterEach(() => {
      vi.restoreAllMocks();
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
      const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + AUTH_THROTTLE_TTL_MS + 1);
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
        const response = await injectIp('/api/auth/forgot-password', { email: 'test@example.com' });
        expect(response.statusCode).toBe(200);
      }
      expect(
        (await injectIp('/api/auth/forgot-password', { email: 'test@example.com' })).statusCode,
      ).toBe(429);

      // Separate route, separate bucket — but the same per-IP window applies.
      // A too-short password keeps the response deterministic (400) while the
      // request is still being evaluated.
      for (let i = 0; i < AUTH_THROTTLE_LIMIT; i++) {
        const response = await injectIp('/api/auth/reset-password', {
          token: 'irrelevant',
          newPassword: 'short',
        });
        expect(response.statusCode).toBe(400);
      }
      const overLimit = await injectIp('/api/auth/reset-password', {
        token: 'irrelevant',
        newPassword: 'short',
      });
      expect(overLimit.statusCode).toBe(429);
    });

    it('rejects undeclared body properties with 400 before handler execution on unauthenticated endpoints', async () => {
      const response = await request({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          unexpectedSecurityField: 'malformed-or-injected',
        },
      });
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.errorCode).toBe('bad-request');
      expect(body.message).toContain('property unexpectedSecurityField should not exist');
    });

    it('rejects undeclared body properties on protected token creation endpoint', async () => {
      const response = await request({
        method: 'POST',
        url: '/api/auth/pat',
        token: 'admin-token',
        payload: {
          label: 'Test PAT',
          expiresInDays: 30,
          injectedScope: 'super-admin',
        },
      });
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.errorCode).toBe('bad-request');
      expect(body.message).toContain('property injectedScope should not exist');
    });
  });
});
