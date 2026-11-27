/**
 * The browser session's cookies, shared by every process role that reads or
 * writes them.
 *
 * A Control browser session never holds its access token in script. The API
 * puts the access JWT in an `HttpOnly` session cookie, pairs it with a
 * script-readable CSRF cookie for the double-submit check, and keeps the
 * native refresh token in its own `HttpOnly` cookie scoped to `/api/auth`.
 * The events service reads the session cookie with this same parser, so the
 * two services can never disagree about what a cookie header says.
 *
 * Hand-rolled rather than a cookie plugin: three cookies with fixed
 * attributes are a few lines, not a dependency's worth of surface.
 */

/** Session cookie name when the installation serves HTTPS. */
export const SECURE_SESSION_COOKIE_NAME = '__Host-copalibre_session';
/** Session cookie name on a plain-HTTP installation, where `__Host-` cannot be used. */
export const PLAIN_SESSION_COOKIE_NAME = 'copalibre_session';
/** The double-submit CSRF cookie; deliberately readable by script. */
export const CSRF_COOKIE_NAME = 'copalibre_csrf';
/** The native session's refresh token. */
export const REFRESH_COOKIE_NAME = 'copalibre_refresh_token';
/** Header Control echoes the CSRF cookie in, on unsafe methods. Lowercase, as Node presents it. */
export const CSRF_HEADER_NAME = 'x-copalibre-csrf';
/** Browsers drop a cookie whose name and value exceed this many bytes. */
export const MAX_COOKIE_BYTES = 4096;
/** Environment key that turns `Secure` and the `__Host-` prefix on or off. */
export const SESSION_COOKIE_SECURE_ENV = 'COPALIBRE_SESSION_COOKIE_SECURE';

const REFRESH_COOKIE_PATH = '/api/auth';

export interface SessionCookieConfig {
  /** `true` when the installation is reached over HTTPS (or on `localhost`). */
  readonly secure: boolean;
}

/**
 * Reads `COPALIBRE_SESSION_COOKIE_SECURE`. Absent means `true`: browsers treat
 * `http://localhost` as a secure context, so only a plain-HTTP installation on
 * another host has to opt out. Any value but `true`/`false` fails closed.
 */
export function sessionCookieConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SessionCookieConfig {
  const raw = env[SESSION_COOKIE_SECURE_ENV]?.trim().toLowerCase();
  if (raw === undefined || raw === '' || raw === 'true') return { secure: true };
  if (raw === 'false') return { secure: false };
  throw new Error(`${SESSION_COOKIE_SECURE_ENV} must be "true" or "false", got "${raw}"`);
}

/**
 * Describes a disagreement between the cookie setting and the public URL, or
 * `undefined` when they agree. An `https` URL with `Secure` off silently
 * weakens every cookie; an `http` non-localhost URL with it on makes browsers
 * refuse them, so nobody can sign in.
 */
export function sessionCookieMismatch(
  config: SessionCookieConfig,
  appUrl: string | undefined,
): string | undefined {
  if (!appUrl) return undefined;
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    return undefined;
  }
  const expected = expectedSecureFor(url);
  if (expected === config.secure) return undefined;
  return `${SESSION_COOKIE_SECURE_ENV}=${String(config.secure)} disagrees with COPALIBRE_APP_URL=${appUrl}; expected ${String(expected)}`;
}

/** The `Secure` value a URL calls for: `https` and `localhost` are secure contexts. */
export function expectedSecureFor(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  return isLoopbackHost(url.hostname);
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

export function sessionCookieName(config: SessionCookieConfig): string {
  return config.secure ? SECURE_SESSION_COOKIE_NAME : PLAIN_SESSION_COOKIE_NAME;
}

/**
 * Parses a `Cookie` header. A name that appears more than once is dropped
 * entirely: with two candidates there is no way to tell the one the API set
 * from one planted beside it, and guessing would let the plant win.
 * Malformed pairs (no `=`, empty name) are ignored.
 */
export function parseCookieHeader(
  header: string | string[] | undefined,
): ReadonlyMap<string, string> {
  const raw = Array.isArray(header) ? header.join('; ') : header;
  const values = new Map<string, string>();
  const duplicates = new Set<string>();
  if (!raw) return values;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (name.length === 0) continue;
    if (values.has(name) || duplicates.has(name)) {
      values.delete(name);
      duplicates.add(name);
      continue;
    }
    values.set(name, part.slice(separator + 1).trim());
  }
  return values;
}

export function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  const value = parseCookieHeader(header).get(name);
  return value === undefined || value.length === 0 ? undefined : value;
}

interface CookieAttributes {
  readonly path: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly maxAgeSeconds: number;
}

function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
  const parts = [
    `${name}=${value}`,
    `Path=${attributes.path}`,
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(attributes.maxAgeSeconds))}`,
  ];
  if (attributes.httpOnly) parts.push('HttpOnly');
  if (attributes.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Seconds from `nowMs` until the JWT `exp` (seconds since epoch), never negative. */
export function maxAgeUntil(expSeconds: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor(expSeconds - nowMs / 1000));
}

/** Whether a session cookie for this token would exceed the browser limit. */
export function sessionCookieTooLarge(config: SessionCookieConfig, token: string): boolean {
  return Buffer.byteLength(`${sessionCookieName(config)}=${token}`, 'utf8') > MAX_COOKIE_BYTES;
}

export function serializeSessionCookie(
  config: SessionCookieConfig,
  token: string,
  maxAgeSeconds: number,
): string {
  return serializeCookie(sessionCookieName(config), token, {
    path: '/',
    httpOnly: true,
    secure: config.secure,
    maxAgeSeconds,
  });
}

export function serializeCsrfCookie(
  config: SessionCookieConfig,
  value: string,
  maxAgeSeconds: number,
): string {
  return serializeCookie(CSRF_COOKIE_NAME, value, {
    path: '/',
    httpOnly: false,
    secure: config.secure,
    maxAgeSeconds,
  });
}

export function serializeRefreshCookie(
  config: SessionCookieConfig,
  value: string,
  maxAgeSeconds: number,
): string {
  return serializeCookie(REFRESH_COOKIE_NAME, value, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: config.secure,
    maxAgeSeconds,
  });
}

/** `Set-Cookie` values that clear the session, CSRF and refresh cookies. */
export function clearingCookies(config: SessionCookieConfig): readonly string[] {
  return [
    serializeSessionCookie(config, '', 0),
    serializeCsrfCookie(config, '', 0),
    serializeRefreshCookie(config, '', 0),
  ];
}

/** The cookie names the application sets, for documentation checks. */
export const APPLICATION_COOKIE_NAMES = [
  SECURE_SESSION_COOKIE_NAME,
  PLAIN_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
] as const;
