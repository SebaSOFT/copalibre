import type { ClaimedJob } from '@copalibre/persistence';

/**
 * What runs for a given `eventType` (0017).
 *
 * This phase builds the substrate; the jobs themselves belong to the phases
 * that need them — notification delivery, exports, media. So the dispatcher is
 * a registry, and an event type nobody registered is **not** an error: the
 * outbox is also read by the SSE tier and by projections, and a relay that
 * dead-lettered every event it personally had no handler for would bury the
 * queue in work that was never its own.
 */

export type JobHandler = (job: ClaimedJob) => Promise<void>;

export interface DispatchOutcome {
  readonly handled: boolean;
  readonly handlers: number;
}

export class JobDispatcher {
  private readonly handlers = new Map<string, JobHandler[]>();

  /**
   * Registers a handler. Several may share an event type — a finalized match
   * both refolds statistics and notifies — and they run in registration order.
   */
  register(eventType: string, handler: JobHandler): this {
    this.handlers.set(eventType, [...(this.handlers.get(eventType) ?? []), handler]);
    return this;
  }

  registered(eventType: string): number {
    return this.handlers.get(eventType)?.length ?? 0;
  }

  /**
   * Runs every handler for the job's type, in order, stopping at the first
   * failure.
   *
   * Sequential rather than parallel: two handlers for one event usually touch
   * the same aggregate, and a half-applied pair is harder to reason about than
   * a slower queue. The first failure propagates, so the row is retried — with
   * the handlers that already succeeded protected by their own idempotency, not
   * by the dispatcher pretending they did not run.
   */
  async dispatch(job: ClaimedJob): Promise<DispatchOutcome> {
    const handlers = this.handlers.get(job.eventType) ?? [];
    for (const handler of handlers) {
      await handler(job);
    }
    return { handled: handlers.length > 0, handlers: handlers.length };
  }
}
