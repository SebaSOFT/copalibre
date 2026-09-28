import { jest } from '@jest/globals';
import { logoutNativeSession, refreshNativeSession } from './native-refresh.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('refreshNativeSession', () => {
  it('sends the refresh cookie and returns the new token on success', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () =>
      response({ accessToken: 'fresh-jwt', expiresIn: 3600 }),
    );

    const outcome = await refreshNativeSession(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(outcome?.accessToken).toBe('fresh-jwt');
    expect(outcome?.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it('returns undefined when the refresh cookie is invalid or absent (401)', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => response({}, 401));
    await expect(refreshNativeSession(fetchMock)).resolves.toBeUndefined();
  });

  it('returns undefined on a malformed response body', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => response({ accessToken: 123 }));
    await expect(refreshNativeSession(fetchMock)).resolves.toBeUndefined();
  });
});

describe('logoutNativeSession', () => {
  it('posts to /auth/logout with the refresh cookie', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => response({ message: 'Logged out.' }));
    await logoutNativeSession(fetchMock);
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('never throws, even when the request itself fails', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => {
      throw new Error('network down');
    });
    await expect(logoutNativeSession(fetchMock)).resolves.toBeUndefined();
  });
});
