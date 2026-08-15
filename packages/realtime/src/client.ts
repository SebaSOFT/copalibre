import { DEFAULT_RECONNECT, reconnectDelay, type ReconnectPolicy } from './backoff.js';
import { classifyError, classifyStatus, isAbort, type ClassifiedFailure } from './errors.js';
import type { EventEnvelope } from './envelope.js';
import { REPLAY_EXPIRED_EVENT, SseParser } from './wire.js';

/**
 * The shared realtime client.
 *
 * Both web surfaces consume this rather than each writing their own reconnect
 * loop, because every one of the hard parts — where the cursor lives, when a
 * token is renewed, which failures are worth retrying, when a silent connection
 * is actually dead — is a place two implementations would differ, and the
 * difference would only show up during a match.
 *
 * ## Fetch streaming, never EventSource
 *
 * Native `EventSource` cannot send an `Authorization` header, and CopaLibre's
 * access token is held in memory rather than in a cookie. The remaining option
 * would be a token in the query string, which the architecture doc rejects
 * outright: URLs leak into proxy logs, browser history, metrics, traces,
 * screenshots and error reports. So the authenticated path reads a `fetch`
 * body and parses the SSE format by hand — **the token is only ever a header**,
 * and `buildUrl` below has no access to it at all, which is the enforcement.
 */

export interface RealtimeClientOptions {
  readonly url: string;
  /** Returns the current access token, or nothing for a public stream. */
  readonly accessToken?: () => string | undefined | Promise<string | undefined>;
  /** Called on a 401 so the caller can refresh before the next attempt. */
  readonly renewToken?: () => Promise<void>;
  /** Where the last seen event id is kept, so a reload resumes. */
  readonly cursor?: CursorStore;
  readonly policy?: ReconnectPolicy;
  /** Silence longer than this means the connection is dead, whatever TCP says. */
  readonly heartbeatTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface CursorStore {
  read(): string | undefined;
  write(eventId: string): void;
}

/** A cursor that survives nothing; the default when the caller supplies none. */
export function memoryCursor(initial?: string): CursorStore {
  let value = initial;
  return {
    read: () => value,
    write: (eventId: string) => void (value = eventId),
  };
}

export interface RealtimeHandlers {
  readonly onEvent: (envelope: EventEnvelope) => void;
  /** The replay window has passed; fetch the whole projection instead. */
  readonly onProjectionRequired?: (reason: string) => void;
  readonly onOpen?: () => void;
  readonly onFailure?: (failure: ClassifiedFailure) => void;
}

export interface ConnectResult {
  readonly attempts: number;
  readonly stopped: 'aborted' | 'fatal';
  readonly lastFailure?: ClassifiedFailure;
}

export class RealtimeClient {
  private readonly parser = new SseParser();
  private readonly controller = new AbortController();
  private readonly cursor: CursorStore;
  private serverRetryHintMs?: number;
  private lastFrameAt = 0;

  constructor(private readonly options: RealtimeClientOptions) {
    this.cursor = options.cursor ?? memoryCursor();
  }

  /** The last event this client is sure it processed. */
  position(): string | undefined {
    return this.cursor.read();
  }

  /**
   * Tears the connection down deliberately.
   *
   * The abort is not a failure: a page that navigated away must stop, and
   * treating its own teardown as a dropped connection is how a closed tab keeps
   * reconnecting in the background.
   */
  close(): void {
    this.controller.abort();
  }

