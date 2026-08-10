import type { Page } from '@playwright/test';

/**
 * Drives the real `/control/callback` flow (0062) so e2e specs land on a
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
 * This exercises the real production code path (`completeOidcLogin`,
 * `ControlApp`'s callback case, `navigateControl`) rather than reaching into
 * `controlTokenStore` from outside the page — which isn't possible anyway,
 * by design (0061 design.md): it's an in-memory module singleton with no
 * external access point, and adding one for tests would ship in the real
 * production bundle too.
 */
export const TOKEN_ENDPOINT = 'https://identity.example/token';
export const LOGIN_STATE = 'e2e-state';

const TRANSACTION_KEY = 'copalibre.oidc.transaction';

export async function seedLoginTransaction(page: Page, returnTo: string): Promise<void> {
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
