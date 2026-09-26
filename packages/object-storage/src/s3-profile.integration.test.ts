import { createS3Adapter } from './s3-profile.js';
import { describeObjectStorageAdapterContract } from './test-support/adapter-contract-suite.js';

/**
 * Real Garage (docker-compose.dev.yml's `object-storage` service, bucket
 * pre-provisioned by `object-storage-init`) — the unit suite in
 * s3-profile.test.ts proves the same contract against an in-memory fake of
 * the AWS SDK; this proves it against an actual S3-compatible endpoint,
 * closing the gap a mock cannot close (real request signing, real bucket
 * addressing, a real network round-trip). The access key ID/secret below
 * match `object-storage-init`'s fixed dev-only key (Garage requires its own
 * `GK<24 hex>` ID / 64-hex-char secret format, unlike MinIO's free-form
 * credentials). The region must match the server's configured `s3_region`
 * (`deploy/garage/garage.toml`'s `"garage"`) or every request fails
 * `AuthorizationHeaderMalformed` before credentials are even checked.
 */
function config() {
  return {
    profile: 's3' as const,
    endpoint: process.env.COPALIBRE_OBJECT_STORAGE_URL ?? 'http://localhost:9000',
    accessKeyId: process.env.COPALIBRE_OBJECT_STORAGE_ACCESS_KEY ?? 'GK636f70616c69627265646576',
    secretAccessKey:
      process.env.COPALIBRE_OBJECT_STORAGE_SECRET_KEY ??
      '636f70616c696272655f6465765f6f6e6c795f6f626a6563745f73746f726521',
    bucket: process.env.COPALIBRE_OBJECT_STORAGE_BUCKET ?? 'copalibre-dev',
    region: process.env.COPALIBRE_OBJECT_STORAGE_REGION ?? 'garage',
  };
}

describeObjectStorageAdapterContract('s3, real Garage', () => createS3Adapter(config()));
