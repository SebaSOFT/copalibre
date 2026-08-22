import { footballDescriptor } from '@copalibre/domain';
import type {
  ObjectReference,
  ObjectStorageAdapter,
  StoredObject,
} from '@copalibre/object-storage';
import { SYSTEM_ORGANIZATION, TournamentRepository, withTransaction } from '@copalibre/persistence';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { PublicObjectsController } from './public-objects.controller.js';
import { buildTestApp } from './test-support/integration-harness.js';

const REFERENCED_KEY = 'modules/football/1.1.0/football-01.jpg';
const UNREFERENCED_KEY = 'modules/football/1.1.0/private.jpg';
const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const AUDIT = {
  organizationId: SYSTEM_ORGANIZATION,
  actor: 'system:test',
  authorizationContext: 'test',
};

describe('public discipline background images (integration)', () => {
  let harness: Awaited<ReturnType<typeof buildTestApp>>;
  let storage: MemoryObjectStorage;

  beforeAll(async () => {
    storage = new MemoryObjectStorage();
    harness = await buildTestApp(
      [PublicObjectsController],
      [{ provide: OBJECT_STORAGE, useValue: storage }],
    );
    const descriptor = {
      ...footballDescriptor(),
      version: '1.1.0',
      images: [{ key: REFERENCED_KEY }],
    };
    await withTransaction(harness.scratch.db, (uow) =>
      new TournamentRepository(harness.scratch.db).saveDescriptor(uow, descriptor, AUDIT),
    );
    storage.objects.set(REFERENCED_KEY, { body: IMAGE_BYTES, contentType: 'image/jpeg' });
    storage.objects.set(UNREFERENCED_KEY, {
      body: Buffer.from('private'),
      contentType: 'text/plain',
    });
  });

  afterAll(async () => {
    await harness?.app.close();
    await harness?.scratch.drop();
  });

  it('serves a referenced image anonymously with immutable cache headers', async () => {
    const response = await harness.request({
      method: 'GET',
      url: `/objects/discipline-background-image?key=${encodeURIComponent(REFERENCED_KEY)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.rawPayload).toEqual(IMAGE_BYTES);
  });

  it('returns not-found for an unreferenced key without reading its stored bytes', async () => {
    storage.getCalls.length = 0;
    const response = await harness.request({
      method: 'GET',
      url: `/objects/discipline-background-image?key=${encodeURIComponent(UNREFERENCED_KEY)}`,
    });

    expect(response.statusCode).toBe(404);
    expect(storage.getCalls).toEqual([]);
  });

  it('returns not-found for unknown and deleted referenced objects', async () => {
    const unknown = await harness.request({
      method: 'GET',
      url: '/objects/discipline-background-image?key=unknown',
    });
    expect(unknown.statusCode).toBe(404);

    storage.objects.delete(REFERENCED_KEY);
    const deleted = await harness.request({
      method: 'GET',
      url: `/objects/discipline-background-image?key=${encodeURIComponent(REFERENCED_KEY)}`,
    });
    expect(deleted.statusCode).toBe(404);
  });
});

class MemoryObjectStorage implements ObjectStorageAdapter {
  readonly profile = 'filesystem' as const;
  readonly objects = new Map<string, StoredObject>();
  readonly getCalls: string[] = [];

  async put(key: string, body: Uint8Array, contentType: string): Promise<ObjectReference> {
    this.objects.set(key, { body, contentType });
    return { key };
  }

  async get(reference: ObjectReference): Promise<StoredObject> {
    this.getCalls.push(reference.key);
    const stored = this.objects.get(reference.key);
    if (!stored) throw new Error('missing');
    return stored;
  }

  async delete(reference: ObjectReference): Promise<void> {
    this.objects.delete(reference.key);
  }
}
