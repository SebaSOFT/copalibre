import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import type { Database } from '../schema.js';

export type ObjectStorageMetadataProfile = 's3' | 'filesystem';
export type ObjectStorageMetadataStatus = 'pending' | 'passed' | 'failed';

export interface ObjectMetadata {
  readonly objectId: string;
  readonly profile: ObjectStorageMetadataProfile;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedBy: string;
  readonly status: ObjectStorageMetadataStatus;
  readonly createdAt: string;
}

/**
 * The object-storage capability's own metadata registry (0041 task 1.4) —
 * not every caller of `@copalibre/object-storage` needs a row here (one with
 * its own domain table, like `report_evidence`, doesn't); this is for a
 * caller with no such table, and for the async media-processing job (task 2)
 * to track scan/validation status generically.
 */
export class ObjectMetadataRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async save(input: {
    readonly profile: ObjectStorageMetadataProfile;
    readonly storageKey: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly uploadedBy: string;
  }): Promise<ObjectMetadata> {
    const objectId = newId();
    const createdAt = new Date();
    await this.db
      .insertInto('object_metadata')
      .values({
        object_id: objectId,
        profile: input.profile,
        storage_key: input.storageKey,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
        uploaded_by: input.uploadedBy,
        status: 'pending',
        created_at: createdAt,
      })
      .execute();

    return {
      objectId,
      profile: input.profile,
      storageKey: input.storageKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedBy: input.uploadedBy,
      status: 'pending',
      createdAt: createdAt.toISOString(),
    };
  }

  async findById(objectId: string): Promise<ObjectMetadata | undefined> {
    const row = await this.db
      .selectFrom('object_metadata')
      .selectAll()
      .where('object_id', '=', objectId)
      .executeTakeFirst();
    return row ? toObjectMetadata(row) : undefined;
  }

  async setStatus(objectId: string, status: ObjectStorageMetadataStatus): Promise<void> {
    await this.db
      .updateTable('object_metadata')
      .set({ status })
      .where('object_id', '=', objectId)
      .execute();
  }
}

function toObjectMetadata(row: {
  object_id: string;
  profile: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  status: string;
  created_at: Date;
}): ObjectMetadata {
  return {
    objectId: row.object_id,
    profile: row.profile as ObjectStorageMetadataProfile,
    storageKey: row.storage_key,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    status: row.status as ObjectStorageMetadataStatus,
    createdAt: row.created_at.toISOString(),
  };
}
