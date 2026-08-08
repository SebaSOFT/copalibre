import { createS3Adapter } from './s3-profile.js';
import { describeObjectStorageAdapterContract } from './test-support/adapter-contract-suite.js';

/**
 * Real MinIO (docker-compose.dev.yml's `object-storage` service, bucket
 * pre-provisioned by `object-storage-init`) — the unit suite in
 * s3-profile.test.ts proves the same contract against an in-memory fake of
 * the AWS SDK; this proves it against an actual S3-compatible endpoint,
 * closing the gap a mock cannot close (real request signing, real bucket
 * addressing, a real network round-trip).
 */
function config() {
  return {
    profile: 's3' as const,
    endpoint: process.env.COPALIBRE_OBJECT_STORAGE_URL ?? 'http://localhost:9000',
    accessKeyId: process.env.COPALIBRE_OBJECT_STORAGE_ACCESS_KEY ?? 'copalibre_dev_only',
    secretAccessKey: process.env.COPALIBRE_OBJECT_STORAGE_SECRET_KEY ?? 'copalibre_dev_only',
    bucket: process.env.COPALIBRE_OBJECT_STORAGE_BUCKET ?? 'copalibre-dev',
  };
}

describeObjectStorageAdapterContract('s3, real MinIO', () => createS3Adapter(config()));
