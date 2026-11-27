import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import type { Kysely } from 'kysely';
import { newId, type Database } from '@copalibre/persistence';
import type { SessionCookieConfig } from '@copalibre/auth';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { CsrfGuard } from '../auth/csrf.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { getLocalKeys } from '../auth/local-signing-keys.js';
import { PrincipalThrottlerGuard } from '../auth/principal-throttler.guard.js';
import { SESSION_COOKIE_CONFIG } from '../auth/session-cookie-config.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { applyApiPathPrefix } from '../http/api-path-prefix.js';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { sessionCookieProblem } from '../readiness.js';
import { NativeAuthController } from './auth.controller.js';
import { OrganizationsController } from './organizations.controller.js';

const NATIVE_ISSUER = 'http://localhost:8080';
const EXTERNAL_ISSUER = 'https://idp.example.test/';
const AUDIENCE = 'copalibre-cookie-test';

interface Response {
  readonly statusCode: number;
  readonly headers: Record<string, unknown>;
  readonly payload: string;
}

function setCookies(response: Response): string[] {
  const header = response.headers['set-cookie'];
  if (header === undefined) return [];
  return (Array.isArray(header) ? header : [header]).filter(
    (value): value is string => typeof value === 'string',
  );
}

function setCookieFor(response: Response, name: string): string | undefined {
  return setCookies(response).find((value) => value.startsWith(`${name}=`));
}

function pair(response: Response, name: string): string {
  const raw = setCookieFor(response, name);
  if (!raw) throw new Error(`no ${name} cookie`);
  return raw.split(';')[0] as string;
}

function valueOf(response: Response, name: string): string {
  return pair(response, name).slice(name.length + 1);
}

function attributes(raw: string | undefined): string[] {
  return (raw ?? '').split('; ').slice(1);
}

