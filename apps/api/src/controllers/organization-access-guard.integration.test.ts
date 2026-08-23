import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  newId,
  ObjectMetadataRepository,
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
import { OrganizationsController } from './organizations.controller.js';
import { ParticipantsController } from './participants.controller.js';

const subjects: Record<string, AuthenticatedSubject> = {
  admin: { subjectId: 'oidc-admin', scopes: ['copalibre.control'] },
  inactive: { subjectId: 'oidc-inactive', scopes: ['copalibre.control'] },
  participant: { subjectId: 'oidc-participant', scopes: ['copalibre.participant'] },
  // Verifies fine but never accepted an invitation — no `identity_principals`
  // row at all (0063: `GET /organizations?mine=true` must still answer 200
  // with an empty list for this subject, not 403).
  noPrincipal: { subjectId: 'oidc-no-principal', scopes: ['copalibre.control'] },
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
      controllers: [OrganizationAccessController, OrganizationsController, ParticipantsController],
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

  describe('GET /organizations?mine=true', () => {
    it('lists exactly the organizations with an active assignment, with roles', async () => {
      const response = await request('admin', '/organizations?mine=true');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        {
          organizationId,
          organizationAlias: 'liga-segura',
          organizationName: 'Liga Segura',
          role: 'admin',
        },
      ]);
    });

    it('excludes an inactive assignment, leaving an empty list', async () => {
      const response = await request('inactive', '/organizations?mine=true');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('answers 200 with an empty list for a caller with no installation principal at all', async () => {
      const response = await request('noPrincipal', '/organizations?mine=true');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('400s when "mine=true" is not supplied', async () => {
      const missing = await request('admin', '/organizations');
      expect(missing.statusCode).toBe(400);

      const wrongValue = await request('admin', '/organizations?mine=false');
      expect(wrongValue.statusCode).toBe(400);
    });
  });

  describe('organization settings', () => {
    it('lets the active organization admin update the primary language', async () => {
      const response = await patch('admin', `/organizations/liga-segura/settings`, {
        primaryLanguage: 'fr',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ primaryLanguage: 'fr' });
    });

    it('refuses an inactive organization user', async () => {
      const response = await patch('inactive', `/organizations/liga-segura/settings`, {
        primaryLanguage: 'en',
      });
      expect(response.statusCode).toBe(403);
    });

    it('refuses a participant token', async () => {
      const response = await patch('participant', `/organizations/liga-segura/settings`, {
        primaryLanguage: 'en',
      });
      expect(response.statusCode).toBe(403);
    });

    it('409s an unsupported primary language', async () => {
      const response = await patch('admin', `/organizations/liga-segura/settings`, {
        primaryLanguage: 'ja',
      });
      expect(response.statusCode).toBe(409);
    });

    function patch(token: string, url: string, payload: unknown) {
      return (app as NestFastifyApplication).inject({
        method: 'PATCH',
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: payload as never,
      });
    }
  });

  describe('organization storage usage', () => {
    it('lets the active organization admin view storage usage', async () => {
      const repo = new ObjectMetadataRepository(scratch.db);
      const passed = await withTransaction(scratch.db, (uow) =>
        repo.save(uow, {
          organizationId,
          profile: 'filesystem',
          storageKey: `${organizationId}/photo.png`,
          contentType: 'image/png',
          sizeBytes: 1048576, // 1 MB
          uploadedBy: 'user:admin',
        }),
      );
      await repo.markPassed(passed.objectId);

      const response = await request('admin', `/organizations/liga-segura/storage-usage`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        totalBytes: 1048576,
        objectCount: 1,
      });
    });

    it('refuses an inactive organization user with 403', async () => {
      const response = await request('inactive', `/organizations/liga-segura/storage-usage`);
      expect(response.statusCode).toBe(403);
    });

    it('refuses a participant token with 403', async () => {
      const response = await request('participant', `/organizations/liga-segura/storage-usage`);
      expect(response.statusCode).toBe(403);
    });

    it('refuses an unknown organization alias with 403', async () => {
      const response = await request('admin', `/organizations/no-such-org/storage-usage`);
      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Requested organization does not exist');
    });
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
