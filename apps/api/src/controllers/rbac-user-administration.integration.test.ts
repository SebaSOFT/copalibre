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
import {
  InstallationRoleController,
  OrganizationAccessController,
} from './organization-access.controller.js';

const subjects: Record<string, AuthenticatedSubject> = {
  admin: { subjectId: 'oidc-rbac-admin', scopes: ['copalibre.control'] },
  clubAdmin: { subjectId: 'oidc-rbac-club-admin', scopes: ['copalibre.control'] },
  superAdmin: { subjectId: 'oidc-rbac-super-admin', scopes: ['copalibre.super-admin'] },
  noScope: { subjectId: 'oidc-rbac-no-scope', scopes: ['copalibre.control'] },
};

describe('RBAC user administration (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let adminAssignmentId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('rbac-user-administration');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-rbac-api',
        name: 'Liga RBAC API',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;
    adminAssignmentId = await seedRole(
      scratch.db,
      'oidc-rbac-admin',
      'rbac-admin@example.test',
      'admin',
      'active',
    );
    await seedRole(
      scratch.db,
      'oidc-rbac-club-admin',
      'rbac-club-admin@example.test',
      'club-admin',
      'active',
    );

    @Module({
      controllers: [OrganizationAccessController, InstallationRoleController],
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
    class RbacTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [RbacTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  describe('grantable roles', () => {
    it("lists the organization admin's grantable roles per the hierarchy", async () => {
      const response = await request('admin', `/organizations/liga-rbac-api/roles/grantable`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        roles: ['admin', 'club-admin', 'referee', 'broadcaster', 'viewer'],
      });
    });

    it('refuses a club-admin (no grant authority, not even reaching the hierarchy check)', async () => {
      const response = await request('clubAdmin', `/organizations/liga-rbac-api/roles/grantable`);
      expect(response.statusCode).toBe(403);
    });
  });

  describe('organization admin hierarchy', () => {
    it('lets an organization admin invite a club-admin', async () => {
      const response = await post('admin', `/organizations/liga-rbac-api/invitations`, {
        email: 'new-club-admin@example.test',
        role: 'club-admin',
        status: 'active',
      });
      expect(response.statusCode).toBe(201);
    });

    it('lets an organization admin invite a referee', async () => {
      const response = await post('admin', `/organizations/liga-rbac-api/invitations`, {
        email: 'new-referee@example.test',
        role: 'referee',
        status: 'active',
      });
      expect(response.statusCode).toBe(201);
    });
  });

  describe('last-active-admin floor invariant', () => {
    it('refuses demoting the sole active admin with 409', async () => {
      const response = await patch(
        'admin',
        `/organizations/liga-rbac-api/roles/${adminAssignmentId}`,
        {
          role: 'viewer',
          status: 'active',
        },
      );
      expect(response.statusCode).toBe(409);
    });

    it('refuses deleting the sole active admin with 409', async () => {
      const response = await del(
        'admin',
        `/organizations/liga-rbac-api/roles/${adminAssignmentId}`,
      );
      expect(response.statusCode).toBe(409);
    });
  });

  describe('installation super-admin endpoints (RequireSuperAdmin only)', () => {
    it('refuses a caller without the super-admin scope with 403', async () => {
      const response = await request('noScope', '/installation/super-admins');
      expect(response.statusCode).toBe(403);
    });

    it('lets a super-admin scope holder create, list, and remove a super-admin, refusing the last one', async () => {
      const principalId = newId();
      await scratch.db
        .insertInto('identity_principals')
        .values({
          principal_id: principalId,
          email: 'new-super-admin@example.test',
          oidc_subject_id: null,
          name: null,
          picture: null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();

      const created = await post('superAdmin', '/installation/super-admins', { principalId });
      expect(created.statusCode).toBe(201);
      const assignmentId = created.json().assignmentId as string;

      const listed = await request('superAdmin', '/installation/super-admins');
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toContainEqual(
        expect.objectContaining({ assignmentId, principalId, status: 'active' }),
      );

      const removed = await del('superAdmin', `/installation/super-admins/${assignmentId}`);
      expect(removed.statusCode).toBe(409);
    });
  });

  function request(token: string, url: string) {
    return (app as NestFastifyApplication).inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function post(token: string, url: string, payload: unknown) {
    return (app as NestFastifyApplication).inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as never,
    });
  }

  function patch(token: string, url: string, payload: unknown) {
    return (app as NestFastifyApplication).inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as never,
    });
  }

  function del(token: string, url: string) {
    return (app as NestFastifyApplication).inject({
      method: 'DELETE',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function seedRole(
    db: Kysely<Database>,
    oidcSubjectId: string,
    email: string,
    role: 'admin' | 'club-admin' | 'referee' | 'broadcaster' | 'viewer',
    status: 'active' | 'inactive',
  ): Promise<string> {
    const principalId = newId();
    const assignmentId = newId();
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
        assignment_id: assignmentId,
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
    return assignmentId;
  }
});
