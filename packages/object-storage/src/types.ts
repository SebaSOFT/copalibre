/**
 * Which backend is actually storing bytes for this adapter instance — fixed
 * at configuration time, never chosen per call. Exposed on the adapter (task
 * 1.1) purely for callers that want to record it (e.g. `packages/persistence`'s
 * object metadata table), never to branch behavior: every caller of `put`/
 * `get`/`delete` sees the same contract regardless of which profile is
 * active (design.md's "callers never see which profile is active").
 */
export type StorageProfile = 's3' | 'filesystem';

/**
 * A profile-agnostic pointer to a stored object. Only the adapter's own
 * implementation knows whether `key` resolves to an S3 object key or a path
 * under a local root directory.
 */
export interface ObjectReference {
  readonly key: string;
}

export interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType?: string;
}

export interface ObjectStorageAdapter {
  readonly profile: StorageProfile;
  put(key: string, body: Uint8Array, contentType: string): Promise<ObjectReference>;
  get(reference: ObjectReference): Promise<StoredObject>;
  delete(reference: ObjectReference): Promise<void>;
}
