import type { SilentRenewalOutcome } from './renewal-outcome.js';

interface NativeRefreshResponse {
  readonly accessToken?: unknown;
  readonly expiresIn?: unknown;
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
): Promise<SilentRenewalOutcome | undefined> {
  const response = await fetchImpl('/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
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
