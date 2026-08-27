import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
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
import { ResourcesController } from './resources.controller.js';

/** Venue/official list/create/edit through the real HTTP stack. */

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

describe('venue/official list/create/edit (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let db: Kysely<Database>;
  let organizationAlias: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('resources-http');
    db = scratch.db;
    organizationAlias = 'liga-recursos';

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Recursos',
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
      controllers: [ResourcesController],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: TokenVerifier, useClass: FakeTokenVerifier },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createApiValidationPipe());
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

  it('refuses an unauthenticated venue listing', async () => {
    const response = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/venues`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('lists an empty venue roster, creates a venue with details, then lists it', async () => {
    const empty = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/venues`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);

    const created = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/venues`,
      headers: { authorization: 'Bearer organizer' },
      payload: {
        alias: 'cancha-1',
        name: 'Cancha 1',
        concurrentCapacity: 2,
        details: { surface: 'clay' },
      },
    });
    expect(created.statusCode).toBe(201);
    const venue = created.json() as { venueId: string; name: string };
    expect(venue).toMatchObject({
      name: 'Cancha 1',
      concurrentCapacity: 2,
      details: { surface: 'clay' },
    });

    const listed = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/venues`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([venue]);
  });

  it('creates a virtual venue — a server is a venue the same way a court is', async () => {
    const created = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/venues`,
      headers: { authorization: 'Bearer organizer' },
      payload: {
        alias: 'servidor-1',
        name: 'Servidor 1',
        concurrentCapacity: 1,
        details: { region: 'sa-east-1', map: 'de_dust2' },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ details: { region: 'sa-east-1', map: 'de_dust2' } });
  });

  it('creates a venue with no details at all, unaffected by the field', async () => {
    const created = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/venues`,
      headers: { authorization: 'Bearer organizer' },
      payload: { alias: 'cancha-sin-detalles', name: 'Cancha Sin Detalles', concurrentCapacity: 1 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty('details');
  });

  it('edits a venue’s name, capacity, and details', async () => {
    const created = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/venues`,
      headers: { authorization: 'Bearer organizer' },
      payload: { alias: 'cancha-editable', name: 'Cancha Editable', concurrentCapacity: 1 },
    });
    const venue = created.json() as { venueId: string };

    const updated = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/venues/${venue.venueId}`,
      headers: { authorization: 'Bearer organizer' },
      payload: { name: 'Cancha Renombrada', concurrentCapacity: 3, details: { surface: 'grass' } },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      venueId: venue.venueId,
      name: 'Cancha Renombrada',
      concurrentCapacity: 3,
      details: { surface: 'grass' },
    });
  });

  it('404s an edit for an unknown venue', async () => {
    const response = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/venues/00000000-0000-7000-8000-000000000099`,
      headers: { authorization: 'Bearer organizer' },
      payload: { name: 'Nadie' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses creating a venue with a malformed alias', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/venues`,
      headers: { authorization: 'Bearer organizer' },
      payload: { alias: 'Not A Valid Alias!', name: 'Cancha Inválida', concurrentCapacity: 1 },
    });
    expect(response.statusCode).toBe(409);
  });

  it('lists an empty official roster, creates an official, then lists it', async () => {
    const empty = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/officials`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);

    const created = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/officials`,
      headers: { authorization: 'Bearer organizer' },
      payload: { displayName: 'Ana Gómez', roles: ['referee'] },
    });
    expect(created.statusCode).toBe(201);
    const official = created.json() as { officialId: string };
    expect(official).toMatchObject({ displayName: 'Ana Gómez', roles: ['referee'] });

    const listed = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/officials`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([official]);
  });

  it('edits an official’s name and roles', async () => {
    const created = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/officials`,
      headers: { authorization: 'Bearer organizer' },
      payload: { displayName: 'Beto Ruiz', roles: ['referee'] },
    });
    const official = created.json() as { officialId: string };

    const updated = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/officials/${official.officialId}`,
      headers: { authorization: 'Bearer organizer' },
      payload: { displayName: 'Beto Ruiz Renombrado', roles: ['referee', 'observer'] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      officialId: official.officialId,
      displayName: 'Beto Ruiz Renombrado',
      roles: ['referee', 'observer'],
    });
  });

  it('404s an edit for an unknown official', async () => {
    const response = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/officials/00000000-0000-7000-8000-000000000099`,
      headers: { authorization: 'Bearer organizer' },
      payload: { displayName: 'Nadie' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses creating an official with no roles', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/officials`,
      headers: { authorization: 'Bearer organizer' },
      payload: { displayName: 'Sin Rol', roles: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s a venue created without a concurrent capacity, before reaching the controller', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/venues`,
      headers: { authorization: 'Bearer organizer' },
      payload: { alias: 'cancha-sin-capacidad', name: 'Cancha Sin Capacidad' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an extra undocumented property with 400 when creating an official', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/officials`,
      headers: { authorization: 'Bearer organizer' },
      payload: { displayName: 'Celia Prueba', roles: ['observer'], unexpectedField: 'dropped' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.errorCode).toBe('bad-request');
    expect(body.message).toContain('property unexpectedField should not exist');
  });
});
