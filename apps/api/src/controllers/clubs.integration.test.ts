import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  OrganizationAccessRepository,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { createHash } from 'node:crypto';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { ClubsController } from './clubs.controller.js';

/** Club list/create/edit through the real HTTP stack (0109). */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' };
const ORG_PLACEHOLDER = 'unset';
let currentOrganizationId = '';
const CURRENT_ORG = (): string => currentOrganizationId;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

class FakeTokenVerifier {
  verify(token: string): Promise<AuthenticatedSubject> {
    const subjects: Record<string, AuthenticatedSubject> = {
      organizer: {
        subjectId: 'organizer-1',
        organizationId: ORG_PLACEHOLDER,
        scopes: ['copalibre.control'],
      },
    };
    const subject = subjects[token];
    if (!subject) return Promise.reject(new Error('unknown token'));
    return Promise.resolve({ ...subject, organizationId: CURRENT_ORG() });
  }
}

describe('club list/create/edit (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let db: Kysely<Database>;
  let organizationAlias: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('clubs-http');
    db = scratch.db;
    organizationAlias = 'liga-clubes';

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Clubes',
        ...AUDIT,
      }),
    );
    currentOrganizationId = organization.organizationId;

    const organizerToken = 'organizer-invite-token';
    await withTransaction(db, async (uow) => {
      const access = new OrganizationAccessRepository(db);
      await access.createInvitation(uow, {
        organizationId: organization.organizationId,
        recipientEmail: 'organizer-1@example.test',
        role: 'admin',
        status: 'active',
        token: organizerToken,
        tokenHash: hash(organizerToken),
        expiresAt: '2099-01-01T00:00:00.000Z',
        ...AUDIT,
      });
      await access.acceptInvitation(uow, {
        tokenHash: hash(organizerToken),
        subjectId: 'organizer-1',
        verifiedEmail: 'organizer-1@example.test',
        ...AUDIT,
      });
    });

    @Module({
      controllers: [ClubsController],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: TokenVerifier, useClass: FakeTokenVerifier },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function inject(options: Parameters<NestFastifyApplication['inject']>[0]) {
    return (app as NestFastifyApplication).inject(options);
  }

  it('refuses an unauthenticated list', async () => {
    const response = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/clubs`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('lists an empty club roster, creates a club, then lists it', async () => {
    const empty = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/clubs`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);

    const created = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/clubs`,
      headers: { authorization: 'Bearer organizer' },
      payload: { name: 'Casa de Italia', abbreviation: 'C I' },
    });
    expect(created.statusCode).toBe(201);
    const club = created.json() as { clubId: string; name: string; alias?: string };
    expect(club).toMatchObject({ name: 'Casa de Italia', abbreviation: 'C I' });
    expect(club.alias).toBeDefined();

    const listed = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/clubs`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([club]);
  });

  it('edits a club’s name, alias, and abbreviation', async () => {
    const created = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/clubs`,
      headers: { authorization: 'Bearer organizer' },
      payload: { name: 'Club Atenas' },
    });
    const club = created.json() as { clubId: string };

    const updated = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/clubs/${club.clubId}`,
      headers: { authorization: 'Bearer organizer' },
      payload: { name: 'Club Atenas Renombrado', abbreviation: 'CAR' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      clubId: club.clubId,
      name: 'Club Atenas Renombrado',
      abbreviation: 'CAR',
    });
  });

  it('404s an edit for an unknown club', async () => {
    const response = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/clubs/00000000-0000-7000-8000-000000000099`,
      headers: { authorization: 'Bearer organizer' },
      payload: { name: 'Nadie' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses creating a club with a malformed alias', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/clubs`,
      headers: { authorization: 'Bearer organizer' },
      payload: { name: 'Club Inválido', alias: 'Not A Valid Alias!' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('400s a club created without a name, before reaching the controller', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/clubs`,
      headers: { authorization: 'Bearer organizer' },
      payload: { abbreviation: 'SN' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('strips an extra undocumented property and creates the club anyway', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/clubs`,
      headers: { authorization: 'Bearer organizer' },
      payload: { name: 'Club Propiedad Extra', unexpectedField: 'dropped' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).not.toHaveProperty('unexpectedField');
  });
});
