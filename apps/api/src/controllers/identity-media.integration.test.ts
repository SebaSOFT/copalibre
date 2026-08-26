import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrincipalThrottlerGuard } from '../auth/principal-throttler.guard.js';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  EnrollmentRepository,
  ObjectMetadataRepository,
  OrganizationAccessRepository,
  OrganizationRepository,
  PersonRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { createHash } from 'node:crypto';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import { RESOURCE_THROTTLE_LIMIT } from '../auth/principal-throttler.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import {
  ClubMediaController,
  OrganizationMediaController,
  PersonMediaController,
} from './identity-media.controller.js';

/**
 * The person-photo/club-emblem upload and public-serve endpoints through the
 * real HTTP stack: upload -> pending -> (mocked scanner)
 * passed -> public GET streams bytes; failed-scan -> public GET 404; absent
 * -> public GET 404; the public routes need no bearer token while the upload
 * routes still require the existing admin authorization.
 */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' };
const ORG_PLACEHOLDER = 'unset';
let currentOrganizationId = '';
const CURRENT_ORG = (): string => currentOrganizationId;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * A real, decodable PNG at the platform's profile-image contract size
 * — every upload test below needs bytes `sharp` can actually read dimensions
 * from, not the placeholder text buffers previous tests used, now that
 * `decodeImage()` runs every upload through `sharp(bytes).metadata()`.
 */
async function conformingPng(width = 410, height = 512): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

function conformingSvg(width = 410, height = 512): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
}

class FakeTokenVerifier {
  verify(token: string): Promise<AuthenticatedSubject> {
    const subjects: Record<string, AuthenticatedSubject> = {
      organizer: {
        subjectId: 'organizer-1',
        organizationId: ORG_PLACEHOLDER,
        scopes: ['copalibre.control'],
      },
      // a second admin principal, to prove per-principal throttle
      // buckets are tracked independently.
      'organizer-2': {
        subjectId: 'organizer-2',
        organizationId: ORG_PLACEHOLDER,
        scopes: ['copalibre.control'],
      },
    };
    const subject = subjects[token];
    if (!subject) return Promise.reject(new Error('unknown token'));
    return Promise.resolve({ ...subject, organizationId: CURRENT_ORG() });
  }
}

class FakeObjectStorage implements ObjectStorageAdapter {
  readonly profile = 'filesystem' as const;
  private readonly objects = new Map<string, Uint8Array>();

  async put(key: string, body: Uint8Array): Promise<{ key: string }> {
    this.objects.set(key, body);
    return { key };
  }
  async get(reference: { key: string }): Promise<{ body: Uint8Array; contentType?: string }> {
    return { body: this.objects.get(reference.key) ?? new Uint8Array() };
  }
  async delete(reference: { key: string }): Promise<void> {
    this.objects.delete(reference.key);
  }
}

