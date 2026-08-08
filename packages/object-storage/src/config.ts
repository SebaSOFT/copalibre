import type { FilesystemStorageConfig } from './filesystem-profile.js';
import type { S3StorageConfig } from './s3-profile.js';

export type ObjectStorageConfig = S3StorageConfig | FilesystemStorageConfig;

/**
 * Resolves the active profile from the environment (task 1.1/1.3): a fully
 * configured S3-compatible endpoint takes precedence, otherwise the
 * filesystem fallback is used, rooted under `COPALIBRE_DATA_DIR` (the same
 * persistent path `copalibre doctor`'s own `persistent-path` check already
 * requires) — a single-node self-hosted install SHALL run with no separate
 * object-storage service (architecture doc's explicit allowance), so this
 * never returns `undefined`: something always resolves.
 */
export function objectStorageConfigFromEnv(env: NodeJS.ProcessEnv): ObjectStorageConfig {
  const endpoint = env.COPALIBRE_OBJECT_STORAGE_URL;
  if (endpoint) {
    const accessKeyId = env.COPALIBRE_OBJECT_STORAGE_ACCESS_KEY;
    const secretAccessKey = env.COPALIBRE_OBJECT_STORAGE_SECRET_KEY;
    const bucket = env.COPALIBRE_OBJECT_STORAGE_BUCKET;
    if (accessKeyId && secretAccessKey && bucket) {
      return {
        profile: 's3',
        endpoint,
        accessKeyId,
        secretAccessKey,
        bucket,
        ...(env.COPALIBRE_OBJECT_STORAGE_REGION
          ? { region: env.COPALIBRE_OBJECT_STORAGE_REGION }
          : {}),
      };
    }
  }

  const dataDirectory = env.COPALIBRE_DATA_DIR ?? './data';
  const rootDirectory = env.COPALIBRE_OBJECT_STORAGE_FILESYSTEM_ROOT ?? `${dataDirectory}/objects`;
  return { profile: 'filesystem', rootDirectory };
}
