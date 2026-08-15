/**
 * How long a client waits before reconnecting.
 *
 * Separate from the client for the same reason the worker's retry curve is
 * separate from its loop: this is the part somebody will want to argue about
 * with a test rather than with a stadium full of tablets.
 *
 * The jitter is real randomness here, unlike the worker's. A worker's schedule
 * must be reproducible on replay; a thousand clients reconnecting after the
 * same outage must *not* be reproducible, or they arrive together and knock the
 * server over a second time.
 */

export interface ReconnectPolicy {
  readonly initialMs: number;
  readonly factor: number;
  readonly maxMs: number;
  /** Share of the delay that varies, 0–1. */
  readonly jitter: number;
}

export const DEFAULT_RECONNECT: ReconnectPolicy = {
  initialMs: 1000,
  factor: 2,
  // Thirty seconds: a spectator who put their phone down should not wait
  // minutes for the score after the network came back.
  maxMs: 30_000,
  jitter: 0.3,
};

/**
 * Delay before attempt `attempt` (1-based), optionally floored by the server's
 * own `retry:` hint — the server knows about the outage the client cannot see.
 */
export function reconnectDelay(
  attempt: number,
  policy: ReconnectPolicy = DEFAULT_RECONNECT,
  serverHintMs?: number,
  random: () => number = Math.random,
): number {
  if (attempt < 1) return 0;

  const raw = policy.initialMs * policy.factor ** (attempt - 1);
  const capped = Math.min(raw, policy.maxMs);
  const floored = serverHintMs === undefined ? capped : Math.max(capped, serverHintMs);
  if (policy.jitter <= 0) return Math.round(floored);

  const spread = floored * policy.jitter;
  return Math.round(floored - spread / 2 + spread * random());
}
