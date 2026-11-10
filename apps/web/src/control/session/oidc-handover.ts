import { API_PATH_PREFIX } from '../../lib/api-path.js';
import { parseSessionMetadata, type SessionMetadata } from './session-store.js';

/**
 * Hands an identity provider's access token to the API, which verifies it and
 * keeps it in the `HttpOnly` session cookie. The token passes through script
 * once per login and per silent renewal, here, and nowhere else: the caller
 * drops its reference as soon as this settles, whatever the answer.
 *
 * Resolves the session metadata, or `undefined` when the API refused the
 * token (bad signature, wrong issuer or audience, expired, too large).
 */
export async function handOverOidcToken(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<SessionMetadata | undefined> {
  const response = await fetchImpl(`${API_PATH_PREFIX}/auth/session`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return undefined;
  return parseSessionMetadata(await response.json());
}
