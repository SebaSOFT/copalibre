import { authorizationUrl, createPkcePair } from './pkce.js';

const RUNTIME_CONFIG_PATH = '/runtime-config.json';
const TRANSACTION_KEY = 'copalibre.oidc.transaction';

interface RuntimeConfig {
  readonly oidcIssuer: string;
  readonly oidcClientId: string;
}

interface OidcDiscovery {
  readonly issuer: string;
  readonly authorization_endpoint: string;
}

export interface OidcLoginBrowser {
  readonly fetch: typeof fetch;
  readonly origin: string;
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
  browser.setSessionItem(
    TRANSACTION_KEY,
    JSON.stringify({ state, verifier: pair.verifier, redirectUri }),
  );
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
