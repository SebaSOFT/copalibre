import type { Kysely, Transaction } from 'kysely';
import type { AuditAction } from '@copalibre/domain';
import { newId } from './ids.js';
import type { Database } from './schema.js';

/**
 * The single transaction boundary. "Write domain mutation, audit record, and
 * outbox event in one database transaction" (architecture doc, "Background work
 * and scheduling") — so audit and outbox writes are only reachable through the
 * context this wrapper hands out, never as standalone repository calls.
 */

export interface AuditEntry {
  readonly organizationId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly previousState?: Record<string, unknown>;
  readonly resultingState?: Record<string, unknown>;
  /** Required by product contract whenever a published result or schedule changes. */
  readonly reason?: string;
}

/**
 * A refused attempt at a consequential operation: authorization, lifecycle
 * state, or mutation classification. Unlike `AuditEntry`, there is no
 * `resultingState` — nothing happened — and `reason` is required, since
 * "why it was refused" is the entire point of the record.
 */
export interface AuditRefusalEntry {
  readonly organizationId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly reason: string;
  /** What was attempted, where it can be captured (a proposed field value, a command payload). */
  readonly previousState?: Record<string, unknown>;
}

export interface OutboxEvent {
  readonly organizationId: string;
  readonly stream: string;
  readonly entityId: string;
  readonly eventType: string;
  readonly projectionVersion: number;
  readonly payload: Record<string, unknown>;
}

/**
 * Handed to every repository method. Carries the open transaction plus the
 * audit/outbox writers bound to it — the reason a repository cannot write an
 * audit row outside a transaction (task 3.2) is that it has no other way to
 * reach one.
 */
export interface UnitOfWork {
  readonly tx: Transaction<Database>;
  recordAudit(entry: AuditEntry): Promise<string>;
  publishEvent(event: OutboxEvent): Promise<string>;
}

export async function withTransaction<T>(
  db: Kysely<Database>,
  work: (uow: UnitOfWork) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    const uow: UnitOfWork = {
      tx,
      async recordAudit(entry) {
        const auditId = newId();
        await tx
          .insertInto('audit_log')
          .values({
            audit_id: auditId,
            organization_id: entry.organizationId,
            entity_type: entry.entityType,
            entity_id: entry.entityId,
            action: entry.action,
            actor: entry.actor,
            authorization_context: entry.authorizationContext,
            previous_state: entry.previousState ? JSON.stringify(entry.previousState) : null,
            resulting_state: entry.resultingState ? JSON.stringify(entry.resultingState) : null,
            reason: entry.reason ?? null,
            occurred_at: new Date(),
          })
          .execute();
        return auditId;
      },
      async publishEvent(event) {
        const eventId = newId();
        await tx
          .insertInto('outbox_events')
          .values({
            event_id: eventId,
            organization_id: event.organizationId,
            stream: event.stream,
            entity_id: event.entityId,
            event_type: event.eventType,
            projection_version: event.projectionVersion,
            payload: JSON.stringify(event.payload),
            created_at: new Date(),
            consumed_at: null,
          })
          .execute();
        return eventId;
      },
    };

    return work(uow);
  });
}

/**
 * Records a refused attempt outside any mutation transaction — the
 * operation was refused, often before one was ever opened (an authorization
 * check runs before a repository is touched), so there is usually no
 * transaction to write inside. Best-effort by design (proposal.md, "Risk
 * concentrated in one place"): a failure here must never turn the refusal
 * the caller already returned into a server error, so it is caught and
 * handed to `onRecordingFailure` rather than re-thrown. Callers that have
 * their own error-reporting channel (the API's `Logger`, for instance)
 * should pass it; the default just logs, so a script or test never loses
 * the failure silently.
 */
export async function recordAuditRefusal(
  db: Kysely<Database>,
  entry: AuditRefusalEntry,
  onRecordingFailure: (error: unknown) => void = (error) => {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record a refusal', error);
  },
): Promise<void> {
  try {
    await db
      .insertInto('audit_log')
      .values({
        audit_id: newId(),
        organization_id: entry.organizationId,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        actor: entry.actor,
        authorization_context: entry.authorizationContext,
        previous_state: entry.previousState ? JSON.stringify(entry.previousState) : null,
        resulting_state: null,
        reason: entry.reason,
        occurred_at: new Date(),
      })
      .execute();
  } catch (error) {
    onRecordingFailure(error);
  }
}
