import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

export type ObjectStorageMetadataProfile = 's3' | 'filesystem';
export type ObjectStorageMetadataStatus = 'pending' | 'passed' | 'failed';

/**
 * Published on the same transaction as an `object_metadata` insert (task
 * 2.1), so the async media-processing job always sees a durably-committed
 * row — the same "row before job" ordering `EVIDENCE_VALIDATION_REQUESTED_EVENT`
 * already established for evidence uploads.
 */
export const OBJECT_PROCESSING_REQUESTED_EVENT = 'object-storage.processing-requested';

export interface ObjectMetadata {
  readonly objectId: string;
  readonly organizationId: string;
  readonly profile: ObjectStorageMetadataProfile;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedBy: string;
  readonly status: ObjectStorageMetadataStatus;
  readonly createdAt: string;
}

/**
 * The object-storage capability's metadata registry —
 * not every caller of `@copalibre/object-storage` needs a row here (one with
 * its own domain table, like `report_evidence`, doesn't); this is for a
 * caller with no such table, and for the async media-processing job (task 2)
 * to track scan/validation status generically.
 */
export interface OrganizationStorageUsage {
  readonly totalBytes: number;
  readonly objectCount: number;
}

export class ObjectMetadataRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Computes the total bytes and object count of passed objects for an organization. */
  async usageByOrganization(organizationId: string): Promise<OrganizationStorageUsage> {
    const row = await this.db
      .selectFrom('object_metadata')
      .select((eb) => [
        eb.fn.sum<string | number | null>('size_bytes').as('totalBytes'),
        eb.fn.countAll<string | number>().as('objectCount'),
      ])
      .where('organization_id', '=', organizationId)
      .where('status', '=', 'passed')
      .executeTakeFirst();

    return {
      totalBytes: Number(row?.totalBytes ?? 0),
      objectCount: Number(row?.objectCount ?? 0),
    };
  }

  /** Records the object and enqueues async processing (task 2.1) in the same transaction. */
  async save(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly profile: ObjectStorageMetadataProfile;
      readonly storageKey: string;
      readonly contentType: string;
      readonly sizeBytes: number;
      readonly uploadedBy: string;
    },
  ): Promise<ObjectMetadata> {
    const objectId = newId();
    const createdAt = new Date();
    await uow.tx
      .insertInto('object_metadata')
      .values({
        object_id: objectId,
        organization_id: input.organizationId,
        profile: input.profile,
        storage_key: input.storageKey,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
        uploaded_by: input.uploadedBy,
        status: 'pending',
        created_at: createdAt,
      })
      .execute();

    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `object-metadata:${objectId}`,
      entityId: objectId,
      eventType: OBJECT_PROCESSING_REQUESTED_EVENT,
      projectionVersion: 1,
      payload: { objectId },
    });

    return {
      objectId,
      organizationId: input.organizationId,
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

  /** A routine, expected outcome — no audit entry. */
  async markPassed(objectId: string): Promise<void> {
    await this.db
      .updateTable('object_metadata')
      .set({ status: 'passed' })
      .where('object_id', '=', objectId)
      .execute();
  }

  /** A malware/validation failure (task 2.5) — exactly the kind of fact the audit trail exists for. */
  async markFailed(
    uow: UnitOfWork,
    objectId: string,
    reason: string,
    context: AuditContext,
  ): Promise<void> {
    await uow.tx
      .updateTable('object_metadata')
      .set({ status: 'failed' })
      .where('object_id', '=', objectId)
      .execute();

    await uow.recordAudit({
      organizationId: context.organizationId,
      entityType: 'object-metadata',
      entityId: objectId,
      action: 'object.scan-failed',
      actor: context.actor,
      authorizationContext: context.authorizationContext,
      resultingState: { status: 'failed', reason },
    });
  }
}

function toObjectMetadata(row: {
  object_id: string;
  organization_id: string;
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
    organizationId: row.organization_id,
    profile: row.profile as ObjectStorageMetadataProfile,
    storageKey: row.storage_key,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    status: row.status as ObjectStorageMetadataStatus,
    createdAt: row.created_at.toISOString(),
  };
}
