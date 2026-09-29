import { expect, test } from '@playwright/test';

const issuer = 'http://jwks-stub';

test('Compose /control redirect stays on the serving origin and preserves returnTo', async ({
  page,
}) => {
  const returnTo = '/control/liga-mendocina?tab=emblems&filter=two clubs#staff';

  for (const origin of ['http://localhost:4321', 'http://localhost:8080']) {
    await page.goto(`${origin}/control/`);
    await page.waitForURL((url) => url.origin === origin && url.pathname === '/control/login');
    expect(new URL(page.url()).origin).toBe(origin);
    expect(new URL(page.url()).pathname).toBe('/control/login');
    expect(new URL(page.url()).search).toBe('');

    await page.goto(`${origin}/control/?returnTo=${encodeURIComponent(returnTo)}`);
    await page.waitForURL(
      (url) => url.origin === origin && url.pathname === '/control/login' && url.search !== '',
    );
    const destination = new URL(page.url());
    expect(destination.origin).toBe(origin);
    expect(destination.pathname).toBe('/control/login');
    expect(destination.searchParams.get('returnTo')).toBe(returnTo);
  }
});

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

  // The deployment's served origin owns the control sessionStorage.
  await page.goto('http://localhost:4321/control/');
  await expect(page).toHaveTitle('Sign in — CopaLibre');
  await expect(page.getByRole('heading', { name: 'Sign in to operate' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with identity provider' }).click();

  await page.waitForURL('https://identity.example/authorize**');
  const authorization = new URL(page.url());
  expect(authorization.searchParams.get('response_type')).toBe('code');
  expect(authorization.searchParams.get('client_id')).toBe('copalibre-compose-e2e');
  expect(authorization.searchParams.get('redirect_uri')).toBe(
    'http://localhost:4321/control/callback',
  );
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorization.searchParams.get('code_challenge')).toBeTruthy();
  expect(authorization.searchParams.get('state')).toBeTruthy();

  // Same serving-origin navigation as above — sessionStorage is per-origin.
  await page.goto('http://localhost:4321/control/');
  const stored = await page.evaluate(() => ({
    transaction: sessionStorage.getItem('copalibre.oidc.transaction'),
    accessToken: sessionStorage.getItem('access_token'),
    refreshToken: sessionStorage.getItem('refresh_token'),
  }));
  expect(stored.transaction).toBeTruthy();
  expect(stored.accessToken).toBeNull();
  expect(stored.refreshToken).toBeNull();
});

test('Compose web edge forwards emblem and discipline-image paths to the API', async ({
  request,
}) => {
  for (const origin of ['http://localhost:4321', 'http://localhost:8080']) {
    const background = await request.get(
      `${origin}/objects/discipline-background-image?key=unknown`,
    );
    expect(background.status(), `${origin} discipline image route`).toBe(404);
    expect(background.headers()['content-type']).toContain('application/json');
    expect(await background.json()).toMatchObject({
      errorCode: 'discipline-background-image-not-found',
    });

    const emblemRead = await request.get(`${origin}/organizations/no-such-org/emblem`);
    expect(emblemRead.status(), `${origin} emblem read route`).toBe(404);
    expect(emblemRead.headers()['content-type']).toContain('application/json');
    expect(await emblemRead.json()).toMatchObject({ errorCode: 'identity-media-not-found' });

    const emblemUpload = await request.post(`${origin}/organizations/no-such-org/emblem`, {
      data: {},
    });
    expect(emblemUpload.status(), `${origin} emblem upload route`).toBe(401);
    expect(emblemUpload.headers()['content-type']).toContain('application/json');

    const emblemRemoval = await request.delete(
      `${origin}/organizations/no-such-org/tournaments/no-such-tournament/emblem`,
    );
    expect(emblemRemoval.status(), `${origin} emblem removal route`).toBe(401);
    expect(emblemRemoval.headers()['content-type']).toContain('application/json');
  }
});
