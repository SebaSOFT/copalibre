import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiValidationPipe } from '../http/validation.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrincipalThrottlerGuard } from '../auth/principal-throttler.guard.js';
import { Test } from '@nestjs/testing';
import { AuditReader } from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { API_BODY_LIMIT_BYTES } from '../http-body-limit.js';
import { InvitationAcceptanceController } from './organization-access.controller.js';
import { InstallationBootstrapController } from './installation-bootstrap.controller.js';
import { AUTH_THROTTLE_LIMIT as BOOTSTRAP_THROTTLE_LIMIT } from './auth.controller.js';

class BootstrapTokenVerifier {
  verify(token: string): Promise<AuthenticatedSubject> {
    if (token !== 'accept-invitation') return Promise.reject(new Error('unknown token'));
    return Promise.resolve({
      subjectId: 'oidc-admin-1',
      scopes: ['copalibre.invite.accept'],
      email: 'admin@example.test',
      emailVerified: true,
    });
  }
}

describe('installation bootstrap (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  const originalEnvironment = {
    bootstrapToken: process.env.COPALIBRE_BOOTSTRAP_TOKEN,
    appUrl: process.env.COPALIBRE_APP_URL,
  };

  beforeAll(async () => {
    process.env.COPALIBRE_BOOTSTRAP_TOKEN = 'bootstrap-secret';
    process.env.COPALIBRE_APP_URL = 'https://copalibre.example';
    scratch = await createMigratedDatabase('bootstrap');

    @Module({
      controllers: [InstallationBootstrapController, InvitationAcceptanceController],
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }])],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        { provide: TokenVerifier, useValue: new BootstrapTokenVerifier() },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: API_BODY_LIMIT_BYTES, trustProxy: true }),
    );
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
    restore('COPALIBRE_BOOTSTRAP_TOKEN', originalEnvironment.bootstrapToken);
    restore('COPALIBRE_APP_URL', originalEnvironment.appUrl);
  });

  it('creates and accepts exactly one first administrator through audit and outbox', async () => {
    const created = await request({
      method: 'POST',
      url: '/installation/bootstrap/admin',
      headers: { 'x-copalibre-bootstrap-token': 'bootstrap-secret' },
      payload: {
        organizationAlias: 'liga-orbital',
        organizationName: 'Liga Orbital',
        email: 'admin@example.test',
      },
    });

    expect(created.statusCode).toBe(201);
    const setupUrl = new URL(created.json().setupUrl);
    const invitationToken = setupUrl.searchParams.get('token');
    expect(invitationToken).toBeTruthy();

    const accepted = await request({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: 'Bearer accept-invitation' },
      payload: { token: invitationToken },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ role: 'admin', status: 'active' });

    const assignments = await scratch.db
      .selectFrom('organization_role_assignments')
      .selectAll()
      .execute();
    expect(assignments).toHaveLength(1);
    const assignment = assignments[0];
    if (!assignment) throw new Error('Expected the bootstrap administrator assignment');
    expect(assignment).toMatchObject({ role: 'admin', status: 'active' });

    const audit = await new AuditReader(scratch.db).historyFor(
      'organization-role-assignment',
      assignment.assignment_id,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'organization.role-assigned' });

    const rejected = await request({
      method: 'POST',
      url: '/installation/bootstrap/admin',
      headers: { 'x-copalibre-bootstrap-token': 'bootstrap-secret' },
      payload: {
        organizationAlias: 'segunda-liga',
        organizationName: 'Segunda Liga',
        email: 'other@example.test',
      },
    });
    expect(rejected.statusCode).toBe(409);
  });

  // the global ValidationPipe rejects a body failing its DTO with 400
  // at the edge, before the handler runs.
  it('rejects a bootstrap payload missing the administrator email with 400', async () => {
    const response = await request({
      method: 'POST',
      url: '/installation/bootstrap/admin',
      headers: { 'x-copalibre-bootstrap-token': 'bootstrap-secret' },
      payload: {
        organizationAlias: 'liga-validacion',
        organizationName: 'Liga Validación',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  function request(options: {
    method: 'POST';
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  }) {
    return (app as NestFastifyApplication).inject({
      method: options.method,
      url: options.url,
      headers: options.headers,
      payload: options.payload as never,
    });
  }

  it('rejects bootstrap attempts exceeding the per-IP window with 429', async () => {
    const attempt = () =>
      request({
        method: 'POST',
        url: '/installation/bootstrap/admin',
        headers: {
          'x-copalibre-bootstrap-token': 'wrong-secret',
          'x-forwarded-for': '10.9.1.1',
        },
        payload: {
          organizationAlias: 'liga-orbital',
          organizationName: 'Liga Orbital',
          email: 'admin@example.test',
        },
      });

    // Wrong secret → 403 while under the limit; the bucket fills regardless.
    for (let i = 0; i < BOOTSTRAP_THROTTLE_LIMIT; i++) {
      expect((await attempt()).statusCode).toBe(403);
    }
    expect((await attempt()).statusCode).toBe(429);
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
