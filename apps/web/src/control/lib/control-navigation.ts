import type { MouseEvent } from 'react';
import { useSyncExternalStore } from 'react';

/**
 * Client-side navigation between control-panel screens (0061).
 *
 * `window.location.pathname` modeled as external state via
 * `useSyncExternalStore` — the browser owns it, React only reads it. Plain
 * `popstate` fires for back/forward but never for `pushState` itself, so
 * `navigateControl` also dispatches a same-tab custom event this module's
 * subscribers listen for.
 */

const NAVIGATED_EVENT = 'copalibre:control-navigated';

/** Pushes a new control-panel path without reloading the page. */
export function navigateControl(path: string): void {
  if (path === window.location.pathname) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(NAVIGATED_EVENT));
}

/**
 * An `onClick` handler for an `<a href={path}>` that keeps the real `href`
 * (so middle-click, right-click, and "open in new tab" still work) but
 * intercepts a plain left click into client-side navigation instead of a
 * full page load.
 */
export function controlLinkClick(path: string): (event: MouseEvent<HTMLAnchorElement>) => void {
  return (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigateControl(path);
  };
}

/** The current path, updating on navigation (client or back/forward) and initial mount. */
export function useControlPath(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener(NAVIGATED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener(NAVIGATED_EVENT, onStoreChange);
  };
}

function getSnapshot(): string {
  return window.location.pathname;
}

/**
 * `client:only` means this never actually runs server-side, but
 * `useSyncExternalStore` requires the parameter — an empty path is a safe,
 * inert placeholder that a real client mount immediately replaces.
 */
function getServerSnapshot(): string {
  return '';
}
