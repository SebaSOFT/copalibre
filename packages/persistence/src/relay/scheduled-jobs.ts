import { sql, type Kysely } from 'kysely';
import type { Database } from '../schema.js';
import { newId } from '../ids.js';

/**
 * Recurring work, registered by later phases and enqueued by the scheduler
 * (0017).
 *
 * The scheduler **only enqueues**. It never runs a job, because a scheduler
 * that also executes is a scheduler whose slow job delays every other job's
 * schedule — and because the worker already has retry, backoff and
 * dead-lettering that would otherwise have to exist twice.
 */

export interface ScheduledJob {
  readonly jobName: string;
  readonly organizationId?: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly intervalSeconds: number;
  readonly enabled: boolean;
}

export class ScheduledJobStore {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Registers or updates a recurring job.
   *
   * Idempotent on the name so a replica restarting does not create a second
   * copy of the same schedule — every replica registers the same jobs at boot,
   * and only one of them will hold the lease that enqueues them.
   */
  async register(job: ScheduledJob): Promise<void> {
    await this.db
      .insertInto('scheduled_jobs')
      .values({
        job_name: job.jobName,
        organization_id: job.organizationId ?? null,
        event_type: job.eventType,
        payload: JSON.stringify(job.payload),
        interval_seconds: job.intervalSeconds,
        enabled: job.enabled,
        created_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict.column('job_name').doUpdateSet({
          event_type: job.eventType,
          payload: JSON.stringify(job.payload),
          interval_seconds: job.intervalSeconds,
          enabled: job.enabled,
        }),
      )
      .execute();
  }

  /**
   * Enqueues every job whose interval has elapsed, exactly once per interval.
   *
   * The due check and the `last_enqueued_at` write are one statement guarded by
   * `for update skip locked`, so three replicas racing produce one row rather
   * than three: the lease makes that rare, and this makes it impossible.
   */
  async enqueueDue(now = new Date()): Promise<readonly string[]> {
    return this.db.transaction().execute(async (tx) => {
      const { rows: due } = await sql<{
        job_name: string;
        organization_id: string | null;
        event_type: string;
        payload: Record<string, unknown>;
      }>`
        select job_name, organization_id, event_type, payload
        from scheduled_jobs
        where enabled
          and (
            last_enqueued_at is null
            or last_enqueued_at + make_interval(secs => interval_seconds) <= ${now}
          )
        for update skip locked
      `.execute(tx);

      for (const job of due) {
        await tx
          .insertInto('outbox_events')
          .values({
            event_id: newId(),
            organization_id: job.organization_id ?? SYSTEM_ORGANIZATION,
            stream: `schedule:${job.job_name}`,
            entity_id: SYSTEM_ORGANIZATION,
            event_type: job.event_type,
            projection_version: 0,
            payload: JSON.stringify({ ...job.payload, jobName: job.job_name }),
            created_at: now,
            consumed_at: null,
          })
          .execute();

        await tx
          .updateTable('scheduled_jobs')
          .set({ last_enqueued_at: now })
          .where('job_name', '=', job.job_name)
          .execute();
      }

      return due.map((job) => job.job_name);
    });
  }

  async list(): Promise<readonly ScheduledJob[]> {
    const rows = await this.db
      .selectFrom('scheduled_jobs')
      .selectAll()
      .orderBy('job_name')
      .execute();

    return rows.map((row) => ({
      jobName: row.job_name,
      ...(row.organization_id === null ? {} : { organizationId: row.organization_id }),
      eventType: row.event_type,
      payload: row.payload as Record<string, unknown>,
      intervalSeconds: row.interval_seconds,
      enabled: row.enabled,
    }));
  }
}

/**
 * A scheduled job belongs to no organization when it is platform work. The
 * outbox column is not nullable, so system work is attributed to the nil UUID
 * rather than to whichever tenant happened to be first.
 */
export const SYSTEM_ORGANIZATION = '00000000-0000-0000-0000-000000000000';
