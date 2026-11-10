/**
 * The double-submit CSRF value.
 *
 * The API sets `copalibre_csrf` beside the `HttpOnly` session cookie,
 * readable by script on purpose: Control echoes it in `X-CopaLibre-CSRF` on
 * every unsafe request, which a cross-site page cannot do because it cannot
 * read this origin's cookies. The value is signed and bound to the session,
 * so it is not a credential on its own.
 */

export const CSRF_COOKIE_NAME = 'copalibre_csrf';
export const CSRF_HEADER_NAME = 'X-CopaLibre-CSRF';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readCsrfCookie(
  cookieSource: string | undefined = currentCookies(),
): string | undefined {
  if (!cookieSource) return undefined;
  for (const part of cookieSource.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== CSRF_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

/** The CSRF header for an unsafe method, or nothing for a safe one or when no CSRF cookie exists. */
export function csrfHeaders(
  method: string,
  cookieSource: string | undefined = currentCookies(),
): Record<string, string> {
  if (SAFE_METHODS.has(method.toUpperCase())) return {};
  const value = readCsrfCookie(cookieSource);
  return value === undefined ? {} : { [CSRF_HEADER_NAME]: value };
}

function currentCookies(): string | undefined {
  return typeof document === 'undefined' ? undefined : document.cookie;
}
