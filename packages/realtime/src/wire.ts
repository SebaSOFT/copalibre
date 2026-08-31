import type { EventEnvelope } from './envelope.js';

/**
 * The SSE wire format, written and read in one place.
 *
 * The authenticated path cannot use native `EventSource` — it has no way to
 * send an `Authorization` header, and CopaLibre's access token lives in memory
 * rather than a cookie — so the client parses the format by hand. That makes
 * the encoder and the parser two halves of one contract, and putting them in
 * separate packages is how they drift.
 */

/** A frame the server may send. */
export interface SseFrame {
  readonly id?: string;
  readonly event?: string;
  readonly data: string;
  /** Retry hint in milliseconds, honoured by the client's backoff floor. */
  readonly retry?: number;
}

export const HEARTBEAT_COMMENT = ': heartbeat\n\n';

/**
 * A comment frame, which the format defines as ignorable.
 *
 * It exists for the proxy, not the client: an idle connection is one a reverse
 * proxy eventually closes, and a stream that only speaks when something happens
 * looks identical to a broken one.
 */
export function encodeHeartbeat(): string {
  return HEARTBEAT_COMMENT;
}

export function encodeFrame(frame: SseFrame): string {
  const lines: string[] = [];
  if (frame.id !== undefined) lines.push(`id: ${frame.id}`);
  if (frame.event !== undefined) lines.push(`event: ${frame.event}`);
  if (frame.retry !== undefined) lines.push(`retry: ${frame.retry}`);
  // A multi-line payload is several `data:` lines; one line carrying a newline
  // would terminate the frame early and truncate the event.
  for (const line of frame.data.split('\n')) lines.push(`data: ${line}`);
  return `${lines.join('\n')}\n\n`;
}

/** An envelope on the wire: the id is the cursor a reconnect sends back. */
export function encodeEvent(envelope: EventEnvelope): string {
  return encodeFrame({
    id: envelope.eventId,
    event: envelope.eventType,
    data: JSON.stringify(envelope),
  });
}

/**
 * Tells a client its cursor is too old to replay from and it must fetch the
 * whole current projection.
 *
 * Sent as a named event rather than an HTTP error, because the connection is
 * fine — it is the *client's* position that is not, and closing the stream to
 * say so would start a reconnect loop that hits the same wall.
 */
export const REPLAY_EXPIRED_EVENT = 'replay.expired';

export function encodeReplayExpired(reason: string): string {
  return encodeFrame({
    event: REPLAY_EXPIRED_EVENT,
    data: JSON.stringify({ action: 'fetch-projection', reason }),
  });
}

export interface ParsedFrame {
  readonly id?: string;
  readonly event?: string;
  readonly data: string;
  readonly retry?: number;
}

/**
 * Incremental SSE parser over a byte stream.
 *
 * Incremental because a `ReadableStream` chunk boundary lands wherever the
 * network put it — routinely mid-frame, occasionally mid-line — and a parser
 * that assumed one chunk is one event would drop the tail of every large
 * payload under exactly the conditions nobody tests locally.
 */
export class SseParser {
  private buffer = '';

  /** Feeds a chunk, returning whatever complete frames it completed. */
  push(chunk: string): readonly ParsedFrame[] {
    this.buffer += chunk;
    const frames: ParsedFrame[] = [];

    // Frames end at a blank line. Normalise CRLF first: a proxy that rewrites
    // line endings must not silently stop the stream from ever parsing.
    this.buffer = this.buffer.replace(/\r\n/g, '\n');

    let boundary = this.buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const frame = parseFrame(raw);
      if (frame) frames.push(frame);
      boundary = this.buffer.indexOf('\n\n');
    }

    return frames;
  }

  /** What is held back waiting for the rest of a frame. */
  pending(): string {
    return this.buffer;
  }

  reset(): void {
    this.buffer = '';
  }
}

function parseFrame(raw: string): ParsedFrame | undefined {
  const data: string[] = [];
  let id: string | undefined;
  let event: string | undefined;
  let retry: number | undefined;
  let sawField = false;

  for (const line of raw.split('\n')) {
    // A comment. Heartbeats arrive as these, and dropping them silently is the
    // correct behaviour rather than an error.
    if (line.startsWith(':')) continue;
    if (line.length === 0) continue;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');

    switch (field) {
      case 'id':
        id = value;
        sawField = true;
        break;
      case 'event':
        event = value;
        sawField = true;
        break;
      case 'data':
        data.push(value);
        sawField = true;
        break;
      case 'retry': {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) retry = parsed;
        sawField = true;
        break;
      }
      default:
        // An unknown field is ignored by the format, which is what lets the
        // protocol grow without breaking a client that has not been updated.
        break;
    }
  }

  if (!sawField) return undefined;

  return {
    ...(id === undefined ? {} : { id }),
    ...(event === undefined ? {} : { event }),
    ...(retry === undefined ? {} : { retry }),
    data: data.join('\n'),
  };
}
