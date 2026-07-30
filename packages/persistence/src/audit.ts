import type { Kysely } from 'kysely';
import { toIsoString } from './mapping.js';
import type { Database } from './schema.js';

/** Read side of the audit trail. Writes go through UnitOfWork.recordAudit. */
export interface AuditRecord {
  readonly auditId: string;
  readonly organizationId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly previousState?: Record<string, unknown>;
  readonly resultingState?: Record<string, unknown>;
  readonly reason?: string;
  readonly occurredAt: string;
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

    return rows.map((row) => ({
      auditId: row.audit_id,
      organizationId: row.organization_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      actor: row.actor,
      authorizationContext: row.authorization_context,
      previousState: (row.previous_state as Record<string, unknown> | null) ?? undefined,
      resultingState: (row.resulting_state as Record<string, unknown> | null) ?? undefined,
      reason: row.reason ?? undefined,
      occurredAt: toIsoString(row.occurred_at),
    }));
  }
}
