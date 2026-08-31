import {
  DEFAULT_REPLAY_WINDOW,
  EventStreamReader,
  type Database,
  type ReplayWindow,
} from '@copalibre/persistence';
import {
  encodeEvent,
  encodeHeartbeat,
  encodeReplayExpired,
  sanitiseForPublic,
  toEnvelope,
  type EventEnvelope,
} from '@copalibre/realtime';
import type { Kysely } from 'kysely';

/**
 * Turning a cursor into frames.
 *
 * The transport is not here. This decides *what* a subscriber receives — the
 * replay, the sanitisation, the expiry signal — and the controller decides how
 * it reaches them, which is the only difference between the SSE endpoint and
 * the long-polling fallback. Two implementations of that decision would
 * eventually disagree about which side of the replay window a client is on, and
 * only one of them would be right.
 */

export type Visibility = 'public' | 'control';

export interface SubscriptionQuery {
  readonly organizationId: string;
  readonly tournamentId?: string;
  readonly afterEventId?: string;
  readonly limit?: number;
  readonly visibility: Visibility;
}

export type SubscriptionBatch =
  | { readonly kind: 'events'; readonly events: readonly EventEnvelope[]; readonly cursor?: string }
  | { readonly kind: 'expired'; readonly reason: string };

export class SubscriptionService {
  /**
   * Takes the reader rather than the database so the decisions here — what is
   * published, where the cursor lands — are testable without one. The database
   * is the factory's problem.
   */
  constructor(private readonly reader: EventStreamReader) {}

  static fromDatabase(
    db: Kysely<Database>,
    window: ReplayWindow = DEFAULT_REPLAY_WINDOW,
  ): SubscriptionService {
    return new SubscriptionService(new EventStreamReader(db, window));
  }

  /**
   * What this subscriber should receive now.
   *
   * A public subscriber gets only what the envelope module publishes; an event
   * type nobody listed is dropped here rather than filtered at each surface,
   * because three consumers each deciding what to hide is three chances for one
   * of them to forget.
   */
  async next(query: SubscriptionQuery): Promise<SubscriptionBatch> {
    const resolution = await this.reader.resolve({
      organizationId: query.organizationId,
      ...(query.tournamentId === undefined ? {} : { tournamentId: query.tournamentId }),
      ...(query.afterEventId === undefined ? {} : { afterEventId: query.afterEventId }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });

    if (resolution.kind === 'expired') {
      return { kind: 'expired', reason: resolution.reason };
    }

    const events: EventEnvelope[] = [];
    for (const record of resolution.events) {
      const envelope = toEnvelope(record);
      const visible = query.visibility === 'public' ? sanitiseForPublic(envelope) : envelope;
      if (visible) events.push(visible);
    }

    // The cursor advances past everything *read*, not everything *sent*: a
    // public subscriber that received nothing because the batch was all private
    // must not be handed the same batch forever.
    const lastRead = resolution.events[resolution.events.length - 1]?.eventId;

    return { kind: 'events', events, ...(lastRead === undefined ? {} : { cursor: lastRead }) };
  }

  /** The frames a batch becomes on the wire. */
  encode(batch: SubscriptionBatch): string {
    if (batch.kind === 'expired') return encodeReplayExpired(batch.reason);
    return batch.events.map(encodeEvent).join('');
  }

  heartbeat(): string {
    return encodeHeartbeat();
  }

  /** Where a subscriber with no cursor starts: now, not the beginning of time. */
  async latest(organizationId: string): Promise<string | undefined> {
    return this.reader.latestEventId(organizationId);
  }
}
