import { Inject, Injectable } from '@nestjs/common';
import { OutboxRelay, withTransaction, toIsoString, type Database } from '@copalibre/persistence';
import { sql, type Kysely } from 'kysely';
import { DATABASE } from '../../database.token.js';
import type { DiagnosticsOutbox, RetryOutboxResponse } from '../../dto/diagnostics.dto.js';

@Injectable()
export class OutboxInspectorService {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  async summary(): Promise<DiagnosticsOutbox> {
    const [metrics, processed, failures] = await Promise.all([
      new OutboxRelay(this.db).metrics(),
      this.db
        .selectFrom('outbox_events')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('consumed_at', '>=', sql<Date>`current_timestamp - interval '24 hours'`)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('outbox_events')
        .select(['event_id', 'event_type', 'attempts', 'failures', 'dead_lettered_at'])
        .where('dead_lettered_at', 'is not', null)
        .orderBy('dead_lettered_at', 'desc')
        .limit(50)
        .execute(),
    ]);
    return {
      available: true,
      pending: metrics.queueDepth,
      processed24h: Number(processed.count),
      failed: metrics.deadLettered,
      oldestPendingAgeSeconds: metrics.oldestPendingSeconds,
      inFlight: metrics.inFlight,
      recentFailures: failures.map((row) => ({
        eventId: row.event_id,
        eventType: row.event_type,
        attempts: row.attempts,
        error: String(row.failures.at(-1)?.error ?? '').slice(0, 500),
        failedAt: row.dead_lettered_at
          ? toIsoString(row.dead_lettered_at)
          : new Date().toISOString(),
      })),
    };
  }

  async retry(
    eventIds: readonly string[],
    actor: string,
    authorizationContext: string,
  ): Promise<RetryOutboxResponse> {
    return withTransaction(this.db, async (uow) => {
      const retried: string[] = [];
      const skipped: string[] = [];
      // Stable lock order also protects overlapping concurrent remediation requests.
      for (const eventId of [...new Set(eventIds)].sort()) {
        const row = await uow.tx
          .selectFrom('outbox_events')
          .select(['organization_id', 'attempts'])
          .where('event_id', '=', eventId)
          .where('dead_lettered_at', 'is not', null)
          .where('consumed_at', 'is', null)
          .forUpdate()
          .executeTakeFirst();
        if (!row || !(await new OutboxRelay(uow.tx).reEnqueue(eventId))) {
          skipped.push(eventId);
          continue;
        }
        await uow.recordAudit({
          organizationId: row.organization_id,
          entityType: 'outbox-event',
          entityId: eventId,
          action: 'outbox.re-enqueued',
          actor,
          authorizationContext,
          previousState: { deadLettered: true, attempts: row.attempts },
          resultingState: { deadLettered: false, attempts: 0 },
        });
        await uow.publishEvent({
          organizationId: row.organization_id,
          stream: `outbox:${eventId}`,
          entityId: eventId,
          eventType: 'outbox.re-enqueued',
          projectionVersion: 1,
          payload: { eventId },
        });
        retried.push(eventId);
      }
      return { retried, skipped };
    });
  }
}
