import type { ClaimedJob, OutboxRelay } from '@copalibre/persistence';
import { DEFAULT_BACKOFF, delayForAttempt, isExhausted, type BackoffPolicy } from './backoff.js';
import type { JobDispatcher } from './dispatcher.js';

/**
 * One pass of the relay.
 *
 * Written as a function over an injected relay and dispatcher rather than as a
 * loop with a timer inside it: "process what is due, once" is testable, and
 * "run forever" is four lines wrapped around it.
 *
 * ## The order of operations is the guarantee
 *
 * Check the marker, run the handlers, then complete. A row redelivered after a
 * crash between the handler and the completion is caught by the marker on the
 * next pass, so the side effect happens once from the consumer's point of view
 * — which is the strongest thing a queue can honestly promise.
 */

export interface RunnerOptions {
  readonly consumer: string;
  readonly worker: string;
  readonly batchSize?: number;
  readonly leaseSeconds?: number;
  readonly backoff?: BackoffPolicy;
}

export interface PassResult {
  readonly claimed: number;
  readonly processed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly deadLettered: number;
}

export async function runRelayPass(
  relay: OutboxRelay,
  dispatcher: JobDispatcher,
  options: RunnerOptions,
): Promise<PassResult> {
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const claimed = await relay.claim({
    worker: options.worker,
    ...(options.batchSize === undefined ? {} : { limit: options.batchSize }),
    ...(options.leaseSeconds === undefined ? {} : { leaseSeconds: options.leaseSeconds }),
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const job of claimed) {
    if (await relay.wasProcessed(options.consumer, job.eventId)) {
      // Applied already. Completing it again is how a redelivery becomes a
      // no-op rather than a second side effect.
      await relay.complete({ eventId: job.eventId, consumer: options.consumer });
      skipped += 1;
      continue;
    }

    try {
      await dispatcher.dispatch(job);
      await relay.complete({ eventId: job.eventId, consumer: options.consumer });
      processed += 1;
    } catch (error) {
      const exhausted = isExhausted(job.attempts, backoff);
      await relay.fail({
        eventId: job.eventId,
        attempt: job.attempts,
        error: messageOf(error),
        retryInSeconds: exhausted ? 0 : delayForAttempt(job.attempts, backoff, job.eventId),
        deadLetter: exhausted,
      });
      failed += 1;
      if (exhausted) deadLettered += 1;
    }
  }

  return { claimed: claimed.length, processed, skipped, failed, deadLettered };
}

/**
 * What an operator reads in a log line. An `Error` gives its message; anything
 * else is stringified rather than becoming "[object Object]", which is the
 * least useful thing a failure history can contain.
 */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** Sugar for a handler that only cares about the payload. */
export function payloadOf<T = Record<string, unknown>>(job: ClaimedJob): T {
  return job.payload as T;
}
