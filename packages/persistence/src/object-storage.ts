import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Minimal S3-compatible object storage (0032) — put/get/delete against
 * MinIO or any S3-compatible endpoint, via the well-known, actively
 * maintained AWS SDK rather than a hand-rolled request signer.
 *
 * Deliberately narrow: no thumbnails, renditions, or malware scanning. This
 * is a stopgap sized to 0032's own evidence-upload need, not the full
 * capability the architecture doc describes — 0041-object-storage-adapter is
 * the follow-up that builds that out and folds this module into it.
 */
export interface ObjectStorageConfig {
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly region?: string;
}

export interface StoredObjectReference {
  readonly bucket: string;
  readonly key: string;
}

export interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType?: string;
}

export interface ObjectStorageAdapter {
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredObjectReference>;
  get(reference: StoredObjectReference): Promise<StoredObject>;
  delete(reference: StoredObjectReference): Promise<void>;
}

/** Reads the four required settings from the environment, or nothing at all. */
export function objectStorageConfigFromEnv(
  env: NodeJS.ProcessEnv,
): ObjectStorageConfig | undefined {
  const endpoint = env.COPALIBRE_OBJECT_STORAGE_URL;
  const accessKeyId = env.COPALIBRE_OBJECT_STORAGE_ACCESS_KEY;
  const secretAccessKey = env.COPALIBRE_OBJECT_STORAGE_SECRET_KEY;
  const bucket = env.COPALIBRE_OBJECT_STORAGE_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return undefined;
  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    ...(env.COPALIBRE_OBJECT_STORAGE_REGION ? { region: env.COPALIBRE_OBJECT_STORAGE_REGION } : {}),
  };
}

export function createObjectStorageAdapter(config: ObjectStorageConfig): ObjectStorageAdapter {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region ?? 'us-east-1',
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // MinIO (and most self-hosted S3-compatible stores) expect the bucket in
    // the path, not as a virtual-hosted subdomain.
    forcePathStyle: true,
  });

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return { bucket: config.bucket, key };
    },

    async get(reference) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: reference.bucket, Key: reference.key }),
      );
      const body = (await response.Body?.transformToByteArray()) ?? new Uint8Array();
      return { body, ...(response.ContentType ? { contentType: response.ContentType } : {}) };
    },

    async delete(reference) {
      await client.send(new DeleteObjectCommand({ Bucket: reference.bucket, Key: reference.key }));
    },
  };
}
