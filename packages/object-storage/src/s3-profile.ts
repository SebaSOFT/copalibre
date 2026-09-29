import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectStorageAdapter } from './types.js';

export interface S3StorageConfig {
  readonly profile: 's3';
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly region?: string;
}

/** Works against Garage or any S3-compatible endpoint via the official SDK — never a hand-rolled request signer. */
export function createS3Adapter(config: S3StorageConfig): ObjectStorageAdapter {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region ?? 'us-east-1',
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Garage (and most self-hosted S3-compatible stores) expect the bucket
    // in the path, not as a virtual-hosted subdomain.
    forcePathStyle: true,
  });

  return {
    profile: 's3',

    async inspect(signal) {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }), { abortSignal: signal });
      let totalObjects = 0;
      let totalBytes = 0;
      let continuationToken: string | undefined;
      do {
        signal.throwIfAborted();
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: config.bucket, ContinuationToken: continuationToken }),
          { abortSignal: signal },
        );
        for (const object of page.Contents ?? []) {
          totalObjects += 1;
          totalBytes += object.Size ?? 0;
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !continuationToken) {
          throw new Error('Storage inventory returned an incomplete page without a cursor');
        }
      } while (continuationToken);
      return { totalObjects, totalBytes, bucketName: config.bucket };
    },

    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return { key };
    },

    async get(reference) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: reference.key }),
      );
      const body = (await response.Body?.transformToByteArray()) ?? new Uint8Array();
      return { body, ...(response.ContentType ? { contentType: response.ContentType } : {}) };
    },

    async delete(reference) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: reference.key }));
    },
  };
}