describe('browser session cookies', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let externalKey: CryptoKey;
  let externalJwk: JWK;
  const apps: NestFastifyApplication[] = [];
  const email = 'cookie-session@example.com';
  const password = 'cookie-session-password';
  let principalId: string;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of ['COPALIBRE_NATIVE_JWT_ISSUER', 'COPALIBRE_JWT_AUDIENCE']) {
      saved[key] = process.env[key];
    }
    process.env.COPALIBRE_NATIVE_JWT_ISSUER = NATIVE_ISSUER;
    process.env.COPALIBRE_JWT_AUDIENCE = AUDIENCE;

    scratch = await createMigratedDatabase('auth-cookie');
    principalId = newId();
    await (scratch.db as Kysely<Database>)
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email,
        password_hash: await argon2.hash(password),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();

    const pairKeys = await generateKeyPair('RS256');
    externalKey = pairKeys.privateKey;
    externalJwk = { ...(await exportJWK(pairKeys.publicKey)), kid: 'idp-1', alg: 'RS256' };
  });

  afterAll(async () => {
    for (const app of apps) await app.close();
    await scratch?.drop();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function buildApp(config: SessionCookieConfig): Promise<NestFastifyApplication> {
    const verifier = new TokenVerifier(
      {
        issuer: EXTERNAL_ISSUER,
        nativeIssuer: NATIVE_ISSUER,
        audience: AUDIENCE,
        jwksCacheMaxAgeMs: 60_000,
        clockToleranceSeconds: 0,
      },
      createLocalJWKSet({ keys: [externalJwk] }),
      createLocalJWKSet({ keys: getLocalKeys().jwks.keys as JWK[] }),
    );

    @Module({
      controllers: [NativeAuthController, OrganizationsController],
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }])],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: OBJECT_STORAGE, useValue: {} },
        { provide: TokenVerifier, useValue: verifier },
        { provide: SESSION_COOKIE_CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
        Reflector,
      ],
    })
    class CookieModule {}

    const moduleRef = await Test.createTestingModule({ imports: [CookieModule] }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: true }),
    );
    applyApiPathPrefix(app);
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    apps.push(app);
    return app;
  }

  let ipCounter = 0;
  function nextIp(): string {
    ipCounter += 1;
    return `10.44.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
  }

  async function login(app: NestFastifyApplication): Promise<Response> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-for': nextIp() },
      payload: { email, password },
    });
    expect(response.statusCode).toBe(200);
    return response;
  }

  async function externalToken(
    claims: Record<string, unknown> = {},
    options: { issuer?: string; audience?: string; expiresIn?: string; key?: CryptoKey } = {},
  ): Promise<string> {
    return new SignJWT({ scp: 'copalibre.control', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'idp-1' })
      .setSubject('idp-subject-1')
      .setIssuer(options.issuer ?? EXTERNAL_ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '10m')
      .sign(options.key ?? externalKey);
  }

  describe('over HTTPS', () => {
    const SECURE = { secure: true } as const;
    const SESSION = '__Host-copalibre_session';
    let app: NestFastifyApplication;

    beforeAll(async () => {
      app = await buildApp(SECURE);
    });

    it('native login sets the session, CSRF and refresh cookies with their attributes, and no token in the body', async () => {
      const response = await login(app);
      const body = JSON.parse(response.payload);
      expect(body.accessToken).toBeUndefined();
      expect(body).toMatchObject({ subject: principalId, method: 'native' });
      expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());

      const session = attributes(setCookieFor(response, SESSION));
      expect(session).toEqual(
        expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']),
      );
      expect(session.some((attribute) => /^Domain=/i.test(attribute))).toBe(false);
      const maxAge = Number(session.find((a) => a.startsWith('Max-Age='))?.slice(8));
      expect(maxAge).toBeGreaterThan(3500);
      expect(maxAge).toBeLessThanOrEqual(3600);

      const csrf = attributes(setCookieFor(response, 'copalibre_csrf'));
      expect(csrf).not.toContain('HttpOnly');
      expect(csrf).toEqual(expect.arrayContaining(['Secure', 'SameSite=Strict', 'Path=/']));
      expect(attributes(setCookieFor(response, 'copalibre_refresh_token'))).toContain('Secure');
    });

    it('GET /auth/session answers metadata from the cookie, and 401 without it', async () => {
      const response = await login(app);
      const metadata = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: pair(response, SESSION) },
      });
      expect(metadata.statusCode).toBe(200);
      const body = JSON.parse(metadata.payload);
      expect(body).toMatchObject({ subject: principalId, method: 'native' });
      expect(metadata.payload).not.toContain(valueOf(response, SESSION));

      const anonymous = await app.inject({ method: 'GET', url: '/api/auth/session' });
      expect(anonymous.statusCode).toBe(401);
    });

    it('authenticates a protected GET from the cookie alone', async () => {
      const response = await login(app);
      const organizations = await app.inject({
        method: 'GET',
        url: '/api/organizations?mine=true',
        headers: { cookie: pair(response, SESSION) },
      });
      expect(organizations.statusCode).toBe(200);
    });

    it('refresh replaces the session cookie and returns metadata without the token', async () => {
      const response = await login(app);
      const refreshed = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          'x-forwarded-for': nextIp(),
          cookie: pair(response, 'copalibre_refresh_token'),
        },
      });
      expect(refreshed.statusCode).toBe(200);
      expect(JSON.parse(refreshed.payload).accessToken).toBeUndefined();
      expect(valueOf(refreshed, SESSION)).not.toBe(valueOf(response, SESSION));
      expect(setCookieFor(refreshed, 'copalibre_csrf')).toBeDefined();
    });

    describe('CSRF on cookie-authenticated unsafe requests', () => {
      async function logoutWith(headers: Record<string, string>): Promise<Response> {
        return app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { 'x-forwarded-for': nextIp(), ...headers },
        });
      }

      it('refuses a missing CSRF header with 403 and the standard envelope', async () => {
        const response = await login(app);
        const refused = await logoutWith({
          cookie: `${pair(response, SESSION)}; ${pair(response, 'copalibre_csrf')}`,
        });
        expect(refused.statusCode).toBe(403);
        expect(JSON.parse(refused.payload)).toMatchObject({ errorCode: 'auth-csrf' });
        expect(setCookies(refused)).toEqual([]);
      });

      it('refuses a header that does not match the cookie', async () => {
        const response = await login(app);
        const refused = await logoutWith({
          cookie: `${pair(response, SESSION)}; ${pair(response, 'copalibre_csrf')}`,
          'x-copalibre-csrf': 'something-else',
        });
        expect(refused.statusCode).toBe(403);
      });

      it('refuses a matching pair issued for another session', async () => {
        const mine = await login(app);
        const other = await login(app);
        const foreign = valueOf(other, 'copalibre_csrf');
        const refused = await logoutWith({
          cookie: `${pair(mine, SESSION)}; copalibre_csrf=${foreign}`,
          'x-copalibre-csrf': foreign,
        });
        expect(refused.statusCode).toBe(403);
      });

      it('accepts the matching header and clears all three cookies', async () => {
        const response = await login(app);
        const accepted = await logoutWith({
          cookie: `${pair(response, SESSION)}; ${pair(response, 'copalibre_csrf')}`,
          'x-copalibre-csrf': valueOf(response, 'copalibre_csrf'),
        });
        expect(accepted.statusCode).toBe(200);
        for (const name of [SESSION, 'copalibre_csrf', 'copalibre_refresh_token']) {
          expect(setCookieFor(accepted, name)).toContain('Max-Age=0');
        }
      });

      it('needs no CSRF header from a Bearer client', async () => {
        const token = await externalToken();
        const accepted = await logoutWith({ authorization: `Bearer ${token}` });
        expect(accepted.statusCode).toBe(200);
      });
    });

    describe('POST /auth/session handover', () => {
      async function handOver(token: string | undefined): Promise<Response> {
        return app.inject({
          method: 'POST',
          url: '/api/auth/session',
          headers: {
            'x-forwarded-for': nextIp(),
            ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
          },
        });
      }

      it('turns a valid provider token into a cookie session', async () => {
        const token = await externalToken({ jti: 'idp-jti-1' });
        const response = await handOver(token);
        expect(response.statusCode).toBe(200);
        expect(response.payload).not.toContain(token);
        expect(JSON.parse(response.payload)).toMatchObject({
          subject: 'idp-subject-1',
          method: 'oidc',
          scopes: ['copalibre.control'],
        });
        expect(valueOf(response, SESSION)).toBe(token);
        expect(setCookieFor(response, 'copalibre_csrf')).toBeDefined();
        expect(setCookieFor(response, 'copalibre_refresh_token')).toBeUndefined();

        const metadata = await app.inject({
          method: 'GET',
          url: '/api/auth/session',
          headers: { cookie: pair(response, SESSION) },
        });
        expect(JSON.parse(metadata.payload)).toMatchObject({ method: 'oidc' });
      });

      it('replaces the cookie on silent renewal', async () => {
        const first = await handOver(await externalToken({ jti: 'renew-1' }, { expiresIn: '5m' }));
        const renewed = await handOver(
          await externalToken({ jti: 'renew-2' }, { expiresIn: '20m' }),
        );
        expect(valueOf(renewed, SESSION)).not.toBe(valueOf(first, SESSION));
        const maxAge = Number(
          attributes(setCookieFor(renewed, SESSION))
            .find((a) => a.startsWith('Max-Age='))
            ?.slice(8),
        );
        expect(maxAge).toBeGreaterThan(1100);
      });

      it.each([
        ['no token', async () => undefined],
        ['a personal access token', async () => 'clpat_not-a-jwt'],
        [
          'a bad signature',
          async () => {
            const other = await generateKeyPair('RS256');
            return externalToken({}, { key: other.privateKey });
          },
        ],
        ['a wrong audience', async () => externalToken({}, { audience: 'someone-else' })],
        ['a wrong issuer', async () => externalToken({}, { issuer: 'https://evil.example/' })],
        ['an expired token', async () => externalToken({}, { expiresIn: '-1m' })],
        [
          'a native token',
          async () => {
            const response = await login(app);
            return valueOf(response, SESSION);
          },
        ],
      ])('refuses %s with 401 and sets no cookie', async (_label, make) => {
        const response = await handOver(await make());
        expect(response.statusCode).toBe(401);
        expect(setCookies(response)).toEqual([]);
      });

      it('refuses an oversized token naming the limit, and sets no cookie', async () => {
        const token = await externalToken({ padding: 'x'.repeat(5000) });
        const response = await handOver(token);
        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.errorCode).toBe('auth-token-too-large');
        expect(body.message).toContain('4096');
        expect(setCookies(response)).toEqual([]);
      });
    });
  });

  describe('over plain HTTP', () => {
    it('drops Secure and the __Host- prefix and keeps every other attribute', async () => {
      const app = await buildApp({ secure: false });
      const response = await login(app);
      expect(setCookieFor(response, '__Host-copalibre_session')).toBeUndefined();
      const session = attributes(setCookieFor(response, 'copalibre_session'));
      expect(session).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Strict', 'Path=/']));
      expect(session).not.toContain('Secure');
      expect(attributes(setCookieFor(response, 'copalibre_csrf'))).not.toContain('Secure');
      expect(attributes(setCookieFor(response, 'copalibre_refresh_token'))).not.toContain('Secure');

      const metadata = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: pair(response, 'copalibre_session') },
      });
      expect(metadata.statusCode).toBe(200);
    });
  });

  describe('readiness', () => {
    it('fails when Secure is off and the public URL is https', () => {
      expect(
        sessionCookieProblem({
          COPALIBRE_SESSION_COOKIE_SECURE: 'false',
          COPALIBRE_APP_URL: 'https://copa.example.test',
        }),
      ).toMatch(/COPALIBRE_SESSION_COOKIE_SECURE=false/);
    });

    it('passes when the setting agrees, or the URL is plain HTTP', () => {
      expect(
        sessionCookieProblem({
          COPALIBRE_SESSION_COOKIE_SECURE: 'true',
          COPALIBRE_APP_URL: 'https://copa.example.test',
        }),
      ).toBeUndefined();
      expect(
        sessionCookieProblem({
          COPALIBRE_SESSION_COOKIE_SECURE: 'false',
          COPALIBRE_APP_URL: 'http://192.168.1.10',
        }),
      ).toBeUndefined();
    });
  });
});
