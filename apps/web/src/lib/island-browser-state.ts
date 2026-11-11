import { useSyncExternalStore } from 'react';

/**
 * Browser-only values for client islands. Each one reads the server's value
 * while React hydrates the server markup, then the browser's value, so the
 * first client render matches what the server sent whatever the browser
 * prefers.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function reducedMotionQuery(): MediaQueryList | undefined {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : undefined;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query?.addEventListener?.('change', onChange);
  return () => query?.removeEventListener?.('change', onChange);
}

const readReducedMotion = (): boolean => reducedMotionQuery()?.matches ?? false;
const serverReducedMotion = (): boolean => false;

/** Whether the viewer asks for reduced motion; `false` on the server and during hydration. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
}

const subscribeNothing = (): (() => void) => () => undefined;
const hydratedOnClient = (): boolean => true;
const notHydratedOnServer = (): boolean => false;

/**
 * `false` in the server markup and during hydration, `true` once the island
 * has hydrated and its handlers are attached. Islands expose it as
 * `data-hydrated`, so a kiosk diagnostic or a test knows when a click counts.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, hydratedOnClient, notHydratedOnServer);
}
