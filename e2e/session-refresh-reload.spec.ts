import { expect, test } from '@playwright/test';

const TARGET = '/control/panamericano-demo';
const TOKEN_STORAGE_KEY = 'copalibre:session:v1';
const AUTH_METHOD_STORAGE_KEY = 'copalibre:session:authMethod:v1';
const LOGOUT_BUTTON = /log out|cerrar sesión/i;

test('keeps the dashboard signed in across ten reloads in one minute', async ({ page }) => {
  let refreshes = 0;
  const token = `header.${Buffer.from(
    JSON.stringify({ scp: 'copalibre.control', exp: Math.floor(Date.now() / 1_000) + 5 }),
  ).toString('base64url')}.signature`;

  await page.addInitScript(
    ({ tokenValue, tokenKey, authMethodKey }) => {
      if (!sessionStorage.getItem(tokenKey)) {
        sessionStorage.setItem(
          tokenKey,
          JSON.stringify({ token: tokenValue, expiresAt: Date.now() + 60_000 }),
        );
      }
      sessionStorage.setItem(authMethodKey, 'native');
    },
    {
      tokenValue: token,
      tokenKey: TOKEN_STORAGE_KEY,
      authMethodKey: AUTH_METHOD_STORAGE_KEY,
    },
  );

  await page.route('**/runtime-config.json', (route) =>
    route.fulfill({ json: { sessionMode: 'pragmatic-persistent' } }),
  );
  await page.route('**/auth/refresh', async (route) => {
    refreshes += 1;
    await route.fulfill({ json: { accessToken: token, expiresIn: 10 } });
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
