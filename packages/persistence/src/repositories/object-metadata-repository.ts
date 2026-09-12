import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import { InvariantViolationError, NotFoundError } from '../errors.js';
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

  /**
   * Every passed object in the organization that no `*_object_id` column
   * currently names — the same reference graph `delete` checks for one
   * object, listed for the storage-usage screen's cleanup action.
   */
  async listUnreferenced(organizationId: string): Promise<readonly ObjectMetadata[]> {
    const rows = await this.db
      .selectFrom('object_metadata as om')
      .selectAll('om')
      .where('om.organization_id', '=', organizationId)
      .where('om.status', '=', 'passed')
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('organizations')
              .select('organization_id')
              .whereRef('organizations.emblem_object_id', '=', 'om.object_id'),
          ),
        ),
      )
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('clubs')
              .select('club_id')
              .whereRef('clubs.emblem_object_id', '=', 'om.object_id'),
          ),
        ),
      )
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('persons')
              .select('person_id')
              .whereRef('persons.photo_object_id', '=', 'om.object_id'),
          ),
        ),
      )
      .orderBy('om.created_at', 'desc')
      .execute();
    return rows.map(toObjectMetadata);
  }

  /**
   * What currently references this object, across every `*_object_id`
   * column — an organization's or club's current emblem, or a person's
   * current photo. `undefined` means nothing does, the only state `delete`
   * permits.
   */
  private async referencingEntity(
    tx: UnitOfWork['tx'],
    objectId: string,
  ): Promise<{ readonly entityType: string; readonly entityId: string } | undefined> {
    const [organization, club, person, tournament] = await Promise.all([
      tx
        .selectFrom('organizations')
        .select('organization_id')
        .where('emblem_object_id', '=', objectId)
        .executeTakeFirst(),
      tx
        .selectFrom('clubs')
        .select('club_id')
        .where('emblem_object_id', '=', objectId)
        .executeTakeFirst(),
      tx
        .selectFrom('persons')
        .select('person_id')
        .where('photo_object_id', '=', objectId)
        .executeTakeFirst(),
      tx
        .selectFrom('tournaments')
        .select('tournament_id')
        .where('emblem_object_id', '=', objectId)
        .executeTakeFirst(),
    ]);
    if (organization) return { entityType: 'organization', entityId: organization.organization_id };
    if (club) return { entityType: 'club', entityId: club.club_id };
    if (person) return { entityType: 'person', entityId: person.person_id };
    if (tournament) return { entityType: 'tournament', entityId: tournament.tournament_id };
    return undefined;
  }

  /**
   * Deletes a stored object's metadata, refusing while any entity still
   * references it — the reference check and the delete run in the same
   * transaction (design.md, "Object deletion checks reference, not usage
   * history"), so a concurrent writer either commits its reference first
   * (refusing this) or this commits first (the writer's own foreign key
   * then refuses it).
   */
  async delete(uow: UnitOfWork, objectId: string, context: AuditContext): Promise<ObjectMetadata> {
    const referencedBy = await this.referencingEntity(uow.tx, objectId);
    if (referencedBy) {
      throw new InvariantViolationError(
        `Cannot delete object "${objectId}": it is the ${referencedBy.entityType}'s current ` +
          `${referencedBy.entityType === 'person' ? 'photo' : 'emblem'} (${referencedBy.entityId})`,
        { objectId, ...referencedBy },
      );
    }

    const deleted = await uow.tx
      .deleteFrom('object_metadata')
      .where('object_id', '=', objectId)
      .where('organization_id', '=', context.organizationId)
      .returningAll()
      .executeTakeFirst();
    if (!deleted) {
      throw new NotFoundError(`No object "${objectId}" in this organization`, { objectId });
    }
    const metadata = toObjectMetadata(deleted);

    await uow.recordAudit({
      organizationId: context.organizationId,
      entityType: 'object-metadata',
      entityId: objectId,
      action: 'object.deleted',
      actor: context.actor,
      authorizationContext: context.authorizationContext,
      previousState: { status: metadata.status, sizeBytes: metadata.sizeBytes },
    });

    return metadata;
  }
}

function toObjectMetadata(row: {
  object_id: string;
  organization_id: string;
  profile: string;
  storage_key: string;
  content_type: string;
  // bigint: node-postgres returns this as a string to avoid unsafe-integer loss.
  size_bytes: number | string;
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
    sizeBytes: Number(row.size_bytes),
    uploadedBy: row.uploaded_by,
    status: row.status as ObjectStorageMetadataStatus,
    createdAt: row.created_at.toISOString(),
  };
}
