import {
  CSRF_COOKIE_NAME,
  MAX_COOKIE_BYTES,
  PLAIN_SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  SECURE_SESSION_COOKIE_NAME,
  clearingCookies,
  expectedSecureFor,
  maxAgeUntil,
  parseCookieHeader,
  readCookie,
  serializeCsrfCookie,
  serializeRefreshCookie,
  serializeSessionCookie,
  sessionCookieConfigFromEnv,
  sessionCookieMismatch,
  sessionCookieName,
  sessionCookieTooLarge,
} from './session-cookies.js';
import { extractAccessToken, extractBearerToken } from './access-token-source.js';

const SECURE = { secure: true } as const;
const PLAIN = { secure: false } as const;

function attributes(cookie: string): string[] {
  return cookie.split('; ').slice(1);
}

describe('session cookie configuration', () => {
  it('defaults to Secure when the setting is absent or empty', () => {
    expect(sessionCookieConfigFromEnv({})).toEqual({ secure: true });
    expect(sessionCookieConfigFromEnv({ COPALIBRE_SESSION_COOKIE_SECURE: '' })).toEqual({
      secure: true,
    });
  });

  it('reads true and false, case-insensitively', () => {
    expect(sessionCookieConfigFromEnv({ COPALIBRE_SESSION_COOKIE_SECURE: 'TRUE' })).toEqual({
      secure: true,
    });
    expect(sessionCookieConfigFromEnv({ COPALIBRE_SESSION_COOKIE_SECURE: ' false ' })).toEqual({
      secure: false,
    });
  });

  it('fails closed on any other value', () => {
    expect(() => sessionCookieConfigFromEnv({ COPALIBRE_SESSION_COOKIE_SECURE: 'yes' })).toThrow(
      /must be "true" or "false"/,
    );
  });

  it('names the cookie with the __Host- prefix only over HTTPS', () => {
    expect(sessionCookieName(SECURE)).toBe(SECURE_SESSION_COOKIE_NAME);
    expect(sessionCookieName(PLAIN)).toBe(PLAIN_SESSION_COOKIE_NAME);
  });
});

describe('session cookie mismatch', () => {
  it('agrees with https and with localhost over http when Secure is on', () => {
    expect(sessionCookieMismatch(SECURE, 'https://copa.example.test')).toBeUndefined();
    expect(sessionCookieMismatch(SECURE, 'http://localhost:8080')).toBeUndefined();
    expect(sessionCookieMismatch(SECURE, 'http://127.0.0.1')).toBeUndefined();
    expect(sessionCookieMismatch(SECURE, 'http://app.localhost')).toBeUndefined();
  });

  it('reports Secure off on an https URL', () => {
    expect(sessionCookieMismatch(PLAIN, 'https://copa.example.test')).toMatch(
      /COPALIBRE_SESSION_COOKIE_SECURE=false disagrees with COPALIBRE_APP_URL=https/,
    );
  });

  it('reports Secure on for a plain-HTTP LAN host', () => {
    expect(sessionCookieMismatch(SECURE, 'http://192.168.1.10')).toMatch(/expected false/);
  });

  it('has nothing to say without a usable URL', () => {
    expect(sessionCookieMismatch(PLAIN, undefined)).toBeUndefined();
    expect(sessionCookieMismatch(PLAIN, 'not a url')).toBeUndefined();
  });

  it('treats IPv6 loopback as a secure context', () => {
    expect(expectedSecureFor(new URL('http://[::1]:8080'))).toBe(true);
  });
});

