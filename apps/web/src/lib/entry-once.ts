import { MOTION } from '@copalibre/design-tokens';

export const ENTRY_DURATION_MS = Number(MOTION.base.replace(/ms$/, ''));

interface EntryTimers {
  readonly restart: number;
  readonly clear?: number;
}

const timers = new WeakMap<HTMLElement, EntryTimers>();

/** Marks one inserted row for a single entry cycle without reading layout. */
export function enterElementOnce(element: HTMLElement): void {
  const previous = timers.get(element);
  if (previous) {
    window.clearTimeout(previous.restart);
    if (previous.clear !== undefined) window.clearTimeout(previous.clear);
  }

  element.classList.remove('cl-enter-once');
  const restart = window.setTimeout(() => {
    element.classList.add('cl-enter-once');
    const clear = window.setTimeout(() => {
      element.classList.remove('cl-enter-once');
      timers.delete(element);
    }, ENTRY_DURATION_MS);
    timers.set(element, { restart, clear });
  }, 0);
  timers.set(element, { restart });
}
