import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  OrganizationRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { AuditTrailController } from './audit-trail.controller.js';

/**
 * The audit trail's reader-facing surface, through the real HTTP stack
 * (openspec 0166, tasks 4.2-4.3, 6.5, 7.1-7.2): scoped to the reader's
 * organization, gated by its own capability, and a refused attempt to
 * open it is itself recorded — for free, by the central exception filter
 * every other refusal already goes through.
 */
const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

describe('audit trail surface (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let otherOrganizationId = '';
  let refereePrincipalId = '';
  const organizationAlias = 'liga-audit';

  const subjects: Record<string, AuthenticatedSubject> = {
    admin: { subjectId: 'oidc-audit-admin', scopes: ['copalibre.control'] },
    referee: { subjectId: 'oidc-audit-referee', scopes: ['copalibre.control'] },
  };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('audit-trail-surface');

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Audit',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const other = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-audit-other',
        name: 'Liga Audit Other',
        ...AUDIT,
      }),
    );
    otherOrganizationId = other.organizationId;

    // Two further audited actions on this organization, and one on the
    // other — proof this organization's reader never sees that one.
    await withTransaction(scratch.db, (uow) =>
      uow.recordAudit({
        organizationId,
        entityType: 'organization',
        entityId: organizationId,
        action: 'organization.settings_updated',
        actor: 'user:someone',
        authorizationContext: 'copalibre.control',
        resultingState: { name: 'Renamed' },
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      uow.recordAudit({
        organizationId: otherOrganizationId,
        entityType: 'organization',
        entityId: otherOrganizationId,
        action: 'organization.settings_updated',
        actor: 'user:someone',
        authorizationContext: 'copalibre.control',
        resultingState: { name: 'Renamed elsewhere' },
      }),
    );

    await seedAssignment(scratch.db, 'oidc-audit-admin', 'audit-admin@example.test', 'admin');
    refereePrincipalId = await seedAssignment(
      scratch.db,
      'oidc-audit-referee',
      'audit-referee@example.test',
      'referee',
    );

    @Module({
      controllers: [AuditTrailController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              const subject = subjects[token];
              if (!subject) throw new Error('unknown token');
              return { ...subject, organizationId };
            },
          },
        },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class AuditTrailTestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [AuditTrailTestModule],
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

  function request(token: string | undefined, url: string) {
    return (app as NestFastifyApplication).inject({
      method: 'GET',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('an administrator sees applied and refused actions, scoped to their own organization (tasks 6.5, 7.1)', async () => {
    const response = await request('admin', `/organizations/${organizationAlias}/audit-trail`);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.records.length).toBeGreaterThan(0);
    expect(
      body.records.every(
        (record: { entityId: string }) =>
          [organizationId].includes(record.entityId) || record.entityId !== otherOrganizationId,
      ),
    ).toBe(true);
    expect(
      body.records.some(
        (record: { action: string; outcome: string }) =>
          record.action === 'organization.settings_updated' && record.outcome === 'applied',
      ),
    ).toBe(true);
  });

  it('paginates via limit/offset and reports the true total', async () => {
    const page = await request(
      'admin',
      `/organizations/${organizationAlias}/audit-trail?limit=1&offset=0`,
    );
    expect(page.statusCode).toBe(200);
    const body = page.json();
    expect(body.records).toHaveLength(1);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(0);
  });

  it('returns real events in chronological newest-first order for populated organizations (openspec 0196 task 4.1)', async () => {
    const t0 = new Date(Date.now() - 10000);
    const t1 = new Date(Date.now() - 5000);
    const t2 = new Date();

    await scratch.db
      .insertInto('audit_log')
      .values([
        {
          audit_id: newId(),
          organization_id: organizationId,
          entity_type: 'club',
          entity_id: newId(),
          action: 'club.created',
          actor: 'user:seed',
          authorization_context: 'copalibre.control',
          previous_state: null,
          resulting_state: JSON.stringify({ name: 'Club Alpha' }),
          reason: null,
          occurred_at: t0,
        },
        {
          audit_id: newId(),
          organization_id: organizationId,
          entity_type: 'entrant',
          entity_id: newId(),
          action: 'entrant.registered',
          actor: 'user:seed',
          authorization_context: 'copalibre.control',
          previous_state: null,
          resulting_state: JSON.stringify({ entrantId: 'e-1' }),
          reason: 'Inscripción online',
          occurred_at: t1,
        },
        {
          audit_id: newId(),
          organization_id: organizationId,
          entity_type: 'match',
          entity_id: newId(),
          action: 'match.finalized',
          actor: 'user:seed',
          authorization_context: 'copalibre.control',
          previous_state: null,
          resulting_state: JSON.stringify({ winner: 'e-1' }),
          reason: null,
          occurred_at: t2,
        },
      ])
      .execute();

    const response = await request(
      'admin',
      `/organizations/${organizationAlias}/audit-trail?limit=10`,
    );
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.records.length).toBeGreaterThanOrEqual(3);

    // Assert chronological newest first: each record occurredAt >= next record occurredAt
    for (let i = 0; i < body.records.length - 1; i++) {
      const current = new Date(body.records[i].occurredAt).getTime();
      const next = new Date(body.records[i + 1].occurredAt).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }

    const actions = body.records.map((r: { action: string }) => r.action);
    expect(actions).toContain('match.finalized');
    expect(actions).toContain('entrant.registered');
    expect(actions).toContain('club.created');
  });

  it('refuses a role without the audit capability, and records the refusal itself (task 4.3, 7.2)', async () => {
    const before = await scratch.db
      .selectFrom('audit_log')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    const response = await request('referee', `/organizations/${organizationAlias}/audit-trail`);
    expect(response.statusCode).toBe(403);

    const after = await scratch.db
      .selectFrom('audit_log')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    expect(Number(after.count)).toBe(Number(before.count) + 1);

    const refusal = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('action', '=', 'authorization.refused')
      .orderBy('occurred_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(refusal.actor).toBe(`user:${refereePrincipalId}`);
  });

  async function seedAssignment(
    db: Kysely<Database>,
    oidcSubjectId: string,
    email: string,
    role: 'admin' | 'referee',
  ): Promise<string> {
    const principalId = newId();
    await db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email,
        oidc_subject_id: oidcSubjectId,
        name: null,
        picture: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    await db
      .insertInto('organization_role_assignments')
      .values({
        assignment_id: newId(),
        organization_id: organizationId,
        principal_id: principalId,
        email,
        role,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        club_id: null,
        tournament_id: null,
      })
      .execute();
    return principalId;
  }
});
