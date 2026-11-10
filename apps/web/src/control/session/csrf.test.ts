import { csrfHeaders, readCsrfCookie } from './csrf.js';

describe('the CSRF header', () => {
  it('reads the CSRF cookie among others', () => {
    expect(readCsrfCookie('a=1; copalibre_csrf=abc.def; b=2')).toBe('abc.def');
    expect(readCsrfCookie('a=1')).toBeUndefined();
    expect(readCsrfCookie('copalibre_csrf=')).toBeUndefined();
    expect(readCsrfCookie('malformed; =x')).toBeUndefined();
    expect(readCsrfCookie(undefined)).toBeUndefined();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('is sent on %s', (method) => {
    expect(csrfHeaders(method, 'copalibre_csrf=v')).toEqual({ 'X-CopaLibre-CSRF': 'v' });
  });

  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('is never sent on %s', (method) => {
    expect(csrfHeaders(method, 'copalibre_csrf=v')).toEqual({});
  });

  it('is omitted when there is no CSRF cookie', () => {
    expect(csrfHeaders('POST', 'other=1')).toEqual({});
  });

  it('reads document.cookie by default', () => {
    document.cookie = 'copalibre_csrf=from-document';
    expect(csrfHeaders('POST')).toEqual({ 'X-CopaLibre-CSRF': 'from-document' });
    document.cookie = 'copalibre_csrf=; max-age=0';
  });
});
