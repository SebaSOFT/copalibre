import { authorizationUrl, createPkcePair, verifyCallbackState } from './pkce.js';
import { readRuntimeConfig } from './runtime-config.js';
import type { SilentRenewalOutcome } from './renewal-outcome.js';

export const SILENT_TRANSACTION_KEY = 'copalibre.oidc.silentTransaction';
const SILENT_RENEW_TIMEOUT_MS = 10_000;
const SILENT_CALLBACK_PATH = '/control/silent-renew-callback';

interface SilentOidcDiscovery {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
}

/** What `/control/silent-renew-callback` needs to complete the exchange — the same shape `OidcTransaction` carries, minus `returnTo`, which a hidden iframe never navigates anywhere. */
export interface SilentTransaction {
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
  readonly tokenEndpoint: string;
  readonly clientId: string;
}

interface TokenResponse {
  readonly access_token?: unknown;
  readonly expires_in?: unknown;
}

/** Posted by `/control/silent-renew-callback` back to the window that opened it. */
export interface SilentRenewMessage {
  readonly source: 'copalibre-silent-renew';
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
}

function isSilentRenewMessage(data: unknown): data is SilentRenewMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { readonly source?: unknown }).source === 'copalibre-silent-renew'
  );
}

/**
 * Exchanges a silently-obtained code for tokens — the same PKCE exchange
 * `completeOidcLogin` performs against the same transaction shape, just
 * never reached by navigating anywhere.
 */
export async function exchangeSilentCode(
  transaction: SilentTransaction,
  code: string,
  fetchImpl: typeof fetch,
): Promise<SilentRenewalOutcome | undefined> {
  const response = await fetchImpl(transaction.tokenEndpoint, {
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
  if (!response.ok) return undefined;

  const body = (await response.json()) as TokenResponse;
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) return undefined;
  if (typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in)) return undefined;

  return { accessToken: body.access_token, expiresAtMs: Date.now() + body.expires_in * 1000 };
}

export interface OidcSilentRenewBrowser {
  readonly fetch: typeof fetch;
  readonly origin: string;
  readonly setSessionItem: (key: string, value: string) => void;
  readonly removeSessionItem: (key: string) => void;
  readonly createState: () => string;
  readonly runInHiddenIframe: (
    url: string,
    timeoutMs: number,
  ) => Promise<SilentRenewMessage | undefined>;
}

function runInHiddenIframe(
  url: string,
  timeoutMs: number,
): Promise<SilentRenewMessage | undefined> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    let settled = false;
    const finish = (result: SilentRenewMessage | undefined): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      iframe.remove();
      resolve(result);
    };

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) return;
      if (!isSilentRenewMessage(event.data)) return;
      finish(event.data);
    };

    const timer = setTimeout(() => finish(undefined), timeoutMs);
    window.addEventListener('message', onMessage);
    iframe.src = url;
    document.body.appendChild(iframe);
  });
}

function currentBrowser(): OidcSilentRenewBrowser {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    origin: window.location.origin,
    setSessionItem: sessionStorage.setItem.bind(sessionStorage),
    removeSessionItem: sessionStorage.removeItem.bind(sessionStorage),
    createState: crypto.randomUUID.bind(crypto),
    runInHiddenIframe,
  };
}

/**
 * Renews an OIDC session with no user interaction: a hidden iframe asks the
 * identity provider for a fresh authorization code with `prompt=none`. If the
 * provider still has an active session it responds immediately; if not, it
 * responds with an error just as fast (`login_required`/`interaction_required`)
 * — either way the operator sees nothing until this resolves.
 */
export async function renewOidcSessionSilently(
  browser: OidcSilentRenewBrowser = currentBrowser(),
  timeoutMs = SILENT_RENEW_TIMEOUT_MS,
): Promise<SilentRenewalOutcome | undefined> {
  const config = await readRuntimeConfig(browser.fetch);
  if (!config.oidcIssuer || !config.oidcClientId) return undefined;

  const issuer = new URL(config.oidcIssuer).toString().replace(/\/$/, '');
  const discoveryResponse = await browser.fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: 'application/json' },
  });
  if (!discoveryResponse.ok) return undefined;
  const discovery = (await discoveryResponse.json()) as SilentOidcDiscovery;

  const pair = await createPkcePair();
  const state = browser.createState();
  const redirectUri = new URL(SILENT_CALLBACK_PATH, browser.origin).toString();
  const transaction: SilentTransaction = {
    state,
    verifier: pair.verifier,
    redirectUri,
    tokenEndpoint: discovery.token_endpoint,
    clientId: config.oidcClientId,
  };
  browser.setSessionItem(SILENT_TRANSACTION_KEY, JSON.stringify(transaction));

  const url = new URL(
    authorizationUrl({
      authorizeEndpoint: discovery.authorization_endpoint,
      clientId: config.oidcClientId,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      challenge: pair.challenge,
      state,
    }),
  );
  url.searchParams.set('prompt', 'none');

  const message = await browser.runInHiddenIframe(url.toString(), timeoutMs);
  browser.removeSessionItem(SILENT_TRANSACTION_KEY);

  if (message === undefined || message.error !== undefined) return undefined;
  if (
    message.code === undefined ||
    !verifyCallbackState(transaction.state, message.state ?? null)
  ) {
    return undefined;
  }

  return exchangeSilentCode(transaction, message.code, browser.fetch);
}

/**
 * Called by the `/control/silent-renew-callback` screen itself: posts this
 * iframe's own query-string result back to whoever opened it. Never posts to
 * `'*'` — a same-origin renewal iframe has no business telling anyone else
 * what it saw.
 */
export function postSilentRenewResult(
  search: string = window.location.search,
  targetWindow: Window = window.parent,
  targetOrigin: string = window.location.origin,
): void {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (error !== null) {
    const message: SilentRenewMessage = { source: 'copalibre-silent-renew', error };
    targetWindow.postMessage(message, targetOrigin);
    return;
  }

  const code = params.get('code');
  if (code === null) {
    const message: SilentRenewMessage = { source: 'copalibre-silent-renew', error: 'missing_code' };
    targetWindow.postMessage(message, targetOrigin);
    return;
  }

  const state = params.get('state');
  const message: SilentRenewMessage = {
    source: 'copalibre-silent-renew',
    code,
    ...(state === null ? {} : { state }),
  };
  targetWindow.postMessage(message, targetOrigin);
}
