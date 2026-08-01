import { sql, type Kysely } from 'kysely';
import { toIsoString } from '../mapping.js';
import type { OutboxRecord } from '../outbox.js';
import type { Database } from '../schema.js';

/**
 * The claim side of the transactional outbox (0017-worker-scheduler-async-jobs).
 *
 * `SELECT ... FOR UPDATE SKIP LOCKED` is the whole coordination mechanism: any
 * number of workers may poll, each takes rows nobody else holds, and no broker
 * is involved. The architecture doc keeps PostgreSQL authoritative here on
 * purpose — "Redis/BullMQ is optional for derived throughput... and is never
 * authoritative" — so adding one later is an adapter, not a redesign.
 *
 * ## Why a claim expires
 *
 * A worker that dies mid-processing holds its rows forever unless the claim
 * carries a deadline. `claimed_until` is that deadline, and it is compared
 * against the database's clock rather than the worker's: two machines
 * disagreeing about the time is exactly the situation this has to survive.
 */

export interface ClaimedJob extends OutboxRecord {
  readonly attempts: number;
  readonly claimedBy: string;
  readonly failures: readonly JobFailure[];
}

export interface JobFailure {
  readonly attempt: number;
  readonly at: string;
  readonly error: string;
}

export interface DeadLetter extends ClaimedJob {
  readonly deadLetteredAt: string;
}

export interface RelayMetrics {
  /** Rows waiting to be processed, dead letters excluded. */
  readonly queueDepth: number;
  /** Seconds since the oldest pending row was written; 0 when the queue is empty. */
  readonly oldestPendingSeconds: number;
  readonly inFlight: number;
  readonly deadLettered: number;
  /** Attempts beyond the first, across pending rows. */
  readonly retries: number;
  /** Dead letters as a share of rows that reached a terminal state. */
  readonly failureRate: number;
}

export class OutboxRelay {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Claims up to `limit` due rows for one worker.
   *
   * Skips what another worker holds rather than waiting for it: a relay that
   * blocks on a locked row converts one slow handler into a stalled queue.
   */
  async claim(input: {
    readonly worker: string;
    readonly limit?: number;
    readonly leaseSeconds?: number;
  }): Promise<readonly ClaimedJob[]> {
    const limit = input.limit ?? 20;
    const leaseSeconds = input.leaseSeconds ?? 30;

    const { rows } = await sql<ClaimedRow>`
      update outbox_events
      set claimed_by = ${input.worker},
          claimed_until = now() + make_interval(secs => ${leaseSeconds}),
          attempts = attempts + 1
      where event_id in (
        select event_id from outbox_events
        where consumed_at is null
          and dead_lettered_at is null
          and next_attempt_at <= now()
          and (claimed_until is null or claimed_until < now())
        order by created_at, event_id
        limit ${limit}
        for update skip locked
      )
      returning *
    `.execute(this.db);

    return rows.map(toClaimedJob);
  }

  /**
   * Marks a row done and records that this consumer applied it.
   *
   * Both in one transaction, because a marker without a completion would let a
   * redelivery skip work that never happened, and a completion without a marker
   * would let a second consumer's replay do it twice.
   */
  async complete(input: { readonly eventId: string; readonly consumer: string }): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('outbox_events')
        .set({ consumed_at: new Date(), claimed_by: null, claimed_until: null })
        .where('event_id', '=', input.eventId)
        .execute();

