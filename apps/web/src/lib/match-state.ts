/**
 * Derived presentation timing rules for matches on public and broadcast surfaces.
 *
 * Delayed is a view-level state derived from `scheduledAt`/`startsAt` and current time;
 * it is never persisted in the domain or returned by the API.
 */

export const DELAYED_AFTER_MINUTES = 15;

export interface DelayCheckMatch {
  readonly state: string;
  readonly scheduledAt?: string | null;
  readonly startsAt?: string | null;
}

/**
 * True only when a match is still `upcoming` more than 15 minutes past its scheduled kickoff.
 * Returns false for live, final, disputed, missing/invalid kickoff, or <= 15 minutes past kickoff.
 */
export function isDelayed(match: DelayCheckMatch, now: Date | number = Date.now()): boolean {
  if (match.state !== 'upcoming') return false;
  const rawKickoff = match.scheduledAt ?? match.startsAt;
  if (typeof rawKickoff !== 'string' || rawKickoff.trim().length === 0) return false;
  const kickoffMs = Date.parse(rawKickoff);
  if (!Number.isFinite(kickoffMs)) return false;
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs)) return false;
  return kickoffMs + DELAYED_AFTER_MINUTES * 60_000 < nowMs;
}
