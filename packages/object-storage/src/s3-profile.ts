import {
  DeleteObjectCommand,
  GetObjectCommand,
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

/** Works against MinIO or any S3-compatible endpoint via the official SDK — never a hand-rolled request signer. */
export function createS3Adapter(config: S3StorageConfig): ObjectStorageAdapter {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region ?? 'us-east-1',
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // MinIO (and most self-hosted S3-compatible stores) expect the bucket in
    // the path, not as a virtual-hosted subdomain.
    forcePathStyle: true,
  });

  return {
    profile: 's3',

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
