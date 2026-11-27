import { jest } from '@jest/globals';
import {
  FORBIDDEN_STORAGE_KEYS,
  LEGACY_SESSION_STORAGE_KEYS,
  controlSession,
  createSessionStore,
  parseSessionMetadata,
  removeLegacySessionStorage,
  restoreControlSession,
  sessionHasScope,
  type SessionMetadata,
} from './session-store.js';

const SESSION: SessionMetadata = {
  subject: 'principal-1',
  scopes: ['copalibre.control', 'copalibre.super-admin'],
  expiresAtMs: 5_000,
  method: 'native',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('the session store holds metadata, never a token', () => {
  afterEach(() => controlSession.clear());

  it('keeps the metadata in memory and forgets it on clear', () => {
    const store = createSessionStore(() => 1_000);
    store.write(SESSION);
    expect(store.read()).toEqual(SESSION);
    store.clear();
    expect(store.read()).toBeUndefined();
    expect(store.method()).toBeUndefined();
  });

  it('treats an expired session as absent but still knows how it was established', () => {
    let now = 1_000;
    const store = createSessionStore(() => now);
    store.write(SESSION);
    now = 6_000;
    expect(store.read()).toBeUndefined();
    // A renewal after expiry still has to pick the right mechanism.
    expect(store.method()).toBe('native');
  });

  it('writes nothing to any browser storage or script-readable cookie', () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    controlSession.write({ ...SESSION, expiresAtMs: Date.now() + 60_000 });

    for (const key of FORBIDDEN_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('removes the token an older build left in sessionStorage', () => {
    window.sessionStorage.setItem('copalibre:session:v1', JSON.stringify({ token: 'old-jwt' }));
    window.sessionStorage.setItem('copalibre:session:authMethod:v1', 'native');
    window.sessionStorage.setItem('unrelated', 'kept');

    removeLegacySessionStorage(window.sessionStorage);

    for (const key of LEGACY_SESSION_STORAGE_KEYS) {
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
    expect(window.sessionStorage.getItem('unrelated')).toBe('kept');
    window.sessionStorage.clear();
  });

  it('tolerates a storage that throws, or none at all', () => {
    const throwing = {
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(() => removeLegacySessionStorage(throwing)).not.toThrow();
    expect(() => removeLegacySessionStorage(undefined)).not.toThrow();
  });

  it('reads scopes from the metadata for presentation guards', () => {
    expect(sessionHasScope(SESSION, 'copalibre.super-admin')).toBe(true);
    expect(
      sessionHasScope({ ...SESSION, scopes: ['copalibre.control'] }, 'copalibre.super-admin'),
    ).toBe(false);
    expect(sessionHasScope(undefined, 'copalibre.control')).toBe(false);
  });
});

describe('parsing the API session body', () => {
  it('accepts the documented shape', () => {
    expect(
      parseSessionMetadata({
        subject: 'p-1',
        scopes: ['copalibre.control', 7],
        expiresAt: '2030-01-01T00:00:00.000Z',
        method: 'oidc',
      }),
    ).toEqual({
      subject: 'p-1',
      scopes: ['copalibre.control'],
      expiresAtMs: Date.parse('2030-01-01T00:00:00.000Z'),
      method: 'oidc',
    });
  });

  it.each([
    ['a non-object', 'nope'],
    ['null', null],
    ['no subject', { scopes: [], expiresAt: '2030-01-01T00:00:00Z', method: 'native' }],
    [
      'scopes not a list',
      { subject: 'p', scopes: 'x', expiresAt: '2030-01-01T00:00:00Z', method: 'native' },
    ],
    ['an unparseable expiry', { subject: 'p', scopes: [], expiresAt: 'later', method: 'native' }],
    [
      'an unknown method',
      { subject: 'p', scopes: [], expiresAt: '2030-01-01T00:00:00Z', method: 'x' },
    ],
    ['a token-only body', { accessToken: 'jwt', expiresIn: 3600 }],
  ])('refuses %s', (_label, body) => {
    expect(parseSessionMetadata(body)).toBeUndefined();
  });
});

describe('restoring the session after a reload', () => {
  afterEach(() => controlSession.clear());

  it('asks GET /api/auth/session once and records the answer', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        subject: 'p-1',
        scopes: ['copalibre.control'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        method: 'native',
      }),
    ) as unknown as typeof fetch;

    const [first, second] = await Promise.all([
      restoreControlSession(fetchImpl),
      restoreControlSession(fetchImpl),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/session', { credentials: 'same-origin' });
    expect(first?.subject).toBe('p-1');
    expect(second).toEqual(first);
    expect(controlSession.read()?.subject).toBe('p-1');
  });

  it('answers from memory without a request when a session is already known', async () => {
    controlSession.write({ ...SESSION, expiresAtMs: Date.now() + 60_000 });
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    expect(await restoreControlSession(fetchImpl)).toMatchObject({ subject: 'principal-1' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats a 401 as signed out', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ message: 'No session' }, 401));
    expect(await restoreControlSession(fetchImpl as unknown as typeof fetch)).toBeUndefined();
    expect(controlSession.read()).toBeUndefined();
  });

  it('treats a network failure as signed out', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await restoreControlSession(fetchImpl as unknown as typeof fetch)).toBeUndefined();
  });
});
