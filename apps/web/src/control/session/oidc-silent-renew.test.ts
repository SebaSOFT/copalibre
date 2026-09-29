import { jest } from '@jest/globals';
import {
  SILENT_TRANSACTION_KEY,
  exchangeSilentCode,
  postSilentRenewResult,
  renewOidcSessionSilently,
  type OidcSilentRenewBrowser,
  type SilentTransaction,
} from './oidc-silent-renew.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const transaction: SilentTransaction = {
  state: 'state-abc',
  verifier: 'verifier-abc',
  redirectUri: 'https://copalibre.example/control/silent-renew-callback',
  tokenEndpoint: 'https://identity.example/token',
  clientId: 'copalibre-control',
};

describe('exchangeSilentCode', () => {
  it('exchanges a code for a fresh token', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () =>
      response({ access_token: 'fresh-jwt', expires_in: 900 }),
    );

    const outcome = await exchangeSilentCode(transaction, 'auth-code', fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      transaction.tokenEndpoint,
      expect.objectContaining({ method: 'POST' }),
    );
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBe(transaction.verifier);
    expect(outcome?.accessToken).toBe('fresh-jwt');
  });

  it('returns undefined on a failed exchange', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => response({}, 400));
    await expect(exchangeSilentCode(transaction, 'auth-code', fetchMock)).resolves.toBeUndefined();
  });

  it('returns undefined on a malformed token response', async () => {
    const fetchMock = jest.fn<typeof fetch>(async () => response({ access_token: 'jwt' }));
    await expect(exchangeSilentCode(transaction, 'auth-code', fetchMock)).resolves.toBeUndefined();
  });
});

function browser(
  responses: readonly Response[],
  iframeResult:
    { source: 'copalibre-silent-renew'; code?: string; state?: string; error?: string } | undefined,
): { readonly runtime: OidcSilentRenewBrowser; readonly fetch: jest.MockedFunction<typeof fetch> } {
  const queue = [...responses];
  const fetchMock = jest.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error('Unexpected fetch');
    return next;
  });
  return {
    runtime: {
      fetch: fetchMock,
      origin: 'https://copalibre.example',
      setSessionItem: jest.fn(),
      removeSessionItem: jest.fn(),
      createState: () => 'state-abc',
      runInHiddenIframe: jest.fn(async () => iframeResult),
    },
    fetch: fetchMock,
  };
}

describe('renewOidcSessionSilently', () => {
  it('completes a full silent renewal when the identity provider still has a session', async () => {
    const fixture = browser(
      [
        response({ oidcIssuer: 'https://identity.example', oidcClientId: 'copalibre-control' }),
        response({
          issuer: 'https://identity.example',
          authorization_endpoint: 'https://identity.example/authorize',
          token_endpoint: 'https://identity.example/token',
        }),
        response({ access_token: 'fresh-jwt', expires_in: 900 }),
      ],
      { source: 'copalibre-silent-renew', code: 'auth-code', state: 'state-abc' },
    );

    const outcome = await renewOidcSessionSilently(fixture.runtime);

    expect(outcome?.accessToken).toBe('fresh-jwt');
    const iframeUrl = String((fixture.runtime.runInHiddenIframe as jest.Mock).mock.calls[0]?.[0]);
    expect(iframeUrl).toContain('prompt=none');
    expect(iframeUrl).toContain(
      'redirect_uri=https%3A%2F%2Fcopalibre.example%2Fcontrol%2Fsilent-renew-callback',
    );
  });

  it('returns undefined when the provider reports no active session', async () => {
    const fixture = browser(
      [
        response({ oidcIssuer: 'https://identity.example', oidcClientId: 'copalibre-control' }),
        response({
          issuer: 'https://identity.example',
          authorization_endpoint: 'https://identity.example/authorize',
          token_endpoint: 'https://identity.example/token',
        }),
      ],
      { source: 'copalibre-silent-renew', error: 'login_required' },
    );

    await expect(renewOidcSessionSilently(fixture.runtime)).resolves.toBeUndefined();
  });

  it('returns undefined on a timeout (no message received)', async () => {
    const fixture = browser(
      [
        response({ oidcIssuer: 'https://identity.example', oidcClientId: 'copalibre-control' }),
        response({
          issuer: 'https://identity.example',
          authorization_endpoint: 'https://identity.example/authorize',
          token_endpoint: 'https://identity.example/token',
        }),
      ],
      undefined,
    );

    await expect(renewOidcSessionSilently(fixture.runtime)).resolves.toBeUndefined();
  });

  it('returns undefined when runtime config has no OIDC issuer configured', async () => {
    const fixture = browser([response({})], undefined);
    await expect(renewOidcSessionSilently(fixture.runtime)).resolves.toBeUndefined();
    expect(fixture.runtime.runInHiddenIframe).not.toHaveBeenCalled();
  });

  it('rejects a mismatched state as though nothing came back', async () => {
    const fixture = browser(
      [
        response({ oidcIssuer: 'https://identity.example', oidcClientId: 'copalibre-control' }),
        response({
          issuer: 'https://identity.example',
          authorization_endpoint: 'https://identity.example/authorize',
          token_endpoint: 'https://identity.example/token',
        }),
      ],
      { source: 'copalibre-silent-renew', code: 'auth-code', state: 'not-the-real-state' },
    );

    await expect(renewOidcSessionSilently(fixture.runtime)).resolves.toBeUndefined();
  });
});

