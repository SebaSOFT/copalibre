import { controlTokenStore, readAuthMethod, clearAuthMethod } from './token-store.js';
import { refreshNativeSession } from './native-refresh.js';
import { renewOidcSessionSilently } from './oidc-silent-renew.js';
import type { SilentRenewalOutcome } from './renewal-outcome.js';

/** The spec delta's own number: renew before expiry, not after. */
const RENEW_BEFORE_EXPIRY_MS = 120_000;
const MIN_DELAY_MS = 1_000;

export interface SilentRenewalBrowser {
  readonly navigate: (url: string) => void;
  readonly currentPath: () => string;
}

function currentBrowser(): SilentRenewalBrowser {
  return {
    navigate: window.location.assign.bind(window.location),
    currentPath: () => `${window.location.pathname}${window.location.search}`,
  };
}

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<SilentRenewalOutcome | undefined> | undefined;

export function cancelScheduledRenewal(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

function giveUp(browser: SilentRenewalBrowser): undefined {
  cancelScheduledRenewal();
  controlTokenStore.clear();
  clearAuthMethod();
  browser.navigate(
    `/control/login?returnTo=${encodeURIComponent(browser.currentPath())}&reason=session_expired`,
  );
  return undefined;
}

/**
 * At most one renewal attempt in flight at a time — the background timer and
 * a 401 fallback both call this, and share whichever attempt is already
 * running rather than racing two. On failure this clears the session and
 * sends the operator back to login; it is never retried in a loop.
 */
export function renewSessionOnce(
  browser: SilentRenewalBrowser = currentBrowser(),
): Promise<SilentRenewalOutcome | undefined> {
  if (inFlight !== undefined) return inFlight;

  const method = readAuthMethod();
  const attempt = method === 'native' ? refreshNativeSession() : renewOidcSessionSilently();

  inFlight = attempt
    .then((outcome) => {
      if (outcome === undefined) return giveUp(browser);
      controlTokenStore.write(outcome.accessToken, outcome.expiresAtMs);
      scheduleSilentRenewal(outcome.expiresAtMs, browser);
      return outcome;
    })
    .catch(() => giveUp(browser))
    .finally(() => {
      inFlight = undefined;
    });

  return inFlight;
}

/** Schedules one renewal attempt ~120s before `expiresAtMs`; a successful attempt reschedules itself from its own new expiry. */
export function scheduleSilentRenewal(
  expiresAtMs: number,
  browser: SilentRenewalBrowser = currentBrowser(),
  now: () => number = Date.now,
): void {
  cancelScheduledRenewal();
  const delay = Math.max(MIN_DELAY_MS, expiresAtMs - now() - RENEW_BEFORE_EXPIRY_MS);
  timer = setTimeout(() => {
    void renewSessionOnce(browser);
  }, delay);
}
