import { jest } from '@jest/globals';
import { completeOidcLogin, type OidcCallbackBrowser } from './oidc-callback.js';
import { TRANSACTION_KEY, type OidcTransaction } from './oidc-login.js';

function transaction(overrides: Partial<OidcTransaction> = {}): OidcTransaction {
  return {
    state: 'state-123',
    verifier: 'verifier-abc',
    redirectUri: 'https://copalibre.example/control/callback',
    tokenEndpoint: 'https://identity.example/token',
    clientId: 'copalibre-control',
    returnTo: '/control/liga-mendocina/',
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function browser(input: {
  readonly search: string;
  readonly storedTransaction?: OidcTransaction | null;
  readonly tokenResponse?: Response;
}): {
  readonly runtime: OidcCallbackBrowser;
  readonly fetch: jest.MockedFunction<typeof fetch>;
  readonly removeSessionItem: jest.Mock;
} {
  const fetchMock = jest.fn<typeof fetch>(async () => {
    if (!input.tokenResponse) throw new Error('Unexpected fetch');
    return input.tokenResponse;
  });
  const removeSessionItem = jest.fn();
  const stored =
    input.storedTransaction === null
      ? null
      : JSON.stringify(input.storedTransaction ?? transaction());
  return {
    runtime: {
      fetch: fetchMock,
      search: input.search,
      getSessionItem: () => stored,
      removeSessionItem,
    },
    fetch: fetchMock,
    removeSessionItem,
  };
}

describe('OIDC callback', () => {
  it('exchanges a valid code for a token and returns the stored return destination', async () => {
    const fixture = browser({
      search: '?code=auth-code-1&state=state-123',
      tokenResponse: response({ access_token: 'token-xyz', expires_in: 3600 }),
    });

    const before = Date.now();
    const result = await completeOidcLogin(fixture.runtime);

    expect(result.accessToken).toBe('token-xyz');
    expect(result.expiresAtMs).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(result.returnTo).toBe('/control/liga-mendocina/');
    expect(fixture.removeSessionItem).toHaveBeenCalledWith(TRANSACTION_KEY);

    const [url, init] = fixture.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://identity.example/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code-1');
    expect(body.get('redirect_uri')).toBe('https://copalibre.example/control/callback');
    expect(body.get('client_id')).toBe('copalibre-control');
    expect(body.get('code_verifier')).toBe('verifier-abc');
  });

  it('refuses a mismatched state without exchanging the code', async () => {
    const fixture = browser({ search: '?code=auth-code-1&state=wrong-state' });
    await expect(completeOidcLogin(fixture.runtime)).rejects.toThrow(
      'Callback state does not match the login attempt that started it',
    );
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it('refuses a callback with no transaction stored', async () => {
    const fixture = browser({
      search: '?code=auth-code-1&state=state-123',
      storedTransaction: null,
    });
    await expect(completeOidcLogin(fixture.runtime)).rejects.toThrow(
      'No login attempt in progress for this callback',
    );
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it('surfaces an identity-provider error rather than attempting an exchange', async () => {
    const fixture = browser({ search: '?error=access_denied' });
    await expect(completeOidcLogin(fixture.runtime)).rejects.toThrow(
      'Identity provider reported an error: access_denied',
    );
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it('refuses a callback with no code and no error', async () => {
    const fixture = browser({ search: '?state=state-123' });
    await expect(completeOidcLogin(fixture.runtime)).rejects.toThrow(
      'Callback has no authorization code',
    );
  });

  it('reports a failed exchange', async () => {
    const fixture = browser({
      search: '?code=auth-code-1&state=state-123',
      tokenResponse: response({ error: 'invalid_grant' }, 400),
    });
    await expect(completeOidcLogin(fixture.runtime)).rejects.toThrow(
      'Token exchange returned HTTP 400',
    );
  });

  it('rejects a token response with no usable access token', async () => {
    const fixture = browser({
      search: '?code=auth-code-1&state=state-123',
      tokenResponse: response({ expires_in: 3600 }),
    });
    await expect(completeOidcLogin(fixture.runtime)).rejects.toThrow(
      'Token response has no usable access token',
    );
  });

  it('rejects a token response with no usable expiry', async () => {
    const fixture = browser({
      search: '?code=auth-code-1&state=state-123',
      tokenResponse: response({ access_token: 'token-xyz' }),
    });
    await expect(completeOidcLogin(fixture.runtime)).rejects.toThrow(
      'Token response has no usable expiry',
    );
  });
});
