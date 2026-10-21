import type { SilentRenewalOutcome, SilentRenewalRetry } from './renewal-outcome.js';

interface NativeRefreshResponse {
  readonly accessToken?: unknown;
  readonly expiresIn?: unknown;
}

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
 * legitimately own this refresh — `credentials: 'include'` sends the
 * `HttpOnly` cookie `POST /auth/login` set; neither this function nor
 * anything else running on this page can read that cookie's value.
 */
export async function refreshNativeSession(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<SilentRenewalOutcome | SilentRenewalRetry | undefined> {
  const response = await fetchImpl('/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (response.status === 429) return { retryAtMs: retryAt(response, Date.now()) };
  if (!response.ok) return undefined;

  const body = (await response.json()) as NativeRefreshResponse;
  if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) return undefined;
  if (typeof body.expiresIn !== 'number' || !Number.isFinite(body.expiresIn)) return undefined;

  return { accessToken: body.accessToken, expiresAtMs: Date.now() + body.expiresIn * 1000 };
}

/** Best-effort: revokes the refresh cookie server-side, ignoring failure — the local session clears either way. */
export async function logoutNativeSession(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  try {
    await fetchImpl('/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // The local session is what actually matters; a failed revocation call
    // never blocks the operator from being signed out on this device.
  }
}
