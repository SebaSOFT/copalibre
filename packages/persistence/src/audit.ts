import type { Kysely } from 'kysely';
import type { AuditAction } from '@copalibre/domain';
import { toIsoString } from './mapping.js';
import type { Database } from './schema.js';

/** Read side of the audit trail. Writes go through UnitOfWork.recordAudit. */
export interface AuditRecord {
  readonly auditId: string;
  readonly organizationId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly previousState?: Record<string, unknown>;
  readonly resultingState?: Record<string, unknown>;
  readonly reason?: string;
  readonly occurredAt: string;
}

/**
 * `audit_log.action` is stored as `text`, wider than the closed `AuditAction`
 * union it always actually holds (every writer goes through
 * `UnitOfWork.recordAudit`, typed against that union) — cast once, here,
 * rather than at every reader.
 */
export function toAuditRecord(row: {
  readonly audit_id: string;
  readonly organization_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly action: string;
  readonly actor: string;
  readonly authorization_context: string;
  readonly previous_state: unknown;
  readonly resulting_state: unknown;
  readonly reason: string | null;
  readonly occurred_at: Date;
}): AuditRecord {
  return {
    auditId: row.audit_id,
    organizationId: row.organization_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action as AuditAction,
    actor: row.actor,
    authorizationContext: row.authorization_context,
    previousState: (row.previous_state as Record<string, unknown> | null) ?? undefined,
    resultingState: (row.resulting_state as Record<string, unknown> | null) ?? undefined,
    reason: row.reason ?? undefined,
    occurredAt: toIsoString(row.occurred_at),
  };
}

export class AuditReader {
  constructor(private readonly db: Kysely<Database>) {}

  /** Chronological history for one aggregate — oldest first. */
  async historyFor(entityType: string, entityId: string): Promise<readonly AuditRecord[]> {
    const rows = await this.db
      .selectFrom('audit_log')
      .selectAll()
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .orderBy('occurred_at')
      .orderBy('audit_id')
      .execute();

    return rows.map(toAuditRecord);
  }
}
