import { jest } from '@jest/globals';
import { readRuntimeConfig, resolveSessionMode } from './runtime-config.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('readRuntimeConfig', () => {
  it('fetches and parses /runtime-config.json', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () =>
      response({ oidcIssuer: 'https://identity.example', sessionMode: 'pragmatic-persistent' }),
    );

    const config = await readRuntimeConfig(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      '/runtime-config.json',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(config.sessionMode).toBe('pragmatic-persistent');
  });

  it('throws on a non-2xx response', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => response({}, 503));
    await expect(readRuntimeConfig(fetchMock)).rejects.toThrow(
      '/runtime-config.json returned HTTP 503',
    );
  });
});

describe('resolveSessionMode', () => {
  it('is pragmatic-persistent only when explicitly configured', () => {
    expect(resolveSessionMode({ sessionMode: 'pragmatic-persistent' })).toBe(
      'pragmatic-persistent',
    );
  });

  it('defaults to strict-stateless for anything else, including nothing at all', () => {
    expect(resolveSessionMode({})).toBe('strict-stateless');
    expect(resolveSessionMode({ sessionMode: 'garbage' })).toBe('strict-stateless');
    expect(resolveSessionMode({ sessionMode: 'strict-stateless' })).toBe('strict-stateless');
  });
});
