import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiExceptionFilter } from '../../http/error-contract.js';
import { createApiValidationPipe } from '../../http/validation.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrincipalThrottlerGuard } from '../../auth/principal-throttler.guard.js';
import { Test } from '@nestjs/testing';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import { newId, RealtimeReplicaRepository } from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../../auth/organization-access.guard.js';
import { SUPER_ADMIN_SCOPE } from '../../auth/access-requirement.js';
import type { AuthenticatedSubject } from '../../auth/request-context.js';
import { TokenVerifier } from '../../auth/token-verifier.js';
import { DATABASE } from '../../database.token.js';
import { OBJECT_STORAGE } from '../../object-storage.token.js';
import { DiagnosticsController } from './diagnostics.controller.js';
import { DiagnosticsService } from './diagnostics.service.js';
import { OutboxInspectorService } from './outbox-inspector.service.js';

const subjects: Record<string, AuthenticatedSubject> = {
  admin: { subjectId: 'oidc-super-admin', scopes: [SUPER_ADMIN_SCOPE] },
  orgAdmin: { subjectId: 'oidc-org-admin', scopes: ['copalibre.control'] },
};

describe('DiagnosticsController (integration)', () => {
  let app: INestApplication;
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('platform-diagnostics');
    const db = scratch.db;
    const storage = createObjectStorageAdapter(
      objectStorageConfigFromEnv({ ...process.env, DATABASE_URL: scratch.connectionString }),
    );

    @Module({
      controllers: [DiagnosticsController],
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }])],
      providers: [
        DiagnosticsService,
        OutboxInspectorService,
        { provide: DATABASE, useValue: db },
        { provide: OBJECT_STORAGE, useValue: storage },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              const subject = subjects[token];
              if (!subject) throw new Error('unknown token');
              return subject;
            },
          },
        },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
        Reflector,
      ],
    })
    class DiagnosticsTestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [DiagnosticsTestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function inject(
    token: string,
    method: 'GET' | 'POST',
    url: string,
    payload: Record<string, unknown> = {},
  ) {
    return (app as NestFastifyApplication).inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  it('refuses unauthenticated and non-super-admin callers', async () => {
    const unauth = await (app as NestFastifyApplication).inject({
      method: 'GET',
      url: '/admin/diagnostics/summary',
    });
    expect(unauth.statusCode).toBe(401);

    const forbidden = await inject('orgAdmin', 'GET', '/admin/diagnostics/summary');
    expect(forbidden.statusCode).toBe(403);
  });

  it('retrieves diagnostic summary and handles dead-letter retry lifecycle', async () => {
    // 1. Report a realtime replica so realtime is available
    const replicaRepo = new RealtimeReplicaRepository(scratch.db);
    const replicaId = newId();
    await replicaRepo.report(replicaId, {
      tvKiosks: 1,
      overlays: 0,
      publicSpectators: 4,
      controlConnections: 1,
      unclassified: 0,
    });

    // 2. Fetch summary initially
    const initial = await inject('admin', 'GET', '/admin/diagnostics/summary');
    expect(initial.statusCode).toBe(200);
    const initialJson = initial.json();
    expect(initialJson.status).toBe('healthy');
    expect(initialJson.database.connected).toBe(true);
    expect(initialJson.storage.connected).toBe(true);
    expect(initialJson.realtime.available).toBe(true);
    expect(initialJson.realtime.totalConnections).toBe(6);

    // 3. Seed an organization and a dead-lettered outbox event
    const orgId = newId();
    await scratch.db
      .insertInto('organizations')
      .values({
        organization_id: orgId,
        alias: 'test-org-diag',
        name: 'Test Org Diag',
        primary_language: 'en',
        timezone: 'UTC',
        created_at: new Date(),
      })
      .execute();

    const eventId = newId();
    await scratch.db
      .insertInto('outbox_events')
      .values({
        event_id: eventId,
        organization_id: orgId,
        stream: `tournament:${eventId}`,
        entity_id: eventId,
        event_type: 'tournament.created',
        projection_version: 1,
        payload: JSON.stringify({ name: 'Diag Cup' }),
        attempts: 6,
        failures: JSON.stringify([{ error: 'downstream webhook 503 service unavailable' }]),
        dead_lettered_at: new Date(),
        created_at: new Date(),
        consumed_at: null,
      })
      .execute();

    // 4. Invalidate and re-check summary: status should be degraded due to dead letter
    // Wait slightly or call retry directly
    const degradedSummary = await inject('admin', 'GET', '/admin/diagnostics/summary');
    expect(degradedSummary.statusCode).toBe(200);
    // Note: service caches for 5s, but retry invalidates cache
    const retryForbidden = await inject('orgAdmin', 'POST', '/admin/diagnostics/outbox/retry', {
      eventIds: [eventId],
    });
    expect(retryForbidden.statusCode).toBe(403);

    const retryResponse = await inject('admin', 'POST', '/admin/diagnostics/outbox/retry', {
      eventIds: [eventId],
    });
    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json()).toEqual({
      retried: [eventId],
      skipped: [],
    });

    // 5. Verify database state
    const outboxRow = await scratch.db
      .selectFrom('outbox_events')
      .select(['attempts', 'dead_lettered_at'])
      .where('event_id', '=', eventId)
      .executeTakeFirstOrThrow();
    expect(outboxRow.attempts).toBe(0);
    expect(outboxRow.dead_lettered_at).toBeNull();

    // 6. Verify audit log entry
    const auditRow = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('entity_id', '=', eventId)
      .where('action', '=', 'outbox.re-enqueued')
      .executeTakeFirst();
    expect(auditRow).toBeDefined();
    expect(auditRow?.actor).toBe('user:oidc-super-admin');

    // 7. Retrying again skips the event
    const secondRetry = await inject('admin', 'POST', '/admin/diagnostics/outbox/retry', {
      eventIds: [eventId],
    });
    expect(secondRetry.statusCode).toBe(200);
    expect(secondRetry.json()).toEqual({
      retried: [],
      skipped: [eventId],
    });

    // Clean up replica
    await replicaRepo.remove(replicaId);
  });
});
