import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import { InstalledModuleRepository } from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import { SUPER_ADMIN_SCOPE } from '../auth/access-requirement.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { AdminModulesController } from './admin-modules.controller.js';

const subjects: Record<string, AuthenticatedSubject> = {
  admin: { subjectId: 'oidc-super-admin', scopes: [SUPER_ADMIN_SCOPE] },
  orgAdmin: { subjectId: 'oidc-org-admin', scopes: ['copalibre.control'] },
};

/**
 * The authenticated HTTP path for `copalibre module add/list/remove/verify`
 * (0085), against the real curated repository — the same network-dependent
 * precedent `module-commands.integration.test.ts` (0036) already sets for
 * the direct-database path, exercised here over HTTP instead.
 */
describe('AdminModulesController (integration, 0085)', () => {
  let app: INestApplication;
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('admin-modules-controller');
    const db = scratch.db;
    const storage = createObjectStorageAdapter(
      objectStorageConfigFromEnv({ ...process.env, DATABASE_URL: scratch.connectionString }),
    );

    @Module({
      controllers: [AdminModulesController],
      providers: [
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
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class AdminModulesTestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [AdminModulesTestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function inject(
    token: string,
    method: 'GET' | 'POST' | 'DELETE',
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

  it('refuses a non-super-admin caller, installing nothing', async () => {
    const response = await inject('orgAdmin', 'GET', '/admin/modules');
    expect(response.statusCode).toBe(403);
  });

  it('refuses with no bearer token at all', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'GET',
      url: '/admin/modules',
    });
    expect(response.statusCode).toBe(401);
  });

  it('installs, lists, verifies, and removes a real curated module end to end', async () => {
    const install = await inject('admin', 'POST', '/admin/modules', { alias: 'orbital-frisbee' });
    expect(install.statusCode).toBe(201);
    expect(install.json()).toMatchObject({
      kind: 'discipline',
      alias: 'orbital-frisbee',
      version: '1.0.0',
    });

    const list = await inject('admin', 'GET', '/admin/modules');
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      expect.objectContaining({ alias: 'orbital-frisbee', sourceKind: 'curated' }),
    ]);

    const verify = await inject('admin', 'POST', '/admin/modules/verify');
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toEqual([
      expect.objectContaining({ alias: 'orbital-frisbee', ok: true, failures: [] }),
    ]);

    const remove = await inject('admin', 'DELETE', '/admin/modules/orbital-frisbee');
    expect(remove.statusCode).toBe(200);
    expect(remove.json()).toEqual({ alias: 'orbital-frisbee', removedCount: 1 });

    const installed = await new InstalledModuleRepository(scratch.db).findByAlias(
      'orbital-frisbee',
    );
    expect(installed).toHaveLength(0);
  });

  it('refuses an unallow-listed alternate source, installing nothing', async () => {
    const response = await inject('admin', 'POST', '/admin/modules', {
      alias: 'orbital-frisbee',
      source: 'https://github.com/SebaSOFT/copalibre-modules.git',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('not allow-listed');
    const installed = await new InstalledModuleRepository(scratch.db).findByAlias(
      'orbital-frisbee',
    );
    expect(installed).toHaveLength(0);
  });
});
