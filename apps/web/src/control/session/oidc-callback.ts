import { verifyCallbackState } from './pkce.js';
import { TRANSACTION_KEY, type OidcTransaction } from './oidc-login.js';
import { handOverOidcToken } from './oidc-handover.js';
import type { SessionMetadata } from './session-store.js';

export interface OidcCallbackBrowser {
  readonly fetch: typeof fetch;
  readonly search: string;
  readonly getSessionItem: (key: string) => string | null;
  readonly removeSessionItem: (key: string) => void;
}

export interface OidcCallbackResult {
  readonly session: SessionMetadata;
  readonly returnTo: string;
}

interface TokenResponse {
  readonly access_token?: unknown;
}

/**
 * Completes the Authorization Code + PKCE exchange `beginOidcLogin` started.
 *
 * A direct browser-to-identity-provider exchange, never routed through the
 * API: PKCE's verifier is the public-client substitute for a secret
 * specifically so the browser that started the flow can finish it itself.
 * The resulting token is handed straight to the API, which keeps it in the
 * `HttpOnly` session cookie; this function keeps no reference to it.
 */
export async function completeOidcLogin(browser = currentBrowser()): Promise<OidcCallbackResult> {
  const params = new URLSearchParams(browser.search);
  const providerError = params.get('error');
  if (providerError !== null) {
    throw new Error(`Identity provider reported an error: ${providerError}`);
  }
  const code = params.get('code');
  if (code === null || code.length === 0) {
    throw new Error('Callback has no authorization code');
  }
  const receivedState = params.get('state');

  const raw = browser.getSessionItem(TRANSACTION_KEY);
  browser.removeSessionItem(TRANSACTION_KEY);
  if (raw === null) {
    throw new Error('No login attempt in progress for this callback');
  }
  const transaction = JSON.parse(raw) as OidcTransaction;
  if (!verifyCallbackState(transaction.state, receivedState)) {
    throw new Error('Callback state does not match the login attempt that started it');
  }

  const response = await browser.fetch(transaction.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: transaction.redirectUri,
      client_id: transaction.clientId,
      code_verifier: transaction.verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as TokenResponse;
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new Error('Token response has no usable access token');
  }

  const session = await handOverOidcToken(body.access_token, browser.fetch);
  if (session === undefined) {
    throw new Error('The API refused the identity provider token');
  }
  return { session, returnTo: transaction.returnTo };
}

function currentBrowser(): OidcCallbackBrowser {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    search: window.location.search,
    getSessionItem: sessionStorage.getItem.bind(sessionStorage),
    removeSessionItem: sessionStorage.removeItem.bind(sessionStorage),
  };
}
