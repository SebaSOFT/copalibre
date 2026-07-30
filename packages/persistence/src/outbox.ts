import type { Kysely } from 'kysely';
import { toIsoString } from './mapping';
import type { Database } from './schema';

/**
 * Read side of the transactional outbox. Writes go through
 * UnitOfWork.publishEvent; *consumption* (relay, projection recalculation,
 * dead-lettering) is phase 0009's scope — this phase only guarantees the row
 * exists in the same commit as the mutation that caused it.
 *
 * Field names here are the camelCase SSE envelope the events tier (phase 0010)
 * emits; the snake_case column mapping lives in this package by design.
 */
export interface OutboxRecord {
  readonly eventId: string;
  readonly organizationId: string;
  readonly stream: string;
  readonly entityId: string;
  readonly eventType: string;
  readonly projectionVersion: number;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
  readonly consumedAt?: string;
}

export class OutboxReader {
  constructor(private readonly db: Kysely<Database>) {}

  /** Oldest unconsumed events first — the shape phase 0009's relay polls. */
  async pending(limit = 100): Promise<readonly OutboxRecord[]> {
    const rows = await this.db
      .selectFrom('outbox_events')
      .selectAll()
      .where('consumed_at', 'is', null)
      .orderBy('created_at')
      .orderBy('event_id')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      eventId: row.event_id,
      organizationId: row.organization_id,
      stream: row.stream,
      entityId: row.entity_id,
      eventType: row.event_type,
      projectionVersion: row.projection_version,
      payload: row.payload as Record<string, unknown>,
      createdAt: toIsoString(row.created_at),
      consumedAt: row.consumed_at ? toIsoString(row.consumed_at) : undefined,
    }));
  }

  async countFor(entityId: string): Promise<number> {
    const row = await this.db
      .selectFrom('outbox_events')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('entity_id', '=', entityId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }
}
