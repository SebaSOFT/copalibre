/**
 * @copalibre/realtime — the SSE wire contract, its envelope, and the client
 * both web surfaces share (0018-realtime-sse-contract). No Nest, no Fastify:
 * the server encodes with it and the browser parses with it, which is the
 * point.
 */

export {
  toEnvelope,
  sanitiseForPublic,
  isPublicEventType,
  PUBLIC_EVENT_FIELDS,
  type EventEnvelope,
  type OutboxLike,
} from './envelope.js';
export {
  encodeEvent,
  encodeFrame,
  encodeHeartbeat,
  encodeReplayExpired,
  SseParser,
  HEARTBEAT_COMMENT,
  REPLAY_EXPIRED_EVENT,
  type SseFrame,
  type ParsedFrame,
} from './wire.js';
export {
  classifyStatus,
  classifyError,
  isAbort,
  type ClassifiedFailure,
  type FailureKind,
} from './errors.js';
export { reconnectDelay, DEFAULT_RECONNECT, type ReconnectPolicy } from './backoff.js';
export {
  RealtimeClient,
  memoryCursor,
  buildHeaders,
  type RealtimeClientOptions,
  type RealtimeHandlers,
  type ConnectResult,
  type CursorStore,
} from './client.js';
