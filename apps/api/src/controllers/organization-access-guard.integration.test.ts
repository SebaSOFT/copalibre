import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  newId,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { OrganizationAccessController } from './organization-access.controller.js';
import { ParticipantsController } from './participants.controller.js';

const subjects: Record<string, AuthenticatedSubject> = {
  admin: { subjectId: 'oidc-admin', scopes: ['copalibre.control'] },
  inactive: { subjectId: 'oidc-inactive', scopes: ['copalibre.control'] },
  participant: { subjectId: 'oidc-participant', scopes: ['copalibre.participant'] },
};

describe('organization access guards (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('organization-access-guard');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-segura',
        name: 'Liga Segura',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;

    await seedRole(scratch.db, 'oidc-admin', 'admin@example.test', 'admin', 'active');
    await seedRole(scratch.db, 'oidc-inactive', 'inactive@example.test', 'viewer', 'inactive');

    @Module({
      controllers: [OrganizationAccessController, ParticipantsController],
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
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class AccessTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AccessTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('rejects a participant token that attempts a participant route without an identity link', async () => {
    const response = await request(
      'participant',
      `/organizations/liga-segura/participant/registrations`,
    );
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain('participant identity');
  });

  it('rejects a participant token on an operator-only route', async () => {
    const response = await request('participant', `/organizations/liga-segura/roles`);
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain('copalibre.control');
  });

  it('rejects an inactive organization user after authentication', async () => {
    const response = await request('inactive', `/organizations/liga-segura/roles`);
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain('no active organization role');
  });

  it('allows the active organization admin', async () => {
    const response = await request('admin', `/organizations/liga-segura/roles`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
  });

  function request(token: string, url: string) {
    return (app as NestFastifyApplication).inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function seedRole(
    db: Kysely<Database>,
    oidcSubjectId: string,
    email: string,
    role: 'admin' | 'viewer',
    status: 'active' | 'inactive',
  ): Promise<void> {
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
        status,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();
  }
});
