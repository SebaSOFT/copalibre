import { MOTION } from '@copalibre/design-tokens';

export const FLASH_DURATION_MS = Number(MOTION.flash.replace(/ms$/, ''));

interface FlashTimers {
  readonly restart: number;
  readonly clear?: number;
}

const timers = new WeakMap<HTMLElement, FlashTimers>();

/** Restarts the score flash without forcing a synchronous layout read. */
export function flashValue(element: HTMLElement): void {
  const previous = timers.get(element);
  if (previous) {
    window.clearTimeout(previous.restart);
    if (previous.clear !== undefined) window.clearTimeout(previous.clear);
  }

  element.classList.remove('cl-flash-on-change');
  const restart = window.setTimeout(() => {
    element.classList.add('cl-flash-on-change');
    const clear = window.setTimeout(() => {
      element.classList.remove('cl-flash-on-change');
      timers.delete(element);
    }, FLASH_DURATION_MS);
    timers.set(element, { restart, clear });
  }, 0);
  timers.set(element, { restart });
}
