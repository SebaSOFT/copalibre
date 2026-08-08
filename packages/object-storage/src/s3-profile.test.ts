import { jest } from '@jest/globals';
import { describeObjectStorageAdapterContract } from './test-support/adapter-contract-suite.js';

/**
 * Unit-level fake of `@aws-sdk/client-s3` (task 5.1) — an in-memory bucket
 * keyed on `${Bucket}/${Key}`, driven by `instanceof` on the same Command
 * classes `s3-profile.ts` constructs, so this exercises the real command
 * shape the adapter builds rather than a hand-waved stub. The real endpoint
 * is exercised separately, against real MinIO, in the integration suite.
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

let lastClientConfig: unknown;

class FakeS3Client {
  constructor(config: unknown) {
    lastClientConfig = config;
  }

  async send(command: FakePutObjectCommand | FakeGetObjectCommand | FakeDeleteObjectCommand) {
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
  describeObjectStorageAdapterContract('s3', () => createS3Adapter(BASE_CONFIG));

  it('configures the client with path-style addressing, required by MinIO', () => {
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
});
