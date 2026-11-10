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

const SESSION_BODY = {
  subject: 'idp-subject',
  scopes: ['copalibre.control'],
  expiresAt: '2030-01-01T00:00:00.000Z',
  method: 'oidc',
};

function browser(input: {
  readonly search: string;
  readonly storedTransaction?: OidcTransaction | null;
  readonly tokenResponse?: Response;
  readonly handoverResponse?: Response;
}): {
  readonly runtime: OidcCallbackBrowser;
  readonly fetch: jest.MockedFunction<typeof fetch>;
  readonly removeSessionItem: jest.Mock;
} {
  const fetchMock = jest.fn<typeof fetch>(async (url) => {
    if (String(url) === '/api/auth/session') {
      return input.handoverResponse ?? response(SESSION_BODY);
    }
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
  it('exchanges a valid code, hands the token to the API and returns only session metadata', async () => {
    const fixture = browser({
      search: '?code=auth-code-1&state=state-123',
      tokenResponse: response({ access_token: 'token-xyz', expires_in: 3600 }),
    });

    const result = await completeOidcLogin(fixture.runtime);

    expect(result.session).toMatchObject({ subject: 'idp-subject', method: 'oidc' });
    expect(JSON.stringify(result)).not.toContain('token-xyz');
    expect(result.returnTo).toBe('/control/liga-mendocina/');

    const [handoverUrl, handoverInit] = fixture.fetch.mock.calls[1] as [string, RequestInit];
    expect(handoverUrl).toBe('/api/auth/session');
    expect(handoverInit).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(new Headers(handoverInit.headers).get('authorization')).toBe('Bearer token-xyz');
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

  it('reports a refused handover, so the operator sees that sign-in failed', async () => {
    const fixture = browser({
      search: '?code=auth-code-1&state=state-123',
      tokenResponse: response({ access_token: 'token-xyz', expires_in: 3600 }),
      handoverResponse: response({ message: 'Invalid bearer token' }, 401),
    });
    await expect(completeOidcLogin(fixture.runtime)).rejects.toThrow(
      'The API refused the identity provider token',
    );
  });
});
