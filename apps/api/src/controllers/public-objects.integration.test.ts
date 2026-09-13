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
/** Referenced by the football descriptor, but belonging to another module's namespace. */
const MISATTRIBUTED_KEY = 'modules/basketball/1.0.0/basketball-01.jpg';
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
      // The second key is deliberately mis-attributed: it names another
      // module's namespace. Every install path rejects this, so it stands in
      // for a row written outside them.
      images: [{ key: REFERENCED_KEY }, { key: MISATTRIBUTED_KEY }],
    };
    await withTransaction(harness.scratch.db, (uow) =>
      new TournamentRepository(harness.scratch.db).saveDescriptor(uow, descriptor, AUDIT),
    );
    storage.objects.set(REFERENCED_KEY, { body: IMAGE_BYTES, contentType: 'image/jpeg' });
    storage.objects.set(UNREFERENCED_KEY, {
      body: Buffer.from('private'),
      contentType: 'text/plain',
    });
    storage.objects.set(MISATTRIBUTED_KEY, { body: IMAGE_BYTES, contentType: 'image/jpeg' });
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

  it('refuses a key that names a module namespace other than its own descriptor’s', async () => {
    const response = await harness.request({
      method: 'GET',
      url: `/objects/discipline-background-image?key=${encodeURIComponent(MISATTRIBUTED_KEY)}`,
    });

    // Serving it would put one discipline's imagery behind another's tournament —
    // the football-pitch-behind-basketball defect this guard exists for.
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ errorCode: 'discipline-background-image-not-found' });
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