describe('cookie serialization', () => {
  it('issues the HTTPS session cookie with __Host-, Secure, HttpOnly, Strict, Path=/ and no Domain', () => {
    const cookie = serializeSessionCookie(SECURE, 'a.b.c', 900);
    expect(cookie.startsWith(`${SECURE_SESSION_COOKIE_NAME}=a.b.c; `)).toBe(true);
    expect(attributes(cookie).sort()).toEqual(
      ['HttpOnly', 'Max-Age=900', 'Path=/', 'SameSite=Strict', 'Secure'].sort(),
    );
    expect(cookie).not.toMatch(/Domain/i);
  });

  it('drops only Secure and the prefix over plain HTTP', () => {
    const cookie = serializeSessionCookie(PLAIN, 'a.b.c', 900);
    expect(cookie.startsWith(`${PLAIN_SESSION_COOKIE_NAME}=a.b.c; `)).toBe(true);
    expect(attributes(cookie).sort()).toEqual(
      ['HttpOnly', 'Max-Age=900', 'Path=/', 'SameSite=Strict'].sort(),
    );
  });

  it('leaves the CSRF cookie readable by script', () => {
    const cookie = serializeCsrfCookie(SECURE, 'r.s', 60);
    expect(cookie.startsWith(`${CSRF_COOKIE_NAME}=r.s; `)).toBe(true);
    expect(attributes(cookie)).not.toContain('HttpOnly');
    expect(attributes(cookie)).toContain('Secure');
    expect(attributes(cookie)).toContain('Path=/');
  });

  it('scopes the refresh cookie to the auth endpoints', () => {
    const cookie = serializeRefreshCookie(PLAIN, 'raw', 30);
    expect(cookie.startsWith(`${REFRESH_COOKIE_NAME}=raw; `)).toBe(true);
    expect(attributes(cookie)).toContain('Path=/api/auth');
    expect(attributes(cookie)).toContain('HttpOnly');
    expect(attributes(cookie)).not.toContain('Secure');
  });

  it('clears all three cookies with Max-Age=0 and the issuing attributes', () => {
    const cleared = clearingCookies(SECURE);
    expect(cleared).toHaveLength(3);
    expect(cleared.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
    expect(cleared.map((cookie) => cookie.split('=')[0])).toEqual([
      SECURE_SESSION_COOKIE_NAME,
      CSRF_COOKIE_NAME,
      REFRESH_COOKIE_NAME,
    ]);
  });

  it('never writes a negative Max-Age', () => {
    expect(serializeSessionCookie(SECURE, 'x', -5)).toContain('Max-Age=0');
  });

  it('derives Max-Age from exp', () => {
    expect(maxAgeUntil(1_000 + 600, 1_000 * 1000)).toBe(600);
    expect(maxAgeUntil(1_000, 2_000 * 1000)).toBe(0);
  });

  it('flags a token that would exceed the browser cookie limit', () => {
    expect(sessionCookieTooLarge(SECURE, 'x'.repeat(100))).toBe(false);
    expect(sessionCookieTooLarge(SECURE, 'x'.repeat(MAX_COOKIE_BYTES))).toBe(true);
  });
});

describe('cookie parsing', () => {
  it('reads named values and keeps = inside a value', () => {
    const cookies = parseCookieHeader('a=1; b=x=y;c=3');
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('b')).toBe('x=y');
    expect(cookies.get('c')).toBe('3');
  });

  it('ignores malformed pairs', () => {
    const cookies = parseCookieHeader('novalue; =orphan; ok=1');
    expect([...cookies.keys()]).toEqual(['ok']);
  });

  it('drops a name that appears more than once, however many times', () => {
    const cookies = parseCookieHeader('s=planted; s=real; s=third; other=1');
    expect(cookies.has('s')).toBe(false);
    expect(cookies.get('other')).toBe('1');
  });

  it('accepts an array header and an absent one', () => {
    expect(readCookie(['a=1', 'b=2'], 'b')).toBe('2');
    expect(readCookie(undefined, 'a')).toBeUndefined();
  });

  it('treats an empty value as absent', () => {
    expect(readCookie('a=', 'a')).toBeUndefined();
  });
});

describe('access token extraction', () => {
  const cookieName = SECURE_SESSION_COOKIE_NAME;

  it('prefers the Authorization header over the cookie', () => {
    expect(
      extractAccessToken(
        { headers: { authorization: 'Bearer header-token', cookie: `${cookieName}=cookie-token` } },
        SECURE,
      ),
    ).toEqual({ token: 'header-token', source: 'header' });
  });

  it('falls back to the session cookie', () => {
    expect(
      extractAccessToken({ headers: { cookie: `${cookieName}=cookie-token` } }, SECURE),
    ).toEqual({ token: 'cookie-token', source: 'cookie' });
  });

  it('reads only the cookie name the configuration calls for', () => {
    expect(
      extractAccessToken({ headers: { cookie: `${PLAIN_SESSION_COOKIE_NAME}=t` } }, SECURE),
    ).toBeUndefined();
  });

  it('refuses a personal access token from the cookie', () => {
    expect(
      extractAccessToken({ headers: { cookie: `${cookieName}=clpat_abc` } }, SECURE),
    ).toBeUndefined();
  });

  it('accepts a personal access token from the header', () => {
    expect(extractAccessToken({ headers: { authorization: 'Bearer clpat_abc' } }, SECURE)).toEqual({
      token: 'clpat_abc',
      source: 'header',
    });
  });

  it('rejects malformed Authorization headers', () => {
    expect(extractBearerToken({ headers: { authorization: 'Basic abc' } })).toBeUndefined();
    expect(extractBearerToken({ headers: { authorization: 'Bearer a b' } })).toBeUndefined();
    expect(extractBearerToken({ headers: { authorization: 'Bearer ' } })).toBeUndefined();
    expect(extractBearerToken({ headers: { Authorization: ['Bearer x'] } })).toBe('x');
    expect(extractBearerToken({ headers: {} })).toBeUndefined();
  });
});
