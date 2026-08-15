/**
 * Undo/redo over an immutable value.
 *
 * A seeding session is a sequence of small, reversible decisions — lock, swap,
 * randomize, randomize again — and the one thing an operator will reach for is
 * the step back. Keeping it as a value rather than as component state means the
 * canvas and the seed list share one history instead of two that disagree.
 */

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** Oldest entries are dropped past this; 0 or less means unbounded. */
  readonly limit: number;
}

export function initHistory<T>(present: T, limit = 50): History<T> {
  return { past: [], present, future: [], limit };
}

/**
 * Records a new present.
 *
 * The redo stack is cleared, which is the only honest thing to do: once a new
 * branch is taken, the old future describes a bracket that no longer exists.
 */
export function push<T>(history: History<T>, next: T): History<T> {
  const past = [...history.past, history.present];
  return {
    past: history.limit > 0 ? past.slice(-history.limit) : past,
    present: next,
    future: [],
    limit: history.limit,
  };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    limit: history.limit,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    limit: history.limit,
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
