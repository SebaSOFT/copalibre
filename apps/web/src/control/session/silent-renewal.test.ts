import { jest } from '@jest/globals';
import {
  cancelScheduledRenewal,
  renewSessionOnce,
  scheduleSilentRenewal,
  type SilentRenewalBrowser,
} from './silent-renewal.js';
import { controlSession } from './session-store.js';

const FRESH = {
  subject: 'p-fresh',
  scopes: ['copalibre.control'],
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  method: 'native',
};

function signInNative(expiresInMs = 60_000): void {
  controlSession.write({
    subject: 'p-1',
    scopes: ['copalibre.control'],
    expiresAtMs: Date.now() + expiresInMs,
    method: 'native',
  });
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fakeBrowser(): { readonly runtime: SilentRenewalBrowser; readonly navigate: jest.Mock } {
  const navigate = jest.fn();
  return { runtime: { navigate, currentPath: () => '/control/liga-mendocina' }, navigate };
}

describe('renewSessionOnce', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    controlSession.clear();
    cancelScheduledRenewal();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    controlSession.clear();
    cancelScheduledRenewal();
  });

  it('renews a native session and records the new session metadata', async () => {
    signInNative();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async () => response(FRESH)),
    });

    const fixture = fakeBrowser();
    const outcome = await renewSessionOnce(fixture.runtime);

    expect(outcome).toMatchObject({ session: { subject: 'p-fresh' } });
    expect(controlSession.read()?.subject).toBe('p-fresh');
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it('clears the session and redirects to login with reason=session_expired on failure', async () => {
    signInNative(1000);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async () => response({}, 401)),
    });

    const fixture = fakeBrowser();
    const outcome = await renewSessionOnce(fixture.runtime);

    expect(outcome).toBeUndefined();
    expect(controlSession.read()).toBeUndefined();
    expect(fixture.navigate).toHaveBeenCalledWith(
      '/control/login?returnTo=%2Fcontrol%2Fliga-mendocina&reason=session_expired',
    );
  });

  it('keeps the session and retries after Retry-After when refresh returns 429', async () => {
    jest.useFakeTimers();
    signInNative(60_000);
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '3' } }))
      .mockResolvedValueOnce(response(FRESH));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const fixture = fakeBrowser();
    try {
      const retry = await renewSessionOnce(fixture.runtime);
      expect(retry && 'retryAtMs' in retry).toBe(true);
      expect(controlSession.read()?.subject).toBe('p-1');
      expect(fixture.navigate).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(2_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(controlSession.read()?.subject).toBe('p-fresh');
    } finally {
      cancelScheduledRenewal();
      jest.useRealTimers();
    }
  });

  it('shares one in-flight attempt across concurrent callers rather than racing two', async () => {
    signInNative();
    let resolveResponse: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = jest.fn(() => pending);
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const fixture = fakeBrowser();
    const first = renewSessionOnce(fixture.runtime);
    const second = renewSessionOnce(fixture.runtime);

    resolveResponse(response(FRESH));
    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstOutcome).toEqual(secondOutcome);
  });

  it('gives up the same way when the renewal attempt throws outright, not just when it resolves to failure', async () => {
    signInNative();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async () => {
        throw new Error('network down');
      }),
    });
    signInNative(1000);

    const fixture = fakeBrowser();
    const outcome = await renewSessionOnce(fixture.runtime);

    expect(outcome).toBeUndefined();
    expect(controlSession.read()).toBeUndefined();
    expect(fixture.navigate).toHaveBeenCalledWith(
      expect.stringContaining('reason=session_expired'),
    );
  });

  it('falls back to OIDC renewal when the session was not established natively', async () => {
    // No recorded auth method at all — the default path is OIDC, never a
    // silent assumption that an unknown session is a native one.
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      // No oidcIssuer in this runtime-config: short-circuits before ever
      // touching the iframe, which is what keeps this test fast.
      value: jest.fn(async () => response({})),
    });

    const fixture = fakeBrowser();
    const outcome = await renewSessionOnce(fixture.runtime);

    expect(outcome).toBeUndefined();
    expect(fixture.navigate).toHaveBeenCalledWith(
      expect.stringContaining('reason=session_expired'),
    );
  });
});

describe('renewSessionOnce with the real window as its browser', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    controlSession.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    controlSession.clear();
    cancelScheduledRenewal();
  });

  it('reads the real location for its give-up redirect when no browser is injected', async () => {
    signInNative();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async () => response({}, 401)),
    });

    // jsdom logs, rather than throws, on an unimplemented navigation — this
    // exercises `currentBrowser()`'s real navigate/currentPath without
    // needing anything caught here.
    await expect(renewSessionOnce()).resolves.toBeUndefined();
  });
});

describe('scheduleSilentRenewal', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    cancelScheduledRenewal();
  });

  it('falls back to the real window location when no browser is injected', () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');

    scheduleSilentRenewal(Date.now() + 10 * 60_000);

    expect(setTimeoutSpy).toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('actually attempts a renewal once the scheduled timer fires', async () => {
    jest.useFakeTimers();
    try {
      signInNative();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: jest.fn(async () => response(FRESH)),
      });
      const fixture = fakeBrowser();

      // MIN_DELAY_MS clamps an already-past expiry to a 1s minimum delay.
      scheduleSilentRenewal(Date.now() - 1, fixture.runtime);
      await jest.advanceTimersByTimeAsync(1000);

      expect(controlSession.read()?.subject).toBe('p-fresh');
    } finally {
      jest.useRealTimers();
      controlSession.clear();
    }
  });

  it('schedules 120s before the given expiry', () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const fixture = fakeBrowser();
    const now = 1_000_000;

    scheduleSilentRenewal(now + 5 * 60_000, fixture.runtime, () => now);

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60_000 - 120_000);
    setTimeoutSpy.mockRestore();
  });

  it('clamps the delay to a 1s minimum for a token already inside (or past) the renewal window', () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const fixture = fakeBrowser();
    const now = 1_000_000;

    scheduleSilentRenewal(now - 5000, fixture.runtime, () => now);

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    setTimeoutSpy.mockRestore();
  });

  it('cancelScheduledRenewal clears a pending timer', () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const fixture = fakeBrowser();

    scheduleSilentRenewal(Date.now() + 300_000, fixture.runtime);
    cancelScheduledRenewal();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
