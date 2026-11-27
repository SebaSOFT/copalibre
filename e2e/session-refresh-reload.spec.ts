import { expect, test } from './csp-guard.js';

const TARGET = '/control/panamericano-demo';
const LOGOUT_BUTTON = /log out|cerrar sesión/i;

/** What the API answers for a native session: metadata only, the token stays in the cookie. */
function nativeSession(expiresInSeconds: number) {
  return {
    subject: 'e2e-operator',
    scopes: ['copalibre.control'],
    expiresAt: new Date(Date.now() + expiresInSeconds * 1_000).toISOString(),
    method: 'native',
  };
}

test('keeps the dashboard signed in across ten reloads in one minute', async ({ page }) => {
  let refreshes = 0;

  await page.route('**/runtime-config.json', (route) =>
    route.fulfill({ json: { sessionMode: 'pragmatic-persistent' } }),
  );
  // The session cookie survives a reload; Control asks who is signed in.
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: nativeSession(5) }));
  await page.route('**/auth/refresh', async (route) => {
    refreshes += 1;
    await route.fulfill({ json: nativeSession(10) });
  });
  await page.route('**/organizations**', (route) => route.fulfill({ json: [] }));

  await page.goto(TARGET);
  await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toBeVisible();
  await expect.poll(() => refreshes, { timeout: 5_000 }).toBe(1);

  for (let reload = 1; reload < 10; reload += 1) {
    await page.reload();
    await expect.poll(() => refreshes, { timeout: 5_000 }).toBe(reload + 1);
    await expect(page).toHaveURL(new RegExp(`${TARGET}$`));
    await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toBeVisible();
  }

  expect(refreshes).toBe(10);
});
