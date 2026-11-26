/**
 * Coalesces counter refreshes for one client: a request asks for a projection refresh, and the gate runs
 * it at most once per interval. A request inside the interval runs once, trailing, when the interval ends,
 * so the last change is never left uncounted. One gate serves a whole client, because a refresh reloads
 * the whole projection, not one match.
 */
export interface CounterRefreshGate {
  request(): void;
  dispose(): void;
}

export function createCounterRefreshGate(
  refresh: () => void,
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
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let pending: { readonly handle: unknown } | undefined;

  const run = (): void => {
    pending = undefined;
    lastRunAt = now();
    refresh();
  };

  return {
    request() {
      if (pending !== undefined) return;
      const elapsed = now() - lastRunAt;
      if (elapsed >= intervalMs) {
        run();
        return;
      }
      pending = { handle: setTimer(run, intervalMs - elapsed) };
    },
    dispose() {
      if (pending !== undefined) clearTimer(pending.handle);
      pending = undefined;
    },
  };
}
