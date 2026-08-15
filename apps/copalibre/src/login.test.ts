import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { readCredential } from './credentials.js';
import { login, parseLoginArguments } from './login.js';

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'copalibre-login-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function okResponse(): Response {
  return new Response(JSON.stringify([]), { status: 200 });
}

function rejectedResponse(): Response {
  return new Response(JSON.stringify({ message: 'invalid token' }), { status: 401 });
}

describe('parseLoginArguments', () => {
  it('takes --api-url over the environment', () => {
    expect(
      parseLoginArguments(['--api-url', 'https://flag.example'], {
        COPALIBRE_API_URL: 'https://env.example',
      }),
    ).toEqual({ apiUrl: 'https://flag.example' });
  });

  it('falls back to COPALIBRE_API_URL when --api-url is omitted', () => {
    expect(parseLoginArguments([], { COPALIBRE_API_URL: 'https://env.example' })).toEqual({
      apiUrl: 'https://env.example',
    });
  });

  it('requires an API URL from somewhere', () => {
    expect(() => parseLoginArguments([], {})).toThrow('--api-url is required');
  });

  it('carries --token through when given', () => {
    expect(
      parseLoginArguments(['--api-url', 'https://a.example', '--token', 'clpat_x'], {}),
    ).toEqual({ apiUrl: 'https://a.example', token: 'clpat_x' });
  });
});

describe('login', () => {
  it('stores the token from --token into cwd, without reading stdin or prompting', async () => {
    await withTemporaryDirectory(async (directory) => {
      const requestFetch = jest.fn(async () => okResponse());
      const readToken = jest.fn(async () => 'should-not-be-called');

      const credential = await login(
        directory,
        { apiUrl: 'https://copalibre.example', token: 'clpat_flag' },
        { fetch: requestFetch, readToken },
      );

      expect(credential.token).toBe('clpat_flag');
      expect(readToken).not.toHaveBeenCalled();
      expect(await readCredential(directory)).toEqual(credential);
    });
  });

  it('reads the token from the injected source (stdin/prompt) when --token is absent', async () => {
    await withTemporaryDirectory(async (directory) => {
      const requestFetch = jest.fn(async () => okResponse());
      const readToken = jest.fn(async () => 'clpat_from_stdin');

      const credential = await login(
        directory,
        { apiUrl: 'https://copalibre.example' },
        { fetch: requestFetch, readToken },
      );

      expect(readToken).toHaveBeenCalledTimes(1);
      expect(credential.token).toBe('clpat_from_stdin');
    });
  });

  it('validates against GET /organizations?mine=true with the bearer token', async () => {
    await withTemporaryDirectory(async (directory) => {
      const requestFetch = jest.fn(async () => okResponse());

      await login(
        directory,
        { apiUrl: 'https://copalibre.example', token: 'clpat_x' },
        { fetch: requestFetch },
      );

      expect(requestFetch).toHaveBeenCalledWith(
        new URL('/organizations?mine=true', 'https://copalibre.example'),
        expect.objectContaining({ headers: { authorization: 'Bearer clpat_x' } }),
      );
    });
  });

  it('refuses and stores nothing when the token is rejected', async () => {
    await withTemporaryDirectory(async (directory) => {
      const requestFetch = jest.fn(async () => rejectedResponse());

      await expect(
        login(
          directory,
          { apiUrl: 'https://copalibre.example', token: 'clpat_bad' },
          { fetch: requestFetch },
        ),
      ).rejects.toThrow('Token rejected');

      expect(await readCredential(directory)).toBeUndefined();
    });
  });

  it('replaces an already-stored token for the same directory on re-run', async () => {
    await withTemporaryDirectory(async (directory) => {
      const requestFetch = jest.fn(async () => okResponse());

      await login(
        directory,
        { apiUrl: 'https://copalibre.example', token: 'clpat_first' },
        { fetch: requestFetch },
      );
      await login(
        directory,
        { apiUrl: 'https://copalibre.example', token: 'clpat_second' },
        { fetch: requestFetch },
      );

      expect((await readCredential(directory))?.token).toBe('clpat_second');
    });
  });
});
