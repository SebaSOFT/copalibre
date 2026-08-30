import type { INestApplication } from '@nestjs/common';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  ObjectMetadataRepository,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { OrganizationsController } from './organizations.controller.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';

/**
 * Object-storage cleanup (openspec 0168): an unreferenced stored object can
 * be listed and deleted, its storage usage total drops by its size, and an
 * object still referenced as an organization's current emblem cannot be
 * deleted until that reference is gone.
 */

class FakeObjectStorage implements ObjectStorageAdapter {
  readonly profile = 'filesystem' as const;
  readonly objects = new Map<string, Uint8Array>();

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

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
let storage: FakeObjectStorage;
let keyCounter = 0;

beforeAll(async () => {
  storage = new FakeObjectStorage();
  ({ app, scratch, organizationId, request } = await buildTestApp(
    [OrganizationsController],
    [{ provide: OBJECT_STORAGE, useValue: storage }],
  ));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

/** A passed object with real bytes in the fake backend — the state `listUnreferenced` and usage count. */
async function seedPassedObject(
  sizeBytes = 1024,
): Promise<{ objectId: string; storageKey: string }> {
  keyCounter += 1;
  const storageKey = `organizations/test/object-${keyCounter}`;
  await storage.put(storageKey, new Uint8Array(sizeBytes));
  const metadata = new ObjectMetadataRepository(scratch.db);
  const objectId = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    metadata.save(uow, {
      organizationId,
      profile: 'filesystem',
      storageKey,
      contentType: 'image/png',
      sizeBytes,
      uploadedBy: 'user:seed',
    }),
  ).then((created) => created.objectId);
  await metadata.markPassed(objectId);
  return { objectId, storageKey };
}

describe('unreferenced object listing and deletion (tasks 4.1-4.2, 6.5)', () => {
  it('lists an unreferenced object and deletes it, dropping the usage total by its size', async () => {
    const before = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/storage-usage`,
      token: 'organizer-org1',
    });
    const baselineBytes = before.json().totalBytes as number;

    const { objectId, storageKey } = await seedPassedObject(2048);

    const listed = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/storage-usage/objects`,
      token: 'organizer-org1',
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().map((entry: { objectId: string }) => entry.objectId)).toContain(objectId);

    const deleted = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/storage-usage/objects/${objectId}`,
      token: 'organizer-org1',
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ objectId, sizeBytes: 2048 });
    expect(storage.objects.has(storageKey)).toBe(false);

    const after = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/storage-usage`,
      token: 'organizer-org1',
    });
    expect(after.json().totalBytes).toBe(baselineBytes);

    const listedAfter = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/storage-usage/objects`,
      token: 'organizer-org1',
    });
    expect(listedAfter.json().map((entry: { objectId: string }) => entry.objectId)).not.toContain(
      objectId,
    );
  });

  it("refuses deleting an object that is the organization's current emblem, naming it", async () => {
    const { objectId } = await seedPassedObject();
    const organizations = new OrganizationRepository(scratch.db);
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      organizations.updateSettings(uow, organizationId, {
        emblemObjectId: objectId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const listed = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/storage-usage/objects`,
      token: 'organizer-org1',
    });
    expect(listed.json().map((entry: { objectId: string }) => entry.objectId)).not.toContain(
      objectId,
    );

    const deleted = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/storage-usage/objects/${objectId}`,
      token: 'organizer-org1',
    });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json().message).toContain(organizationId);
  });

  it('returns 404 deleting an object id that does not exist', async () => {
    const deleted = await request({
      method: 'DELETE',
      url: `/organizations/liga-orbital/storage-usage/objects/019cf000-0000-7000-8000-0000000000ff`,
      token: 'organizer-org1',
    });
    expect(deleted.statusCode).toBe(404);
  });
});
