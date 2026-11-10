import type { Page } from '@playwright/test';

/**
 * Drives the real `/control/callback` flow so e2e specs land on a
 * genuinely authenticated screen — not a bypass. A spec using this:
 *
 * 1. Extends its own `window.fetch` mock with a branch for {@link TOKEN_ENDPOINT}
 *    returning `{ access_token, expires_in }`.
 * 2. Calls {@link seedLoginTransaction} before navigating.
 * 3. Navigates to `/control/callback?code=e2e-code&state=${LOGIN_STATE}`
 *    instead of going straight to the target screen, then waits for the
 *    client-side redirect `completeOidcLogin`/`ControlApp` perform to land
 *    on the intended path.
 *
 * This exercises the real production code path (`completeOidcLogin`, the
 * hand-over to `POST /api/auth/session`, `ControlApp`'s callback case,
 * `navigateControl`). The e2e server runs no API, so
 * {@link installSessionEndpointStandIn} answers the session endpoints the
 * way the API does, holding what the HttpOnly cookie would hold.
 */
export const TOKEN_ENDPOINT = 'https://identity.example/token';
export const LOGIN_STATE = 'e2e-state';

const TRANSACTION_KEY = 'copalibre.oidc.transaction';

/**
 * Where the stand-in keeps the session between page loads, as the browser
 * keeps the session cookie. Test-only: the application itself never writes
 * session state to any storage.
 */
export const E2E_COOKIE_SESSION_KEY = 'copalibre.e2e.cookie-session';

export interface E2eSessionMetadata {
  readonly subject: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
  readonly method: 'native' | 'oidc';
}

const standInPages = new WeakSet<Page>();

/**
 * Answers `POST /api/auth/session` (the OIDC hand-over), `GET /api/auth/session`
 * (restore after a reload) and `POST /api/auth/logout` like the API: the
 * metadata comes from the handed-over token's claims, and nothing but metadata
 * ever reaches the page. Every other request goes to the spec's own mock.
 *
 * It stays the outermost `window.fetch` even when a spec's init script assigns
 * its own mock afterwards, and a mock that saved `window.fetch` to fall back on
 * gets a stand-in over the fetch it replaced, so the chain never loops.
 */
export async function installSessionEndpointStandIn(page: Page): Promise<void> {
  if (standInPages.has(page)) return;
  standInPages.add(page);
  await page.addInitScript((sessionKey: string) => {
    const marked = window as unknown as { __copalibreSessionStandIn?: boolean };
    if (marked.__copalibreSessionStandIn) return;
    marked.__copalibreSessionStandIn = true;

    const decodeClaims = (token: string): Record<string, unknown> => {
      try {
        const segment = token.split('.')[1] ?? '';
        const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return JSON.parse(atob(padded)) as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    const metadataFor = (token: string) => {
      const claims = decodeClaims(token);
      const scopes =
        typeof claims.scp === 'string'
          ? claims.scp.split(/\s+/).filter(Boolean)
          : ['copalibre.control', 'copalibre.participant'];
      const exp = typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + 3_600_000;
      return {
        subject: typeof claims.sub === 'string' ? claims.sub : 'e2e-operator',
        scopes,
        expiresAt: new Date(exp).toISOString(),
        method: 'oidc' as const,
      };
    };

    const standIns = new Map<typeof fetch, typeof fetch>();
    const standInOver = (inner: typeof fetch): typeof fetch => {
      const existing = standIns.get(inner);
      if (existing) return existing;
      const standIn: typeof fetch = async (input, init) => {
        const raw = input instanceof Request ? input.url : String(input);
        const url = new URL(raw, window.location.origin);
        const method = (
          init?.method ?? (input instanceof Request ? input.method : 'GET')
        ).toUpperCase();
        if (url.origin === window.location.origin && url.pathname === '/api/auth/session') {
          if (method === 'POST') {
            const authorization = new Headers(init?.headers).get('authorization') ?? '';
            const session = metadataFor(authorization.replace(/^Bearer\s+/i, ''));
            sessionStorage.setItem(sessionKey, JSON.stringify(session));
            return Response.json(session);
          }
          const stored = sessionStorage.getItem(sessionKey);
          if (
            stored &&
            Date.parse((JSON.parse(stored) as { expiresAt: string }).expiresAt) > Date.now()
          ) {
            return Response.json(JSON.parse(stored));
          }
          return Response.json({ message: 'No session present' }, { status: 401 });
        }
        if (
          url.origin === window.location.origin &&
          url.pathname === '/api/auth/logout' &&
          method === 'POST'
        ) {
          sessionStorage.removeItem(sessionKey);
          return Response.json({ message: 'Logged out.' });
        }
        return inner.call(window, input, init);
      };
      standIns.set(inner, standIn);
      return standIn;
    };

    let inner: typeof fetch = window.fetch;
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      get: () => standInOver(inner),
      set: (value: typeof fetch) => {
        inner = value;
      },
    });
  }, E2E_COOKIE_SESSION_KEY);
}

/**
 * Starts the page already signed in, as a browser holding a valid session
 * cookie would: `GET /api/auth/session` answers with this metadata.
 */
export async function signInWithSessionCookie(
  page: Page,
  session: Partial<E2eSessionMetadata> = {},
): Promise<void> {
  await installSessionEndpointStandIn(page);
  const metadata: E2eSessionMetadata = {
    subject: 'e2e-operator',
    scopes: ['copalibre.control', 'copalibre.participant'],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    method: 'native',
    ...session,
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
    },
    { key: E2E_COOKIE_SESSION_KEY, value: JSON.stringify(metadata) },
  );
}

export async function seedLoginTransaction(page: Page, returnTo: string): Promise<void> {
  await installSessionEndpointStandIn(page);
  await page.addInitScript(
    ({ transactionKey, tokenEndpoint, state, returnTo: target }) => {
      sessionStorage.setItem(
        transactionKey,
        JSON.stringify({
          state,
          verifier: 'e2e-verifier',
          redirectUri: `${window.location.origin}/control/callback`,
          tokenEndpoint,
          clientId: 'e2e-client',
          returnTo: target,
        }),
      );
    },
    {
      transactionKey: TRANSACTION_KEY,
      tokenEndpoint: TOKEN_ENDPOINT,
      state: LOGIN_STATE,
      returnTo,
    },
  );
}

/** The callback URL a spec navigates to once its mocks and transaction are seeded. */
export function loginCallbackUrl(): string {
  return `/control/callback?code=e2e-code&state=${LOGIN_STATE}`;
}
