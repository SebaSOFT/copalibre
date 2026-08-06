import { expect, test } from '@playwright/test';

const issuer = 'http://jwks-stub';

test('fresh Compose installation exposes generic OIDC PKCE login', async ({ page }) => {
  await page.route(`${issuer}/.well-known/openid-configuration`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        issuer,
        authorization_endpoint: 'https://identity.example/authorize',
      }),
    });
  });
  await page.route('https://identity.example/authorize**', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<title>Identity provider</title>' });
  });

  await page.goto('/control/');
  await expect(page).toHaveTitle('Acceso de control — CopaLibre');
  await expect(page.getByRole('heading', { name: 'Ingresá para operar' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar con proveedor de identidad' }).click();

  await page.waitForURL('https://identity.example/authorize**');
  const authorization = new URL(page.url());
  expect(authorization.searchParams.get('response_type')).toBe('code');
  expect(authorization.searchParams.get('client_id')).toBe('copalibre-compose-e2e');
  expect(authorization.searchParams.get('redirect_uri')).toBe(
    'http://127.0.0.1:4321/control/callback',
  );
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorization.searchParams.get('code_challenge')).toBeTruthy();
  expect(authorization.searchParams.get('state')).toBeTruthy();

  await page.goto('/control/');
  const stored = await page.evaluate(() => ({
    transaction: sessionStorage.getItem('copalibre.oidc.transaction'),
    accessToken: sessionStorage.getItem('access_token'),
    refreshToken: sessionStorage.getItem('refresh_token'),
  }));
  expect(stored.transaction).toBeTruthy();
  expect(stored.accessToken).toBeNull();
  expect(stored.refreshToken).toBeNull();
});
