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

/** True whenever the record is a refusal, never a completed change — see `recordAuditRefusal`. */
export function isRefusal(record: AuditRecord): boolean {
  return record.resultingState === undefined && record.reason !== undefined;
}

export interface AuditPage {
  readonly records: readonly AuditRecord[];
  /** Total matching rows, independent of `limit`/`offset` — lets a reader show "page N of M". */
  readonly total: number;
}

export interface AuditPageOptions {
  readonly limit: number;
  readonly offset: number;
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

  /**
   * What happened in an organization — newest first, paginated so a large
   * trail is readable without loading it whole (task 4.1). The reader's own
   * authority scopes which organization this is called for; this class has
   * no opinion on authorization.
   */
  async forOrganization(organizationId: string, options: AuditPageOptions): Promise<AuditPage> {
    return this.page({ organizationId }, options);
  }

  /** What one actor did, within one organization — "what did this user do". */
  async forActor(
    organizationId: string,
    actor: string,
    options: AuditPageOptions,
  ): Promise<AuditPage> {
    return this.page({ organizationId, actor }, options);
  }

  private async page(
    filter: { readonly organizationId: string; readonly actor?: string },
    options: AuditPageOptions,
  ): Promise<AuditPage> {
    let rowsQuery = this.db
      .selectFrom('audit_log')
      .selectAll()
      .where('organization_id', '=', filter.organizationId);
    let countQuery = this.db
      .selectFrom('audit_log')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .where('organization_id', '=', filter.organizationId);
    if (filter.actor !== undefined) {
      rowsQuery = rowsQuery.where('actor', '=', filter.actor);
      countQuery = countQuery.where('actor', '=', filter.actor);
    }

    const rows = await rowsQuery
      .orderBy('occurred_at', 'desc')
      .orderBy('audit_id', 'desc')
      .limit(options.limit)
      .offset(options.offset)
      .execute();
    const { total } = await countQuery.executeTakeFirstOrThrow();

    return { records: rows.map(toAuditRecord), total: Number(total) };
  }
}
