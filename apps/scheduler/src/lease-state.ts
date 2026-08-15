/**
 * When to renew, and when to admit the lease is gone.
 *
 * Pure, and separate from the store that talks to PostgreSQL, because the
 * dangerous part of a lease is not the SQL — it is the arithmetic that decides
 * whether a replica still believes it holds one.
 *
 * ## Renewing at a third of the timeout
 *
 * The design doc requires renewal "well inside the timeout window (e.g. 1/3)".
 * The reason is a dual-lease window: a replica that renews at 90% of the TTL
 * has one attempt, and a single slow query means its lease expires while it
 * still believes it holds it — two schedulers, both convinced they are the one.
 * At a third, two consecutive renewals may fail before anything is at risk.
 */

export interface LeaseTiming {
  readonly ttlSeconds: number;
  /** Fraction of the TTL at which renewal is attempted. */
  readonly renewAt: number;
}

export const DEFAULT_LEASE: LeaseTiming = { ttlSeconds: 30, renewAt: 1 / 3 };

export type LeaseState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'held'; readonly expiresAt: number; readonly fencingToken: number }
  | { readonly kind: 'lost'; readonly since: number };

export function renewIntervalMs(timing: LeaseTiming = DEFAULT_LEASE): number {
  return Math.max(1, Math.floor(timing.ttlSeconds * timing.renewAt * 1000));
}

/**
 * Whether this replica may act right now.
 *
 * Held *and* not expired. A replica that was paused past its own expiry must
 * not enqueue on the strength of a state field it set before the pause: the
 * clock is what decides, and it is checked at the moment of acting.
 */
export function mayEnqueue(state: LeaseState, now: number): boolean {
  return state.kind === 'held' && state.expiresAt > now;
}

/**
 * Whether a renewal is due — deliberately earlier than expiry.
 */
export function renewalDue(
  state: LeaseState,
  now: number,
  timing: LeaseTiming = DEFAULT_LEASE,
): boolean {
  if (state.kind !== 'held') return false;
  const remaining = state.expiresAt - now;
  return remaining <= timing.ttlSeconds * (1 - timing.renewAt) * 1000;
}

/**
 * Whether the lease was taken over while this replica was away.
 *
 * The token is the evidence. Comparing holders would not do: a replica that
 * lost the lease and reacquired it is still holding a *different* lease, and
 * work started under the old one has no claim to finish under the new.
 */
export function wasFenced(state: LeaseState, currentToken: number): boolean {
  return state.kind === 'held' && currentToken > state.fencingToken;
}
