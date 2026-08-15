/**
 * Which failures are worth reconnecting after.
 *
 * A client that retries everything hammers a server that told it to stop; one
 * that retries nothing goes dark on a dropped Wi-Fi frame. The distinction is
 * therefore explicit, and it is about *why* the connection ended rather than
 * about how it felt.
 */

export type FailureKind = 'recoverable' | 'fatal';

export interface ClassifiedFailure {
  readonly kind: FailureKind;
  readonly reason: string;
  /** Whether the client should try to renew its access token before retrying. */
  readonly renewToken: boolean;
}

/**
 * Classifies a transport failure.
 *
 * `401` is recoverable **once the token is renewed** — an access token expiring
 * mid-stream is the ordinary case for a console left open through a match, not
 * an error. `403` is fatal: the credential is valid and does not grant this,
 * and retrying will not change anyone's mind.
 */
export function classifyStatus(status: number): ClassifiedFailure {
  if (status === 401) {
    return { kind: 'recoverable', reason: 'access token expired', renewToken: true };
  }
  if (status === 403) {
    return { kind: 'fatal', reason: 'not authorised for this stream', renewToken: false };
  }
  if (status === 404) {
    return { kind: 'fatal', reason: 'stream does not exist', renewToken: false };
  }
  if (status === 429) {
    // The server is asking for room, not refusing to serve. Backoff already
    // widens on every attempt, which is the whole answer here.
    return { kind: 'recoverable', reason: 'rate limited', renewToken: false };
  }
  if (status >= 500) {
    return { kind: 'recoverable', reason: `server error ${status}`, renewToken: false };
  }
  if (status >= 400) {
    return { kind: 'fatal', reason: `request rejected with ${status}`, renewToken: false };
  }
  return { kind: 'recoverable', reason: `stream ended with ${status}`, renewToken: false };
}

/**
 * Classifies a thrown error rather than a status.
 *
 * An abort is neither: the caller asked for it, and treating a deliberate
 * teardown as a failure is how a page that navigated away keeps reconnecting
 * in the background.
 */
export function classifyError(error: unknown): ClassifiedFailure | undefined {
  if (isAbort(error)) return undefined;

  return {
    kind: 'recoverable',
    reason: error instanceof Error ? error.message : String(error),
    renewToken: false,
  };
}

export function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
