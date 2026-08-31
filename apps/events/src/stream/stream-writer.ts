import type { SubscriptionService, SubscriptionQuery } from './subscription.js';

/**
 * The polling loop behind one open SSE connection.
 *
 * It polls the outbox rather than waiting on a notification. `LISTEN/NOTIFY`
 * would be lower latency and would also mean an event published while this
 * replica was reconnecting to PostgreSQL is an event nobody ever sends — the
 * cursor is the recovery mechanism, and polling it is what makes the recovery
 * automatic instead of a special case.
 *
 * Written against a minimal sink rather than a Fastify reply so the loop is
 * testable without a socket: the interesting behaviour is what it writes and
 * when it stops, neither of which needs HTTP to observe.
 */

export interface StreamSink {
  write(chunk: string): void;
  /** Whether the client is still there; a closed socket ends the loop. */
  isOpen(): boolean;
}

export interface StreamOptions {
  readonly pollMs?: number;
  readonly heartbeatMs?: number;
  /** Stops the loop; the controller wires it to the request's close event. */
  readonly signal?: AbortSignal;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

export interface StreamOutcome {
  readonly sent: number;
  readonly heartbeats: number;
  readonly stopped: 'closed' | 'aborted' | 'expired';
}

/**
 * Streams until the client goes away.
 *
 * A replay-window expiry ends the loop after telling the client what to do: it
 * has to fetch a projection, and holding the connection open would leave it
 * receiving events that sit on top of state it does not have.
 */
export async function streamEvents(
  subscriptions: SubscriptionService,
  sink: StreamSink,
  query: SubscriptionQuery,
  options: StreamOptions = {},
): Promise<StreamOutcome> {
  const pollMs = options.pollMs ?? 1000;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  let cursor = query.afterEventId;
  let sent = 0;
  let heartbeats = 0;
  let lastWrite = now();

  for (;;) {
    if (options.signal?.aborted) return { sent, heartbeats, stopped: 'aborted' };
    if (!sink.isOpen()) return { sent, heartbeats, stopped: 'closed' };

    const batch = await subscriptions.next({
      ...query,
      ...(cursor === undefined ? {} : { afterEventId: cursor }),
    });

    if (batch.kind === 'expired') {
      sink.write(subscriptions.encode(batch));
      return { sent, heartbeats, stopped: 'expired' };
    }

    if (batch.events.length > 0) {
      sink.write(subscriptions.encode(batch));
      sent += batch.events.length;
      lastWrite = now();
    } else if (now() - lastWrite >= heartbeatMs) {
      // Nothing happened, which is not the same as nothing working. A reverse
      // proxy closes an idle connection, and a stream that only speaks when
      // there is news looks exactly like one that broke.
      sink.write(subscriptions.heartbeat());
      heartbeats += 1;
      lastWrite = now();
    }

    // Advances past everything *read*, including events this subscriber was not
    // allowed to see — otherwise a public client behind a run of private events
    // re-reads them forever and never reaches the ones it may have.
    if (batch.cursor !== undefined) cursor = batch.cursor;

    await sleep(pollMs);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
