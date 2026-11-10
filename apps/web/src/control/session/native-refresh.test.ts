import { jest } from '@jest/globals';
import { logoutSession, refreshNativeSession } from './native-refresh.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('refreshNativeSession', () => {
  it('sends the cookies with the CSRF header and returns the new session metadata', async () => {
    document.cookie = 'copalibre_csrf=csrf-1';
    const fetchMock = jest.fn<typeof fetch>(async () =>
      response({
        subject: 'p-1',
        scopes: ['copalibre.control'],
        expiresAt: '2030-01-01T00:00:00.000Z',
        method: 'native',
      }),
    );

    const outcome = await refreshNativeSession(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CopaLibre-CSRF': 'csrf-1' },
      }),
    );
    expect(outcome).toEqual({
      session: {
        subject: 'p-1',
        scopes: ['copalibre.control'],
        expiresAtMs: Date.parse('2030-01-01T00:00:00.000Z'),
        method: 'native',
      },
    });
    document.cookie = 'copalibre_csrf=; max-age=0';
  });

  it('returns undefined when the refresh cookie is invalid or absent (401)', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => response({}, 401));
    await expect(refreshNativeSession(fetchMock)).resolves.toBeUndefined();
  });

  it('returns a retry time from Retry-After on 429', async () => {
    const before = Date.now();
    const fetchMock = jest.fn<typeof fetch>(
      async () => new Response(null, { status: 429, headers: { 'Retry-After': '3' } }),
    );

    const outcome = await refreshNativeSession(fetchMock);

    expect(outcome && 'retryAtMs' in outcome).toBe(true);
    if (outcome && 'retryAtMs' in outcome)
      expect(outcome.retryAtMs).toBeGreaterThanOrEqual(before + 2_900);
  });

  it('returns undefined on a body that is not session metadata', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () =>
      response({ accessToken: 'jwt', expiresIn: 3600 }),
    );
    await expect(refreshNativeSession(fetchMock)).resolves.toBeUndefined();
  });
});

describe('logoutSession', () => {
  it('posts to /auth/logout with the cookies, surviving the navigation that follows', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => response({ message: 'Logged out.' }));
    await logoutSession(fetchMock);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin', keepalive: true }),
    );
  });

  it('never throws, even when the request itself fails', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => {
      throw new Error('network down');
    });
    await expect(logoutSession(fetchMock)).resolves.toBeUndefined();
  });
});
