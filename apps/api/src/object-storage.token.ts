/**
 * Explicit injection token for the object-storage adapter.
 *
 * Never `undefined`: `objectStorageConfigFromEnv` always resolves to either
 * a configured S3-compatible endpoint or the local-filesystem fallback
 * profile, so every installation can accept evidence uploads.
 */
export const OBJECT_STORAGE = Symbol.for('copalibre.object-storage');
