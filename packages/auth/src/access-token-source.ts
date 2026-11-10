import { readCookie, sessionCookieName, type SessionCookieConfig } from './session-cookies.js';

/** Where a request's access token came from; the CSRF check applies only to `cookie`. */
export type AccessTokenSource = 'header' | 'cookie';

export interface ExtractedAccessToken {
  readonly token: string;
  readonly source: AccessTokenSource;
}

/** Prefix of a personal access token, which is accepted only as Bearer. */
export const PERSONAL_ACCESS_TOKEN_PREFIX = 'clpat_';

interface RequestHeaders {
  readonly headers: Record<string, string | string[] | undefined>;
}

/**
 * The `Authorization: Bearer` header wins; otherwise the session cookie. A
 * token in the query string is never read: URLs leak into proxy logs, browser
 * history, metrics, traces, screenshots and error reports.
 *
 * A personal access token found in the cookie is ignored, so the request is
 * unauthenticated: a PAT is an integration credential, and a browser never
 * holds one in its session cookie.
 */
export function extractAccessToken(
  request: RequestHeaders,
  config: SessionCookieConfig,
): ExtractedAccessToken | undefined {
  const bearer = extractBearerToken(request);
  if (bearer !== undefined) return { token: bearer, source: 'header' };

  const cookie = readCookie(request.headers.cookie, sessionCookieName(config));
  if (cookie === undefined || cookie.startsWith(PERSONAL_ACCESS_TOKEN_PREFIX)) return undefined;
  return { token: cookie, source: 'cookie' };
}

/** Header-only extraction: `Authorization: Bearer <token>`, exactly one token. */
export function extractBearerToken(request: RequestHeaders): string | undefined {
  const header = request.headers.authorization ?? request.headers.Authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') return undefined;

  const [scheme, token, ...rest] = value.split(' ');
  if (rest.length > 0) return undefined;
  if (scheme?.toLowerCase() !== 'bearer') return undefined;
  return token && token.length > 0 ? token : undefined;
}
