/**
 * The retry policy (0017-worker-scheduler-async-jobs).
 *
 * Pure arithmetic, kept away from the loop that uses it, because "how long
 * until the next attempt" is the one part of a relay somebody will want to
 * argue about with a test rather than with a running queue.
 *
 * ## Why bounded, and why jittered
 *
 * Unbounded exponential backoff eventually schedules a retry past the point
 * anyone is still watching — the job is not dead-lettered, so nothing alerts,
 * and it is not retrying either. `maxDelaySeconds` caps that.
 *
 * The jitter matters more than it looks: a database hiccup fails a hundred jobs
 * at the same instant, and without jitter all hundred retry at the same instant
 * too, reproducing the load that caused the failure. The jitter is deterministic
 * in the event id rather than random, so a replay computes the same schedule.
 */

export interface BackoffPolicy {
  readonly baseSeconds: number;
  readonly factor: number;
  readonly maxDelaySeconds: number;
  readonly maxAttempts: number;
  /** Share of the delay that varies with the job, 0–1. */
  readonly jitter: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseSeconds: 5,
  factor: 3,
  // Twenty minutes: long enough for a dependency to come back, short enough
  // that a recovered queue drains inside an operator's attention span.
  maxDelaySeconds: 1200,
  maxAttempts: 6,
  jitter: 0.2,
};

/**
 * Seconds until attempt `attempt + 1`, given that `attempt` just failed.
 *
 * Attempt numbering is 1-based, matching the row's own counter: the first
 * failure is attempt 1 and waits `baseSeconds`.
 */
export function delayForAttempt(
  attempt: number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
  key = '',
): number {
  if (attempt < 1) return 0;

  const raw = policy.baseSeconds * policy.factor ** (attempt - 1);
  const capped = Math.min(raw, policy.maxDelaySeconds);
  if (policy.jitter <= 0) return capped;

  // Deterministic in the key: a replay of the same failure computes the same
  // schedule, so two workers cannot disagree about when a row is due.
  const spread = capped * policy.jitter;
  return round(capped - spread / 2 + spread * fraction(key, attempt));
}

/** Whether this failure was the last one the policy allows. */
export function isExhausted(attempt: number, policy: BackoffPolicy = DEFAULT_BACKOFF): boolean {
  return attempt >= policy.maxAttempts;
}

/** The whole curve, for an operator asking how long a job will keep trying. */
export function backoffCurve(policy: BackoffPolicy = DEFAULT_BACKOFF, key = ''): readonly number[] {
  return Array.from({ length: policy.maxAttempts }, (_value, index) =>
    delayForAttempt(index + 1, policy, key),
  );
}

function fraction(key: string, attempt: number): number {
  let hash = 2166136261 ^ attempt;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
