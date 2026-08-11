export { createObjectStorageAdapter } from './adapter.js';
export { objectStorageConfigFromEnv, type ObjectStorageConfig } from './config.js';
export { UnsafeObjectKeyError, type FilesystemStorageConfig } from './filesystem-profile.js';
export { type S3StorageConfig } from './s3-profile.js';
export type {
  ObjectReference,
  ObjectStorageAdapter,
  StorageProfile,
  StoredObject,
} from './types.js';
