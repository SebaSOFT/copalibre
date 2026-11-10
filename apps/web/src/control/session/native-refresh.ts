import { API_PATH_PREFIX } from '../../lib/api-path.js';
import { csrfHeaders } from './csrf.js';
import type { SilentRenewalOutcome, SilentRenewalRetry } from './renewal-outcome.js';
import { parseSessionMetadata } from './session-store.js';

const DEFAULT_RETRY_AFTER_MS = 5_000;

function retryAt(response: Response, now: number): number {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return now + DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return now + Math.max(1_000, seconds * 1000);
  const date = Date.parse(value);
  return now + Math.max(1_000, Number.isFinite(date) ? date - now : DEFAULT_RETRY_AFTER_MS);
}

/**
 * Renews a native (email/password) session.
 *
 * CopaLibre's own API is the actual issuer of a native login's JWT (unlike
 * an OIDC session, where an external identity provider is), so it can
 * legitimately own this refresh. The request carries the `HttpOnly` refresh
 * cookie `POST /auth/login` set; the API answers with a new session cookie and
 * session metadata, and neither this function nor anything else running on
 * this page can read either cookie's value. While the old session cookie is
 * still valid the request is cookie-authenticated, so it carries the CSRF
 * header too.
 */
export async function refreshNativeSession(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<SilentRenewalOutcome | SilentRenewalRetry | undefined> {
  const response = await fetchImpl(`${API_PATH_PREFIX}/auth/refresh`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: csrfHeaders('POST'),
  });
  if (response.status === 429) return { retryAtMs: retryAt(response, Date.now()) };
  if (!response.ok) return undefined;

  const session = parseSessionMetadata(await response.json());
  return session === undefined ? undefined : { session };
}

/**
 * Best-effort: the API revokes the refresh cookie and clears the session, CSRF
 * and refresh cookies, for native and OIDC sessions alike. Failure is ignored —
 * the local session clears either way.
 */
export async function logoutSession(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  try {
    await fetchImpl(`${API_PATH_PREFIX}/auth/logout`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrfHeaders('POST'),
      // Survives the navigation that follows a sign-out.
      keepalive: true,
    });
  } catch {
    // The local session is what actually matters; a failed revocation call
    // never blocks the operator from being signed out on this device.
  }
}
