import { jest } from '@jest/globals';
import { beginOidcLogin, type OidcLoginBrowser } from './oidc-login.js';

const issuer = 'https://identity.example';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function browser(
  responses: readonly Response[],
  search = '',
): {
  readonly runtime: OidcLoginBrowser;
  readonly fetch: jest.MockedFunction<typeof fetch>;
  readonly setSessionItem: jest.Mock;
  readonly navigate: jest.Mock;
} {
  const queue = [...responses];
  const fetchMock = jest.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error('Unexpected fetch');
    return next;
  });
  const setSessionItem = jest.fn();
  const navigate = jest.fn();
  return {
    runtime: {
      fetch: fetchMock,
      origin: 'https://copalibre.example',
      search,
      setSessionItem,
      navigate,
      createState: () => 'state-123',
    },
    fetch: fetchMock,
    setSessionItem,
    navigate,
  };
}

describe('OIDC login', () => {
  it('discovers provider and starts Authorization Code with PKCE', async () => {
    const fixture = browser([
      response({ oidcIssuer: `${issuer}/`, oidcClientId: 'copalibre-control' }),
      response({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
      }),
    ]);

    await beginOidcLogin(fixture.runtime);

    expect(fixture.fetch).toHaveBeenNthCalledWith(
      1,
      '/runtime-config.json',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    const destination = new URL(String(fixture.navigate.mock.calls[0]?.[0]));
    expect(destination.origin + destination.pathname).toBe(`${issuer}/authorize`);
    expect(destination.searchParams.get('response_type')).toBe('code');
    expect(destination.searchParams.get('client_id')).toBe('copalibre-control');
    expect(destination.searchParams.get('redirect_uri')).toBe(
      'https://copalibre.example/control/callback',
    );
    expect(destination.searchParams.get('scope')).toBe('openid profile email');
    expect(destination.searchParams.get('code_challenge_method')).toBe('S256');
    expect(destination.searchParams.get('state')).toBe('state-123');

    const transaction = JSON.parse(String(fixture.setSessionItem.mock.calls[0]?.[1])) as {
      readonly state: string;
      readonly verifier: string;
      readonly redirectUri: string;
      readonly tokenEndpoint: string;
      readonly clientId: string;
      readonly returnTo: string;
    };
    expect(fixture.setSessionItem.mock.calls[0]?.[0]).toBe('copalibre.oidc.transaction');
    expect(transaction.state).toBe('state-123');
    expect(transaction.verifier).toBeTruthy();
    expect(transaction.redirectUri).toBe('https://copalibre.example/control/callback');
    expect(transaction.tokenEndpoint).toBe(`${issuer}/token`);
    expect(transaction.clientId).toBe('copalibre-control');
    expect(transaction.returnTo).toBe('/control/');
  });

  it('carries a requested returnTo destination into the stored transaction', async () => {
    const fixture = browser(
      [
        response({ oidcIssuer: issuer, oidcClientId: 'copalibre-control' }),
        response({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
        }),
      ],
      '?returnTo=%2Fcontrol%2Fliga-mendocina%2Ftournaments%2Fapertura-2026%2Freports',
    );

    await beginOidcLogin(fixture.runtime);

    const transaction = JSON.parse(String(fixture.setSessionItem.mock.calls[0]?.[1])) as {
      readonly returnTo: string;
    };
    expect(transaction.returnTo).toBe('/control/liga-mendocina/tournaments/apertura-2026/reports');
  });

  it.each([
    [{ oidcIssuer: '', oidcClientId: 'client' }, 'OIDC issuer is not configured'],
    [{ oidcIssuer: issuer, oidcClientId: '' }, 'OIDC client ID is not configured'],
  ])('rejects incomplete runtime configuration', async (config, message) => {
    const fixture = browser([response(config)]);
    await expect(beginOidcLogin(fixture.runtime)).rejects.toThrow(message);
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it('rejects discovery from a different issuer', async () => {
    const fixture = browser([
      response({ oidcIssuer: issuer, oidcClientId: 'client' }),
      response({
        issuer: 'https://attacker.example',
        authorization_endpoint: `${issuer}/authorize`,
      }),
    ]);

    await expect(beginOidcLogin(fixture.runtime)).rejects.toThrow(
      'OIDC discovery issuer does not match configured issuer',
    );
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it('reports HTTP failures before redirecting', async () => {
    const fixture = browser([response({ error: 'unavailable' }, 503)]);
    await expect(beginOidcLogin(fixture.runtime)).rejects.toThrow(
      '/runtime-config.json returned HTTP 503',
    );
    expect(fixture.navigate).not.toHaveBeenCalled();
  });
});
