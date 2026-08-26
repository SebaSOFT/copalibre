import { authorizationUrl, createPkcePair } from './pkce.js';

const RUNTIME_CONFIG_PATH = '/runtime-config.json';
export const TRANSACTION_KEY = 'copalibre.oidc.transaction';
/**
 * Where an operator lands after login when no `returnTo` was requested.
 *
 * Exported so `ControlApp.tsx`'s `CompletingLogin` can tell this case
 * apart from a guard-redirected login (which always carries a real
 * destination) without widening the established transaction shape.
 */
export const DEFAULT_RETURN_TO = '/control/';

interface RuntimeConfig {
  readonly oidcIssuer: string;
  readonly oidcClientId: string;
}

interface OidcDiscovery {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
}

/** What `/control/callback` needs to complete the exchange. */
export interface OidcTransaction {
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  /** Where to send the operator once the exchange succeeds. */
  readonly returnTo: string;
}

export interface OidcLoginBrowser {
  readonly fetch: typeof fetch;
  readonly origin: string;
  readonly search: string;
  readonly setSessionItem: (key: string, value: string) => void;
  readonly navigate: (url: string) => void;
  readonly createState: () => string;
}

export async function beginOidcLogin(browser = currentBrowser()): Promise<void> {
  const config = await readJson<RuntimeConfig>(RUNTIME_CONFIG_PATH, browser.fetch);
  requireText(config.oidcIssuer, 'OIDC issuer');
  requireText(config.oidcClientId, 'OIDC client ID');
  const issuer = new URL(config.oidcIssuer).toString().replace(/\/$/, '');
  const discovery = await readJson<OidcDiscovery>(
    `${issuer}/.well-known/openid-configuration`,
    browser.fetch,
  );
  if (discovery.issuer.replace(/\/$/, '') !== issuer) {
    throw new Error('OIDC discovery issuer does not match configured issuer');
  }

  const pair = await createPkcePair();
  const state = browser.createState();
  const redirectUri = new URL('/control/callback', browser.origin).toString();
  const returnTo = new URLSearchParams(browser.search).get('returnTo') || DEFAULT_RETURN_TO;
  const transaction: OidcTransaction = {
    state,
    verifier: pair.verifier,
    redirectUri,
    tokenEndpoint: discovery.token_endpoint,
    clientId: config.oidcClientId,
    returnTo,
  };
  browser.setSessionItem(TRANSACTION_KEY, JSON.stringify(transaction));
  browser.navigate(
    authorizationUrl({
      authorizeEndpoint: discovery.authorization_endpoint,
      clientId: config.oidcClientId,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      challenge: pair.challenge,
      state,
    }),
  );
}

function currentBrowser(): OidcLoginBrowser {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    origin: window.location.origin,
    search: window.location.search,
    setSessionItem: sessionStorage.setItem.bind(sessionStorage),
    navigate: window.location.assign.bind(window.location),
    createState: crypto.randomUUID.bind(crypto),
  };
}

async function readJson<T>(url: string, request: typeof fetch): Promise<T> {
  const response = await request(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

function requireText(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${label} is not configured`);
}