  /**
   * Connects and keeps reconnecting until aborted or until something fatal.
   *
   * Resolves rather than throws — a stream ending is an outcome the caller has
   * to handle either way, and an exception here would land in whatever
   * `void promise` swallowed it.
   */
  async connect(handlers: RealtimeHandlers): Promise<ConnectResult> {
    const policy = this.options.policy ?? DEFAULT_RECONNECT;
    const sleep = this.options.sleep ?? defaultSleep;
    let attempts = 0;
    let lastFailure: ClassifiedFailure | undefined;

    for (;;) {
      if (this.controller.signal.aborted) {
        return { attempts, stopped: 'aborted', ...(lastFailure ? { lastFailure } : {}) };
      }

      attempts += 1;
      const failure = await this.attempt(handlers);

      if (failure === undefined) {
        // Aborted mid-read, or the server closed cleanly. An abort stops; a
        // clean close is a reconnect, because a finished stream is not a
        // finished tournament.
        if (this.controller.signal.aborted) {
          return { attempts, stopped: 'aborted', ...(lastFailure ? { lastFailure } : {}) };
        }
        lastFailure = { kind: 'recoverable', reason: 'stream closed', renewToken: false };
      } else {
        lastFailure = failure;
        handlers.onFailure?.(failure);
        if (failure.kind === 'fatal') return { attempts, stopped: 'fatal', lastFailure };
        if (failure.renewToken && this.options.renewToken) {
          await this.options.renewToken();
        }
      }

      await sleep(reconnectDelay(attempts, policy, this.serverRetryHintMs));
    }
  }

  /** One connection, from open to close. Returns the failure, if any. */
  private async attempt(handlers: RealtimeHandlers): Promise<ClassifiedFailure | undefined> {
    const doFetch = this.options.fetch ?? globalThis.fetch;
    const now = this.options.now ?? Date.now;

    try {
      const token = await this.options.accessToken?.();
      const response = await doFetch(this.options.url, {
        method: 'GET',
        headers: buildHeaders(token, this.cursor.read()),
        signal: this.controller.signal,
      });

      if (!response.ok) return classifyStatus(response.status);
      if (!response.body) {
        return { kind: 'recoverable', reason: 'response carried no body', renewToken: false };
      }

      handlers.onOpen?.();
      this.parser.reset();
      this.lastFrameAt = now();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { value, done } = await reader.read();
        if (done) return undefined;

        this.lastFrameAt = now();
        for (const frame of this.parser.push(decoder.decode(value, { stream: true }))) {
          if (frame.retry !== undefined) this.serverRetryHintMs = frame.retry;

          if (frame.event === REPLAY_EXPIRED_EVENT) {
            // The connection is fine; this client's position is not. Fetching
            // the projection is the only honest recovery — replaying from a
            // cursor the server no longer holds would silently skip events.
            handlers.onProjectionRequired?.(reasonOf(frame.data));
            continue;
          }

          const envelope = parseEnvelope(frame.data);
          if (!envelope) continue;

          handlers.onEvent(envelope);
          // Written after the handler ran: a cursor advanced first would skip
          // the event that threw on the next reconnect.
          this.cursor.write(envelope.eventId);
        }
      }
    } catch (error) {
      if (isAbort(error)) return undefined;
      return classifyError(error);
    }
  }

  /**
   * Whether the stream has gone quiet for longer than a heartbeat interval.
   *
   * A dead connection often looks exactly like an idle one: TCP holds the
   * socket open, no error arrives, and the client waits forever for a match
   * that finished twenty minutes ago. The heartbeat is what makes silence
   * distinguishable, and this is where the caller asks.
   */
  isStale(): boolean {
    const timeout = this.options.heartbeatTimeoutMs;
    if (timeout === undefined || this.lastFrameAt === 0) return false;
    return (this.options.now ?? Date.now)() - this.lastFrameAt > timeout;
  }
}

/**
 * Headers for one attempt.
 *
 * Exported so a test can assert the shape directly: the guarantee that a token
 * is a header and never a query parameter is worth checking at the place the
 * decision is made rather than only through a browser.
 */
export function buildHeaders(token?: string, cursor?: string): Record<string, string> {
  return {
    Accept: 'text/event-stream',
    ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    ...(cursor === undefined ? {} : { 'Last-Event-ID': cursor }),
  };
}

function parseEnvelope(data: string): EventEnvelope | undefined {
  if (data.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const envelope = parsed as EventEnvelope;
    return typeof envelope.eventId === 'string' ? envelope : undefined;
  } catch {
    // A frame the client cannot parse is dropped rather than fatal: one
    // malformed payload must not end a stream that is otherwise delivering.
    return undefined;
  }
}

function reasonOf(data: string): string {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'object' && parsed !== null && 'reason' in parsed) {
      const reason = (parsed as { reason?: unknown }).reason;
      if (typeof reason === 'string') return reason;
    }
  } catch {
    // Falls through to the generic reason.
  }
  return 'replay window expired';
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
