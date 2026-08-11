import { createFilesystemAdapter } from './filesystem-profile.js';
import { createS3Adapter } from './s3-profile.js';
import type { ObjectStorageAdapter } from './types.js';
import type { ObjectStorageConfig } from './config.js';

export function createObjectStorageAdapter(config: ObjectStorageConfig): ObjectStorageAdapter {
  return config.profile === 's3' ? createS3Adapter(config) : createFilesystemAdapter(config);
}
