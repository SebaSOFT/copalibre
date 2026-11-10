import { randomBytes } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { SignJWT } from 'jose';
import { CsrfGuard, mintCsrfToken, sessionBinding, verifyCsrf } from './csrf.js';
import type { RequestWithSubject } from './request-context.js';

const KEY = randomBytes(32);

async function unsignedJwt(claims: Record<string, unknown>): Promise<string> {
  // The guard only decodes the token for its binding; verification already happened.
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode('test-only'));
}

function contextFor(request: RequestWithSubject): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: <T>() => request as T }),
  } as unknown as ExecutionContext;
}

describe('CSRF token', () => {
  it('binds to the jti when the token has one, and to a hash otherwise', async () => {
    expect(sessionBinding(await unsignedJwt({ jti: 'abc' }))).toBe('jti:abc');
    expect(sessionBinding(await unsignedJwt({ sub: 'x' }))).toMatch(/^sha256:/);
    expect(sessionBinding('not-a-jwt')).toMatch(/^sha256:/);
  });

  it('verifies a value minted for the same token', async () => {
    const token = await unsignedJwt({ jti: 'session-1' });
    const value = mintCsrfToken(token, KEY);
    expect(verifyCsrf(value, value, token, KEY)).toBeUndefined();
  });

  it('refuses a missing header or cookie', async () => {
    const token = await unsignedJwt({ jti: 'session-1' });
    const value = mintCsrfToken(token, KEY);
    expect(verifyCsrf(undefined, value, token, KEY)).toBe('missing');
    expect(verifyCsrf(value, undefined, token, KEY)).toBe('missing');
  });

  it('refuses a header that does not match the cookie', async () => {
    const token = await unsignedJwt({ jti: 'session-1' });
    expect(verifyCsrf(mintCsrfToken(token, KEY), mintCsrfToken(token, KEY), token, KEY)).toBe(
      'mismatch',
    );
  });

  it('refuses a matching pair minted for another session', async () => {
    const other = mintCsrfToken(await unsignedJwt({ jti: 'session-2' }), KEY);
    const token = await unsignedJwt({ jti: 'session-1' });
    expect(verifyCsrf(other, other, token, KEY)).toBe('invalid-signature');
  });

  it('refuses a planted value with no signature or a forged one', async () => {
    const token = await unsignedJwt({ jti: 'session-1' });
    expect(verifyCsrf('planted', 'planted', token, KEY)).toBe('invalid-signature');
    expect(verifyCsrf('random.forged', 'random.forged', token, KEY)).toBe('invalid-signature');
  });

  it('refuses a value signed with another installation key', async () => {
    const token = await unsignedJwt({ jti: 'session-1' });
    const foreign = mintCsrfToken(token, randomBytes(32));
    expect(verifyCsrf(foreign, foreign, token, KEY)).toBe('invalid-signature');
  });
});

describe('CsrfGuard', () => {
  async function cookieRequest(
    method: string,
    csrfHeader: string | undefined,
    csrfCookie: string | undefined,
  ): Promise<RequestWithSubject> {
    const token = await unsignedJwt({ jti: 'session-1' });
    const value = mintCsrfToken(token, KEY);
    return {
      method,
      headers: {
        ...(csrfHeader === undefined
          ? {}
          : { 'x-copalibre-csrf': csrfHeader === 'valid' ? value : csrfHeader }),
        cookie:
          csrfCookie === undefined
            ? ''
            : `copalibre_csrf=${csrfCookie === 'valid' ? value : csrfCookie}`,
      },
      authSource: 'cookie',
      accessToken: token,
    };
  }

  it('lets a cookie-authenticated POST with a matching header through', async () => {
    const guard = new CsrfGuard(KEY);
    expect(guard.canActivate(contextFor(await cookieRequest('POST', 'valid', 'valid')))).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses a cookie-authenticated %s without the header, with 403 auth-csrf',
    async (method) => {
      const guard = new CsrfGuard(KEY);
      const request = await cookieRequest(method, undefined, 'valid');
      expect(() => guard.canActivate(contextFor(request))).toThrow(
        expect.objectContaining({
          status: 403,
          response: expect.objectContaining({ errorCode: 'auth-csrf' }),
        }),
      );
    },
  );

  it.each(['GET', 'HEAD', 'OPTIONS'])('never asks a %s for a CSRF header', async (method) => {
    const guard = new CsrfGuard(KEY);
    expect(guard.canActivate(contextFor(await cookieRequest(method, undefined, undefined)))).toBe(
      true,
    );
  });

  it('leaves a Bearer-authenticated request alone', () => {
    const guard = new CsrfGuard(KEY);
    const request: RequestWithSubject = {
      method: 'POST',
      headers: {},
      authSource: 'header',
      accessToken: 'clpat_x',
    };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('leaves an unauthenticated request alone', () => {
    const guard = new CsrfGuard(KEY);
    expect(guard.canActivate(contextFor({ method: 'POST', headers: {} }))).toBe(true);
  });
});