      await tx
        .insertInto('processed_markers')
        .values({ consumer: input.consumer, event_id: input.eventId, processed_at: new Date() })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    });
  }

  /** Whether this consumer already applied this row. */
  async wasProcessed(consumer: string, eventId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('processed_markers')
      .select('event_id')
      .where('consumer', '=', consumer)
      .where('event_id', '=', eventId)
      .executeTakeFirst();
    return row !== undefined;
  }

  /**
   * Records a failure and schedules the next attempt, or dead-letters when the
   * caller says the attempts are spent.
   *
   * The failure history is appended, never replaced: "it failed" is not an
   * answer an operator can act on, and the third failure is usually not the
   * interesting one.
   */
  async fail(input: {
    readonly eventId: string;
    readonly attempt: number;
    readonly error: string;
    readonly retryInSeconds?: number;
    readonly deadLetter: boolean;
  }): Promise<void> {
    const failure: JobFailure = {
      attempt: input.attempt,
      at: new Date().toISOString(),
      error: input.error,
    };

    await this.db
      .updateTable('outbox_events')
      .set({
        claimed_by: null,
        claimed_until: null,
        dead_lettered_at: input.deadLetter ? new Date() : null,
        next_attempt_at: sql`now() + make_interval(secs => ${input.retryInSeconds ?? 0})`,
        failures: sql`failures || ${JSON.stringify([failure])}::jsonb`,
      })
      .where('event_id', '=', input.eventId)
      .execute();
  }

  /**
   * Dead letters, newest first — inspected, never silently dropped.
   *
   * A queue that discards what it cannot process is a queue that loses a
   * finalized match and tells nobody.
   */
  async deadLetters(limit = 50): Promise<readonly DeadLetter[]> {
    const rows = await this.db
      .selectFrom('outbox_events')
      .selectAll()
      .where('dead_lettered_at', 'is not', null)
      .orderBy('dead_lettered_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      ...toClaimedJob(row as unknown as ClaimedRow),
      deadLetteredAt: toIsoString(row.dead_lettered_at ?? new Date()),
    }));
  }

  /**
   * Returns a dead letter to the queue, explicitly.
   *
   * Never automatic: retries were already exhausted, so re-enqueueing without a
   * human deciding something changed is just the same failure on a timer. The
   * failure history stays — it is why somebody re-enqueued.
   */
  async reEnqueue(eventId: string): Promise<boolean> {
    const result = await this.db
      .updateTable('outbox_events')
      .set({
        dead_lettered_at: null,
        attempts: 0,
        next_attempt_at: new Date(),
        claimed_by: null,
        claimed_until: null,
      })
      .where('event_id', '=', eventId)
      .where('dead_lettered_at', 'is not', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  /** What an operator watches: depth, age, retries, failures. */
  async metrics(): Promise<RelayMetrics> {
    const row = await this.db
      .selectFrom('outbox_events')
      .select([
        sql<string>`count(*) filter (where consumed_at is null and dead_lettered_at is null)`.as(
          'queue_depth',
        ),
        sql<string>`count(*) filter (where claimed_until is not null and claimed_until > now())`.as(
          'in_flight',
        ),
        sql<string>`count(*) filter (where dead_lettered_at is not null)`.as('dead_lettered'),
        sql<string>`count(*) filter (where consumed_at is not null)`.as('consumed'),
        sql<string>`coalesce(sum(greatest(attempts - 1, 0)) filter (where consumed_at is null and dead_lettered_at is null), 0)`.as(
          'retries',
        ),
        sql<string>`coalesce(extract(epoch from now() - min(created_at) filter (where consumed_at is null and dead_lettered_at is null)), 0)`.as(
          'oldest_seconds',
        ),
      ])
      .executeTakeFirstOrThrow();

    const deadLettered = Number(row.dead_lettered);
    const terminal = deadLettered + Number(row.consumed);

    return {
      queueDepth: Number(row.queue_depth),
      oldestPendingSeconds: Math.max(0, Math.round(Number(row.oldest_seconds))),
      inFlight: Number(row.in_flight),
      deadLettered,
      retries: Number(row.retries),
      failureRate: terminal === 0 ? 0 : deadLettered / terminal,
    };
  }
}

interface ClaimedRow {
  readonly event_id: string;
  readonly organization_id: string;
  readonly stream: string;
  readonly entity_id: string;
  readonly event_type: string;
  readonly projection_version: number;
  readonly payload: Record<string, unknown>;
  readonly created_at: Date;
  readonly consumed_at: Date | null;
  readonly claimed_by: string | null;
  readonly attempts: number;
  readonly failures: readonly JobFailure[] | null;
}

function toClaimedJob(row: ClaimedRow): ClaimedJob {
  return {
    eventId: row.event_id,
    organizationId: row.organization_id,
    stream: row.stream,
    entityId: row.entity_id,
    eventType: row.event_type,
    projectionVersion: row.projection_version,
    payload: row.payload,
    createdAt: toIsoString(row.created_at),
    ...(row.consumed_at === null ? {} : { consumedAt: toIsoString(row.consumed_at) }),
    attempts: row.attempts,
    claimedBy: row.claimed_by ?? '',
    failures: row.failures ?? [],
  };
}