async function waitForIframe(): Promise<HTMLIFrameElement> {
  for (let i = 0; i < 50; i++) {
    const iframe = document.querySelector('iframe');
    if (iframe) return iframe;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('iframe never appeared');
}

describe('renewOidcSessionSilently with the real hidden-iframe browser', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    document.querySelectorAll('iframe').forEach((iframe) => iframe.remove());
  });

  it('creates a hidden iframe, waits for its postMessage, and completes the exchange', async () => {
    const responses = [
      response({ oidcIssuer: 'https://identity.example', oidcClientId: 'copalibre-control' }),
      response({
        issuer: 'https://identity.example',
        authorization_endpoint: 'https://identity.example/authorize',
        token_endpoint: 'https://identity.example/token',
      }),
      response({ access_token: 'fresh-jwt', expires_in: 900 }),
    ];
    const fetchMock = jest.fn<typeof fetch>(async () => {
      const next = responses.shift();
      if (!next) throw new Error('Unexpected fetch');
      return next;
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const promise = renewOidcSessionSilently();
    const iframe = await waitForIframe();
    expect(iframe.style.display).toBe('none');

    const transaction = JSON.parse(
      sessionStorage.getItem(SILENT_TRANSACTION_KEY) ?? '{}',
    ) as SilentTransaction;
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { source: 'copalibre-silent-renew', code: 'auth-code', state: transaction.state },
      }),
    );

    const outcome = await promise;
    expect(outcome?.accessToken).toBe('fresh-jwt');
    expect(document.querySelector('iframe')).toBeNull();
    expect(sessionStorage.getItem(SILENT_TRANSACTION_KEY)).toBeNull();
  });

  it('gives up once its own timeout elapses with no message at all', async () => {
    const responses = [
      response({ oidcIssuer: 'https://identity.example', oidcClientId: 'copalibre-control' }),
      response({
        issuer: 'https://identity.example',
        authorization_endpoint: 'https://identity.example/authorize',
        token_endpoint: 'https://identity.example/token',
      }),
    ];
    const fetchMock = jest.fn<typeof fetch>(async () => {
      const next = responses.shift();
      if (!next) throw new Error('Unexpected fetch');
      return next;
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const outcome = await renewOidcSessionSilently(undefined, 10);
    expect(outcome).toBeUndefined();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('ignores a message from a different origin, waiting for the real one', async () => {
    const responses = [
      response({ oidcIssuer: 'https://identity.example', oidcClientId: 'copalibre-control' }),
      response({
        issuer: 'https://identity.example',
        authorization_endpoint: 'https://identity.example/authorize',
        token_endpoint: 'https://identity.example/token',
      }),
      response({ access_token: 'fresh-jwt', expires_in: 900 }),
    ];
    const fetchMock = jest.fn<typeof fetch>(async () => {
      const next = responses.shift();
      if (!next) throw new Error('Unexpected fetch');
      return next;
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    const promise = renewOidcSessionSilently();
    const iframe = await waitForIframe();

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://attacker.example',
        data: { source: 'copalibre-silent-renew', code: 'attacker-code', state: 'irrelevant' },
      }),
    );
    // A non-matching-origin message must not resolve the promise — the
    // iframe is still there, still waiting for the real one.
    expect(document.body.contains(iframe)).toBe(true);

    const transaction = JSON.parse(
      sessionStorage.getItem(SILENT_TRANSACTION_KEY) ?? '{}',
    ) as SilentTransaction;
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { source: 'copalibre-silent-renew', code: 'auth-code', state: transaction.state },
      }),
    );

    const outcome = await promise;
    expect(outcome?.accessToken).toBe('fresh-jwt');
  });
});

describe('postSilentRenewResult', () => {
  it('posts the code and state to the parent window', () => {
    const targetWindow = { postMessage: jest.fn() } as unknown as Window;
    postSilentRenewResult(
      '?code=auth-code&state=state-abc',
      targetWindow,
      'https://copalibre.example',
    );

    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      { source: 'copalibre-silent-renew', code: 'auth-code', state: 'state-abc' },
      'https://copalibre.example',
    );
  });

  it('posts the provider error when the callback carries one', () => {
    const targetWindow = { postMessage: jest.fn() } as unknown as Window;
    postSilentRenewResult('?error=login_required', targetWindow, 'https://copalibre.example');

    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      { source: 'copalibre-silent-renew', error: 'login_required' },
      'https://copalibre.example',
    );
  });

  it('posts a missing_code error when the callback has neither', () => {
    const targetWindow = { postMessage: jest.fn() } as unknown as Window;
    postSilentRenewResult('', targetWindow, 'https://copalibre.example');

    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      { source: 'copalibre-silent-renew', error: 'missing_code' },
      'https://copalibre.example',
    );
  });
});
