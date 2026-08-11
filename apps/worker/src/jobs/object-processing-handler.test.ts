import { jest } from '@jest/globals';
import type { ClaimedJob, ObjectMetadata, UnitOfWork } from '@copalibre/persistence';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const metadataRepository = {
  findById: jest.fn<() => Promise<ObjectMetadata | undefined>>(),
  markPassed: jest.fn<() => Promise<void>>(),
  markFailed: jest.fn<(...args: unknown[]) => Promise<void>>(),
};

const fakeUow = {} as UnitOfWork;

await jest.unstable_mockModule('@copalibre/persistence', () => ({
  OBJECT_PROCESSING_REQUESTED_EVENT: 'object-storage.processing-requested',
  ObjectMetadataRepository: jest.fn(() => metadataRepository),
  withTransaction: jest.fn(async (_db: unknown, work: (uow: UnitOfWork) => Promise<void>) =>
    work(fakeUow),
  ),
}));

const { objectProcessingHandler } = await import('./object-processing-handler.js');

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    eventId: 'event-1',
    organizationId: 'org-1',
    stream: 'object-metadata:object-1',
    entityId: 'object-1',
    eventType: 'object-storage.processing-requested',
    projectionVersion: 1,
    payload: { objectId: 'object-1' },
    createdAt: '2026-08-08T12:00:00.000Z',
    attempts: 1,
    claimedBy: 'worker-1',
    failures: [],
    ...overrides,
  };
}

function metadata(overrides: Partial<ObjectMetadata> = {}): ObjectMetadata {
  return {
    objectId: 'object-1',
    organizationId: 'org-1',
    profile: 'filesystem',
    storageKey: 'org-1/object-1.png',
    contentType: 'image/png',
    sizeBytes: 100,
    uploadedBy: 'person-1',
    status: 'pending',
    createdAt: '2026-08-08T11:00:00.000Z',
    ...overrides,
  };
}

function fakeStorage(body: Uint8Array) {
  return {
    profile: 'filesystem' as const,
    get: jest.fn(async () => ({ body })),
    put: jest.fn(async (key: string) => ({ key })),
    delete: jest.fn(async () => undefined),
  };
}

function fakeScanner(isInfected: boolean, viruses: string[] = []) {
  return { scanStream: jest.fn(async () => ({ isInfected, viruses })) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('objectProcessingHandler', () => {
  it('ignores a job of a different event type', async () => {
    const storage = fakeStorage(new Uint8Array());
    const handler = objectProcessingHandler({
      db: {} as never,
      storage,
      scanner: fakeScanner(false),
    });

    await handler(job({ eventType: 'something.else' }));

    expect(metadataRepository.findById).not.toHaveBeenCalled();
  });

  it('does nothing for an object that no longer exists', async () => {
    metadataRepository.findById.mockResolvedValue(undefined);
    const storage = fakeStorage(new Uint8Array());
    const handler = objectProcessingHandler({
      db: {} as never,
      storage,
      scanner: fakeScanner(false),
    });

    await handler(job());

    expect(storage.get).not.toHaveBeenCalled();
  });

  it('does nothing for an object that is no longer pending (already processed)', async () => {
    metadataRepository.findById.mockResolvedValue(metadata({ status: 'passed' }));
    const storage = fakeStorage(new Uint8Array());
    const handler = objectProcessingHandler({
      db: {} as never,
      storage,
      scanner: fakeScanner(false),
    });

    await handler(job());

    expect(storage.get).not.toHaveBeenCalled();
  });

  it('throws when the job carries no objectId', async () => {
    const storage = fakeStorage(new Uint8Array());
    const handler = objectProcessingHandler({
      db: {} as never,
      storage,
      scanner: fakeScanner(false),
    });

    await expect(handler(job({ payload: {} }))).rejects.toThrow('no objectId');
  });

  it('marks a clean, non-image object as passed without generating a thumbnail', async () => {
    metadataRepository.findById.mockResolvedValue(metadata({ contentType: 'application/pdf' }));
    const storage = fakeStorage(new TextEncoder().encode('pdf bytes'));
    const handler = objectProcessingHandler({
      db: {} as never,
      storage,
      scanner: fakeScanner(false),
    });

    await handler(job());

    expect(storage.put).not.toHaveBeenCalled();
    expect(metadataRepository.markPassed).toHaveBeenCalledWith('object-1');
  });

  it('marks a clean image as passed and stores a generated thumbnail', async () => {
    metadataRepository.findById.mockResolvedValue(metadata());
    const storage = fakeStorage(Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'));
    const handler = objectProcessingHandler({
      db: {} as never,
      storage,
      scanner: fakeScanner(false),
    });

    await handler(job());

    expect(storage.put).toHaveBeenCalledWith(
      'org-1/object-1.png.thumbnail',
      expect.any(Buffer),
      'image/png',
    );
    expect(metadataRepository.markPassed).toHaveBeenCalledWith('object-1');
  });

  it('marks an infected object as failed, naming the virus, and never generates a thumbnail', async () => {
    metadataRepository.findById.mockResolvedValue(metadata());
    const storage = fakeStorage(Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'));
    const handler = objectProcessingHandler({
      db: {} as never,
      storage,
      scanner: fakeScanner(true, ['Eicar-Test-Signature']),
    });

    await handler(job());

    expect(storage.put).not.toHaveBeenCalled();
    expect(metadataRepository.markPassed).not.toHaveBeenCalled();
    expect(metadataRepository.markFailed).toHaveBeenCalledWith(
      fakeUow,
      'object-1',
      'Eicar-Test-Signature',
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it('records a generic reason when the scanner flags infection without naming a virus', async () => {
    metadataRepository.findById.mockResolvedValue(metadata({ contentType: 'application/pdf' }));
    const storage = fakeStorage(new TextEncoder().encode('bytes'));
    const handler = objectProcessingHandler({
      db: {} as never,
      storage,
      scanner: fakeScanner(true, []),
    });

    await handler(job());

    expect(metadataRepository.markFailed).toHaveBeenCalledWith(
      fakeUow,
      'object-1',
      'flagged by malware scan',
      expect.anything(),
    );
  });
});
