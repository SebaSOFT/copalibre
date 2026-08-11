/**
 * The event envelope, and what a public stream is allowed to say (0018).
 *
 * One shape for both streams and both transports. The architecture doc keeps a
 * single public SSE channel for the public web, the bracket views and the
 * TV/broadcast surfaces — "the underlying data is the same published
 * projection, only the rendering differs" — and a per-surface envelope would
 * quietly reintroduce the second channel that decision exists to avoid.
 *
 * Field names are camelCase because this is wire, mapped from the outbox's
 * snake_case columns in `packages/persistence`.
 */

export interface EventEnvelope {
  readonly eventId: string;
  readonly organizationId: string;
  readonly stream: string;
  readonly entityId: string;
  readonly eventType: string;
  /**
   * What the projection was at when this event was emitted. A client that
   * already holds a higher version for the same entity has newer state and can
   * ignore this one — which is what makes an out-of-order replay harmless.
   */
  readonly projectionVersion: number;
  readonly createdAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** The shape a persistence outbox row arrives in. */
export interface OutboxLike {
  readonly eventId: string;
  readonly organizationId: string;
  readonly stream: string;
  readonly entityId: string;
  readonly eventType: string;
  readonly projectionVersion: number;
  readonly createdAt: string;
  readonly payload: Record<string, unknown>;
}

export function toEnvelope(row: OutboxLike): EventEnvelope {
  return {
    eventId: row.eventId,
    organizationId: row.organizationId,
    stream: row.stream,
    entityId: row.entityId,
    eventType: row.eventType,
    projectionVersion: row.projectionVersion,
    createdAt: row.createdAt,
    payload: row.payload,
  };
}

/**
 * What a public spectator may see, declared per event type.
 *
 * **An allowlist, not a denylist.** A denylist is wrong the first time somebody
 * adds a field: the new field is public by default, and nobody finds out until
 * it is on a screen. Here an event type nobody listed publishes nothing, and a
 * payload field nobody listed is dropped — the failure mode is a missing
 * number on a page rather than a referee's phone number on a broadcast.
 */
export const PUBLIC_EVENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'match.finalized': ['matchId', 'result'],
  'result.superseded': ['matchId', 'reason'],
  'match.started': ['matchId', 'startedAt'],
  'match.event-recorded': ['matchId', 'definitionCode', 'side', 'occurredAt'],
  'standings.recalculated': ['stageId', 'rows'],
  'schedule.published': ['stageId', 'fixtures'],
  'stage.started': ['stageId', 'startedAt'],
  'stage.finished': ['stageId', 'finishedAt'],
};

/**
 * The public form of an envelope, or nothing when the event type is not
 * published at all.
 *
 * Sanitising here rather than at each surface is deliberate: three consumers
 * rendering the same channel would otherwise each decide what to hide, and the
 * one that forgets is a leak nobody notices until it is broadcast.
 */
export function sanitiseForPublic(envelope: EventEnvelope): EventEnvelope | undefined {
  const allowed = PUBLIC_EVENT_FIELDS[envelope.eventType];
  if (allowed === undefined) return undefined;

  const payload: Record<string, unknown> = {};
  for (const field of allowed) {
    if (field in envelope.payload) payload[field] = envelope.payload[field];
  }

  return { ...envelope, payload };
}

export function isPublicEventType(eventType: string): boolean {
  return eventType in PUBLIC_EVENT_FIELDS;
}