describe('person photo / club emblem upload and public serve (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let db: Kysely<Database>;
  let organizationAlias: string;
  let personId: string;
  let clubId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('identity-media-http');
    db = scratch.db;
    organizationAlias = 'liga-media';

    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Media',
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
      // Second admin principal for the per-principal throttle test.
      const organizer2Token = 'organizer-2-invite-token';
      await access.createInvitation(uow, {
        organizationId: organization.organizationId,
        recipientEmail: 'organizer-2@example.test',
        role: 'admin',
        status: 'active',
        token: organizer2Token,
        tokenHash: hash(organizer2Token),
        expiresAt: '2099-01-01T00:00:00.000Z',
        ...AUDIT,
      });
      await access.acceptInvitation(uow, {
        tokenHash: hash(organizer2Token),
        subjectId: 'organizer-2',
        verifiedEmail: 'organizer-2@example.test',
        ...AUDIT,
      });
    });

    const person = await withTransaction(db, (uow) =>
      new PersonRepository(db).register(uow, {
        organizationId: organization.organizationId,
        displayName: 'Retrato Pendiente',
        ...AUDIT,
      }),
    );
    personId = person.person.personId;

    const club = await withTransaction(db, (uow) =>
      new EnrollmentRepository(db).createClub(uow, {
        organizationId: organization.organizationId,
        name: 'Club Escudo Pendiente',
        ...AUDIT,
      }),
    );
    clubId = club.clubId;

    @Module({
      controllers: [PersonMediaController, ClubMediaController, OrganizationMediaController],
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }])],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: TokenVerifier, useClass: FakeTokenVerifier },
        { provide: OBJECT_STORAGE, useValue: new FakeObjectStorage() },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
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

  it('refuses an unauthenticated upload attempt', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/persons/${personId}/photo`,
      payload: { filename: 'p.png', contentType: 'image/png', contentBase64: 'AA==' },
    });
    expect(response.statusCode).toBe(401);
  });

  // the global ValidationPipe rejects a body failing its DTO with 400
  // at the edge, instead of surfacing as a handler error (500).
  it('refuses an authenticated photo upload missing contentBase64 with 400', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/persons/${personId}/photo`,
      headers: { authorization: 'Bearer organizer' },
      payload: { filename: 'photo.png', contentType: 'image/png' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('404s a person with no photo, on the unauthenticated public route', async () => {
    const response = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/persons/${personId}/photo`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('uploads, serves 202 while pending, then streams once the scan passes — with no token on the GET', async () => {
    const bytes = await conformingPng();
    const contentBase64 = bytes.toString('base64');
    const upload = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/persons/${personId}/photo`,
      headers: { authorization: 'Bearer organizer' },
      payload: { filename: 'photo.png', contentType: 'image/png', contentBase64 },
    });
    expect(upload.statusCode).toBe(201);
    const { objectId } = upload.json() as { objectId: string };

    const pending = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/persons/${personId}/photo`,
    });
    expect(pending.statusCode).toBe(202);
    expect(pending.rawPayload.length).toBe(0);

    await new ObjectMetadataRepository(db).markPassed(objectId);

    const passed = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/persons/${personId}/photo`,
    });
    expect(passed.statusCode).toBe(200);
    expect(passed.headers['content-type']).toBe('image/png');
    expect(Buffer.from(passed.rawPayload).equals(bytes)).toBe(true);
  });

  it('404s once a photo fails validation, never serving a flagged object', async () => {
    const flaggedPerson = await withTransaction(db, (uow) =>
      new PersonRepository(db).register(uow, {
        organizationId: currentOrganizationId,
        displayName: 'Retrato Rechazado',
        ...AUDIT,
      }),
    );

    const contentBase64 = (await conformingPng()).toString('base64');
    const upload = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/persons/${flaggedPerson.person.personId}/photo`,
      headers: { authorization: 'Bearer organizer' },
      payload: { filename: 'photo.png', contentType: 'image/png', contentBase64 },
    });
    const { objectId } = upload.json() as { objectId: string };

    await withTransaction(db, (uow) =>
      new ObjectMetadataRepository(db).markFailed(uow, objectId, 'malware detected', {
        organizationId: currentOrganizationId,
        ...AUDIT,
      }),
    );

    const response = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/persons/${flaggedPerson.person.personId}/photo`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses a person photo upload with the wrong height', async () => {
    const bytes = await conformingPng(410, 800);
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/persons/${personId}/photo`,
      headers: { authorization: 'Bearer organizer' },
      payload: {
        filename: 'photo.png',
        contentType: 'image/png',
        contentBase64: bytes.toString('base64'),
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a person photo upload with the wrong width (a different aspect ratio)', async () => {
    const bytes = await conformingPng(200, 512);
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/persons/${personId}/photo`,
      headers: { authorization: 'Bearer organizer' },
      payload: {
        filename: 'photo.png',
        contentType: 'image/png',
        contentBase64: bytes.toString('base64'),
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('uploads and serves a club emblem the same way, unauthenticated on the GET', async () => {
    const svg = conformingSvg();
    const contentBase64 = Buffer.from(svg).toString('base64');
    const upload = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/clubs/${clubId}/emblem`,
      headers: { authorization: 'Bearer organizer' },
      payload: { filename: 'emblem.svg', contentType: 'image/svg+xml', contentBase64 },
    });
    expect(upload.statusCode).toBe(201);
    const { objectId } = upload.json() as { objectId: string };
    await new ObjectMetadataRepository(db).markPassed(objectId);

    const response = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/clubs/${clubId}/emblem`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/svg+xml');
    expect(response.rawPayload.toString()).toBe(svg);
  });

  it('refuses a club emblem whose declared dimensions are the wrong aspect ratio', async () => {
    const svg = conformingSvg(410, 410);
    const contentBase64 = Buffer.from(svg).toString('base64');
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/clubs/${clubId}/emblem`,
      headers: { authorization: 'Bearer organizer' },
      payload: { filename: 'emblem.svg', contentType: 'image/svg+xml', contentBase64 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses an unauthenticated organization emblem upload', async () => {
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/emblem`,
      payload: { filename: 'o.png', contentType: 'image/png', contentBase64: 'AA==' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('404s an emblem request for an organization alias that does not exist', async () => {
    const response = await inject({
      method: 'GET',
      url: `/organizations/no-such-org/emblem`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('uploads and serves an organization emblem, unauthenticated on the GET', async () => {
    const svg = conformingSvg();
    const contentBase64 = Buffer.from(svg).toString('base64');
    const upload = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/emblem`,
      headers: { authorization: 'Bearer organizer' },
      payload: { filename: 'emblem.svg', contentType: 'image/svg+xml', contentBase64 },
    });
    expect(upload.statusCode).toBe(201);
    const { objectId } = upload.json() as { objectId: string };

    // Enqueued (pending) on the same transaction as the metadata row.
    // ordering) — served as 202 with no body until the async scan passes it.
    const pending = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/emblem`,
    });
    expect(pending.statusCode).toBe(202);

    await new ObjectMetadataRepository(db).markPassed(objectId);

    const response = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/emblem`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/svg+xml');
    expect(response.rawPayload.toString()).toBe(svg);
  });

  it('refuses an organization emblem upload with the wrong height', async () => {
    const bytes = await conformingPng(410, 600);
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/emblem`,
      headers: { authorization: 'Bearer organizer' },
      payload: {
        filename: 'emblem.png',
        contentType: 'image/png',
        contentBase64: bytes.toString('base64'),
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).not.toHaveProperty('objectId');
  });

  it('refuses an organization emblem upload with the wrong width (a different aspect ratio)', async () => {
    const bytes = await conformingPng(300, 512);
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/emblem`,
      headers: { authorization: 'Bearer organizer' },
      payload: {
        filename: 'emblem.png',
        contentType: 'image/png',
        contentBase64: bytes.toString('base64'),
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('accepts an organization emblem exactly on the 1% dimension tolerance boundary', async () => {
    // 410 * 1.01 = 414.1, 512 * 1.01 = 517.12 — the widest a still-conforming
    // upload can be; a regression that tightens the check would refuse this.
    const bytes = await conformingPng(414, 517);
    const response = await inject({
      method: 'POST',
      url: `/organizations/${organizationAlias}/emblem`,
      headers: { authorization: 'Bearer organizer' },
      payload: {
        filename: 'emblem.png',
        contentType: 'image/png',
        contentBase64: bytes.toString('base64'),
      },
    });
    expect(response.statusCode).toBe(201);
  });

  it('sets and clears a nationality through the authenticated PATCH route', async () => {
    const set = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/persons/${personId}/nationality`,
      headers: { authorization: 'Bearer organizer' },
      payload: { nationality: 'AR' },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toMatchObject({ personId, nationality: 'AR' });

    const cleared = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/persons/${personId}/nationality`,
      headers: { authorization: 'Bearer organizer' },
      payload: { nationality: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ personId, nationality: null });
  });

  it('reads a person’s profile for an admin, refusing an unauthenticated request', async () => {
    const anonymous = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/persons/${personId}`,
    });
    expect(anonymous.statusCode).toBe(401);

    const response = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/persons/${personId}`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ personId, displayName: 'Retrato Pendiente' });
  });

  it('404s a person profile request for an unknown person', async () => {
    const response = await inject({
      method: 'GET',
      url: `/organizations/${organizationAlias}/persons/00000000-0000-7000-8000-000000000099`,
      headers: { authorization: 'Bearer organizer' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses an unauthenticated nationality change', async () => {
    const response = await inject({
      method: 'PATCH',
      url: `/organizations/${organizationAlias}/persons/${personId}/nationality`,
      payload: { nationality: 'AR' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('throttles photo uploads per principal and tracks principals independently', async () => {
    const uploadAs = async (token: string): Promise<{ statusCode: number }> => {
      const person = await withTransaction(db, (uow) =>
        new PersonRepository(db).register(uow, {
          organizationId: currentOrganizationId,
          displayName: 'Retrato Throttle',
          ...AUDIT,
        }),
      );
      const response = await inject({
        method: 'POST',
        url: `/organizations/${organizationAlias}/persons/${person.person.personId}/photo`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          filename: 'photo.png',
          contentType: 'image/png',
          contentBase64: (await conformingPng()).toString('base64'),
        },
      });
      return response;
    };

    // Exhaust the first principal's bucket. Uploads before the limit succeed
    // normally; the request that exceeds it is rejected with 429 without
    // reaching the handler.
    let sawThrottled = false;
    for (let i = 0; i < RESOURCE_THROTTLE_LIMIT * 2 && !sawThrottled; i++) {
      const response = await uploadAs('organizer');
      if (response.statusCode === 429) sawThrottled = true;
      else expect(response.statusCode).toBe(201);
    }
    expect(sawThrottled).toBe(true);

    // The second principal's bucket is untouched — an admin uploading in the
    // same window is not locked out by someone else's volume.
    const otherPrincipal = await uploadAs('organizer-2');
    expect(otherPrincipal.statusCode).toBe(201);
  });
});
