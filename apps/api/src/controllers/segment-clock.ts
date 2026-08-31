/**
 * A segment's elapsed time is never stored as a running countdown — only a
 * base `elapsedSeconds` plus, while the clock is active, when it started —
 * so two readers computing "right now" from the same row always agree, and
 * neither has to poll a value that changes every second on its own.
 */
export function elapsedSecondsOf(
  segment: { readonly elapsedSeconds?: number; readonly clockStartedAt?: string },
  now: number,
): number {
  const elapsed = segment.elapsedSeconds ?? 0;
  if (!segment.clockStartedAt) return elapsed;
  return elapsed + Math.max(0, Math.floor((now - Date.parse(segment.clockStartedAt)) / 1000));
}
