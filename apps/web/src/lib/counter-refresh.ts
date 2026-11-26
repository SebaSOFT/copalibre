/**
 * Coalesces counter refreshes: a counted event asks for a projection refresh of its match, and the
 * gate runs at most one per match per interval. A request inside the interval runs once, trailing,
 * when the interval ends, so the last recording is never left uncounted.
 */
export interface CounterRefreshGate {
  request(matchId: string): void;
  dispose(): void;
}

export function createCounterRefreshGate(
  refresh: (matchId: string) => void,
  options: {
    readonly intervalMs?: number;
    readonly now?: () => number;
    readonly setTimer?: (callback: () => void, ms: number) => unknown;
    readonly clearTimer?: (handle: unknown) => void;
  } = {},
): CounterRefreshGate {
  const intervalMs = options.intervalMs ?? 1000;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((callback, ms) => window.setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => window.clearTimeout(handle as number));
  const lastRunAt = new Map<string, number>();
  const pending = new Map<string, unknown>();

  const run = (matchId: string): void => {
    pending.delete(matchId);
    lastRunAt.set(matchId, now());
    refresh(matchId);
  };

  return {
    request(matchId) {
      if (pending.has(matchId)) return;
      const elapsed = now() - (lastRunAt.get(matchId) ?? Number.NEGATIVE_INFINITY);
      if (elapsed >= intervalMs) {
        run(matchId);
        return;
      }
      pending.set(
        matchId,
        setTimer(() => run(matchId), intervalMs - elapsed),
      );
    },
    dispose() {
      for (const handle of pending.values()) clearTimer(handle);
      pending.clear();
    },
  };
}
