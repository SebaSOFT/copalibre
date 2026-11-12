import { expect, test } from './csp-guard.js';

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
  await expect(page).toHaveTitle('Iniciar sesión — CopaLibre');
  await expect(page.getByRole('heading', { name: 'Iniciá sesión para operar' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar con el proveedor de identidad' }).click();

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
    legacySession: sessionStorage.getItem('copalibre:session:v1'),
    cookie: document.cookie,
  }));
  expect(stored.transaction).toBeTruthy();
  expect(stored.accessToken).toBeNull();
  expect(stored.refreshToken).toBeNull();
  expect(stored.legacySession).toBeNull();
  expect(stored.cookie).not.toContain('copalibre_session');
});

test('Compose web edge forwards /api media paths to the API', async ({ request }) => {
  for (const origin of ['http://localhost:4321', 'http://localhost:8080']) {
    const background = await request.get(
      `${origin}/api/objects/discipline-background-image?key=unknown`,
    );
    expect(background.status(), `${origin} discipline image route`).toBe(404);
    expect(background.headers()['content-type']).toContain('application/json');
    expect(await background.json()).toMatchObject({
      errorCode: 'discipline-background-image-not-found',
    });

    const emblemRead = await request.get(`${origin}/api/organizations/no-such-org/emblem`);
    expect(emblemRead.status(), `${origin} emblem read route`).toBe(404);
    expect(emblemRead.headers()['content-type']).toContain('application/json');
    expect(await emblemRead.json()).toMatchObject({ errorCode: 'identity-media-not-found' });

    const emblemUpload = await request.post(`${origin}/api/organizations/no-such-org/emblem`, {
      data: {},
    });
    expect(emblemUpload.status(), `${origin} emblem upload route`).toBe(401);
    expect(emblemUpload.headers()['content-type']).toContain('application/json');

    const emblemRemoval = await request.delete(
      `${origin}/api/organizations/no-such-org/tournaments/no-such-tournament/emblem`,
    );
    expect(emblemRemoval.status(), `${origin} emblem removal route`).toBe(401);
    expect(emblemRemoval.headers()['content-type']).toContain('application/json');
  }
});

/**
 * The bootstrap administrator's one-time setup link, which the CI job saves
 * from `copalibre create-admin`. Accepting it is a native sign-in through the
 * real API, so the cookies below are the ones a browser would receive.
 */
const setupUrl = process.env.COPALIBRE_E2E_SETUP_URL;

function setCookieValues(headers: readonly { name: string; value: string }[]): string[] {
  return headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .flatMap((header) => header.value.split('\n'));
}

async function firstStreamFrame(url: string, cookie: string | undefined) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      headers: cookie === undefined ? {} : { cookie },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      return { status: response.status, contentType: '', text: '' };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('data:')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      text,
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

test('native sign-in sets HttpOnly session cookies, and the cookie opens the Control stream', async ({
  request,
}, testInfo) => {
  test.skip(!setupUrl, 'COPALIBRE_E2E_SETUP_URL is set by the Deployment E2E job');
  // The setup link is single-use: one project accepts it.
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the setup link is single-use');
  const token = new URL(setupUrl ?? 'http://invalid').searchParams.get('token');

  const accepted = await request.post('http://localhost:8080/api/auth/accept-invitation', {
    data: { token, password: 'deployment-e2e-password', name: 'Deployment E2E' },
  });
  expect(accepted.status()).toBe(200);
  const body = await accepted.json();
  expect(body.accessToken).toBeUndefined();
  expect(body).toMatchObject({ method: 'native' });

  const cookies = setCookieValues(accepted.headersArray());
  const session = cookies.find((value) => value.startsWith('__Host-copalibre_session='));
  const csrf = cookies.find((value) => value.startsWith('copalibre_csrf='));
  const refresh = cookies.find((value) => value.startsWith('copalibre_refresh_token='));
  // `copalibre init` writes COPALIBRE_SESSION_COOKIE_SECURE=true for localhost.
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) {
    expect(session?.split('; ')).toContain(attribute);
  }
  expect(session).not.toMatch(/Domain=/i);
  expect(csrf?.split('; ')).not.toContain('HttpOnly');
  expect(refresh?.split('; ')).toContain('Path=/api/auth');

  const cookie = [session, csrf].map((value) => value?.split(';')[0]).join('; ');
  const metadata = await request.get('http://localhost:8080/api/auth/session', {
    headers: { cookie },
  });
  expect(metadata.status()).toBe(200);
  expect(await metadata.text()).not.toContain(session?.split(';')[0]?.split('=')[1] ?? '');

  // The gateway and the web role both route /events on the Control hostname.
  for (const origin of ['http://localhost:8080', 'http://localhost:4321']) {
    const stream = await firstStreamFrame(`${origin}/events/control/integrity-league`, cookie);
    expect(stream.status, `${origin} control stream with the cookie`).toBe(200);
    expect(stream.contentType).toContain('text/event-stream');
    expect(stream.text, `${origin} delivers a Control event`).toContain('data:');

    const anonymous = await firstStreamFrame(
      `${origin}/events/control/integrity-league`,
      undefined,
    );
    expect(anonymous.status, `${origin} control stream without the cookie`).toBe(401);
  }
});
