import { jest } from '@jest/globals';
import { describeObjectStorageAdapterContract } from './test-support/adapter-contract-suite.js';

/**
 * Unit-level fake of `@aws-sdk/client-s3` — an in-memory bucket
 * keyed on `${Bucket}/${Key}`, driven by `instanceof` on the same Command
 * classes `s3-profile.ts` constructs, so this exercises the real command
 * shape the adapter builds rather than a hand-waved stub. The real endpoint
 * is exercised separately, against real Garage, in the integration suite.
 */
const store = new Map<string, { body: Uint8Array; contentType?: string }>();

interface FakeCommandInput {
  readonly Bucket: string;
  readonly Key: string;
  readonly Body?: Uint8Array;
  readonly ContentType?: string;
}

class FakePutObjectCommand {
  constructor(readonly input: FakeCommandInput) {}
}
class FakeGetObjectCommand {
  constructor(readonly input: FakeCommandInput) {}
}
class FakeDeleteObjectCommand {
  constructor(readonly input: FakeCommandInput) {}
}
class FakeHeadBucketCommand {
  constructor(readonly input: { Bucket: string }) {}
}
class FakeListObjectsV2Command {
  constructor(readonly input: { Bucket: string; ContinuationToken?: string }) {}
}

let inventoryPages: {
  Contents?: { Size?: number }[];
  IsTruncated?: boolean;
  NextContinuationToken?: string;
}[] = [];
let inventoryError: Error | undefined;
const inventoryCursors: (string | undefined)[] = [];

let lastClientConfig: unknown;

class FakeS3Client {
  constructor(config: unknown) {
    lastClientConfig = config;
  }

  async send(
    command:
      | FakePutObjectCommand
      | FakeGetObjectCommand
      | FakeDeleteObjectCommand
      | FakeHeadBucketCommand
      | FakeListObjectsV2Command,
    options?: { abortSignal?: AbortSignal },
  ) {
    options?.abortSignal?.throwIfAborted();
    if (command instanceof FakeHeadBucketCommand) {
      if (inventoryError) throw inventoryError;
      return {};
    }
    if (command instanceof FakeListObjectsV2Command) {
      inventoryCursors.push(command.input.ContinuationToken);
      return inventoryPages.shift() ?? {};
    }
    const key = `${command.input.Bucket}/${command.input.Key}`;
    if (command instanceof FakePutObjectCommand) {
      store.set(key, {
        body: command.input.Body ?? new Uint8Array(),
        ...(command.input.ContentType ? { contentType: command.input.ContentType } : {}),
      });
      return {};
    }
    if (command instanceof FakeGetObjectCommand) {
      // A dedicated sentinel key, rather than a stored entry: exercises the
      // adapter's own fallback for a response the SDK can return with no
      // Body at all, which nothing routed through `put` first can produce.
      if (command.input.Key === 'no-body-in-response.txt') return {};
      const found = store.get(key);
      if (!found) throw new Error('NoSuchKey');
      return {
        Body: { transformToByteArray: async () => found.body },
        ...(found.contentType ? { ContentType: found.contentType } : {}),
      };
    }
    if (command instanceof FakeDeleteObjectCommand) {
      store.delete(key);
      return {};
    }
    throw new Error('Unhandled fake S3 command');
  }
}

await jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: FakeS3Client,
  PutObjectCommand: FakePutObjectCommand,
  GetObjectCommand: FakeGetObjectCommand,
  DeleteObjectCommand: FakeDeleteObjectCommand,
  HeadBucketCommand: FakeHeadBucketCommand,
  ListObjectsV2Command: FakeListObjectsV2Command,
}));

const { createS3Adapter } = await import('./s3-profile.js');

const BASE_CONFIG = {
  profile: 's3' as const,
  endpoint: 'http://localhost:9000',
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key',
  bucket: 'test-bucket',
};

describe('createS3Adapter', () => {
  beforeEach(() => {
    inventoryPages = [];
    inventoryError = undefined;
    inventoryCursors.length = 0;
  });
  describeObjectStorageAdapterContract('s3', () => createS3Adapter(BASE_CONFIG));

  it('configures the client with path-style addressing, required by Garage and most S3-compatible stores', () => {
    createS3Adapter(BASE_CONFIG);
    expect(lastClientConfig).toMatchObject({
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' },
    });
  });

  it('defaults the region when none is configured', () => {
    createS3Adapter(BASE_CONFIG);
    expect(lastClientConfig).toMatchObject({ region: 'us-east-1' });
  });

  it('uses an explicit region when configured', () => {
    createS3Adapter({ ...BASE_CONFIG, region: 'eu-west-1' });
    expect(lastClientConfig).toMatchObject({ region: 'eu-west-1' });
  });

  it('returns an empty body and no content type when the SDK response carries neither', async () => {
    const adapter = createS3Adapter(BASE_CONFIG);
    const stored = await adapter.get({ key: 'no-body-in-response.txt' });
    expect(stored.body).toEqual(new Uint8Array());
    expect(stored.contentType).toBeUndefined();
  });

  function inspectOf(adapter: ReturnType<typeof createS3Adapter>) {
    const inspect = adapter.inspect;
    if (!inspect) throw new Error('inspect required');
    return inspect;
  }

  it('counts every inventory page without exposing object keys', async () => {
    inventoryPages = [
      { Contents: [{ Size: 3 }, { Size: 5 }], IsTruncated: true, NextContinuationToken: 'next' },
      { Contents: [{ Size: 7 }, {}], IsTruncated: false },
    ];
    await expect(
      inspectOf(createS3Adapter(BASE_CONFIG))(new AbortController().signal),
    ).resolves.toEqual({
      totalObjects: 4,
      totalBytes: 15,
      bucketName: 'test-bucket',
    });
    expect(inventoryCursors).toEqual([undefined, 'next']);
  });

  it('reports an empty accessible bucket', async () => {
    await expect(
      inspectOf(createS3Adapter(BASE_CONFIG))(new AbortController().signal),
    ).resolves.toMatchObject({
      totalObjects: 0,
      totalBytes: 0,
    });
  });

  it('propagates unreachable bucket and incomplete inventory failures', async () => {
    inventoryError = new Error('bucket unavailable');
    await expect(
      inspectOf(createS3Adapter(BASE_CONFIG))(new AbortController().signal),
    ).rejects.toThrow('bucket unavailable');
    inventoryError = undefined;
    inventoryPages = [{ IsTruncated: true }];
    await expect(
      inspectOf(createS3Adapter(BASE_CONFIG))(new AbortController().signal),
    ).rejects.toThrow('incomplete page');
  });

  it('honors an aborted inspection deadline', async () => {
    await expect(inspectOf(createS3Adapter(BASE_CONFIG))(AbortSignal.abort())).rejects.toThrow();
  });
});
