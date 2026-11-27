import { ConflictException } from '../http/error-contract.js';

/** The stored side of a key: what the repository holds for one claimed or completed command. */
export interface KeyedCommand<T> {
  readonly matchId: string;
  readonly operation: string;
  readonly requestFingerprint: string;
  readonly response: T;
  readonly responsePending: boolean;
}

/**
 * How a request whose key is already on record is answered:
 * - `conflict`: the key belongs to a different request; refuse without applying.
 * - `replay`: the command completed; return its recorded response.
 * - `respond`: the command committed but its response was never stored; read the current
 *   response and store it, without running the command again.
 */
export type KeyAnswer<T> =
  | { readonly outcome: 'conflict' }
  | { readonly outcome: 'replay'; readonly response: T }
  | { readonly outcome: 'respond' };

/** Pure: decides the answer for a key on record. Performs no reads or writes. */
export function answerFromKey<T>(
  stored: KeyedCommand<T>,
  matchId: string,
  operation: string,
  fingerprint: string,
): KeyAnswer<T> {
  if (
    stored.operation !== operation ||
    stored.matchId !== matchId ||
    stored.requestFingerprint !== fingerprint
  ) {
    return { outcome: 'conflict' };
  }
  if (stored.responsePending) return { outcome: 'respond' };
  return { outcome: 'replay', response: stored.response };
}

/** The refusal for a reused key, shared by every route that answers from a key. */
export function keyReusedConflict(operation: string): ConflictException {
  return new ConflictException(`Idempotency-Key was already used for a different ${operation}`, {
    errorCode: 'match-control-conflict',
  });
}
