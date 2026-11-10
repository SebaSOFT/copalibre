import { expect, test, type Page, type Route } from './csp-guard.js';

/**
 * The browser session lives in an HttpOnly cookie, never in script.
 *
 * These specs answer the API's session endpoints at the network layer with
 * real `Set-Cookie` headers, so the browser itself stores, sends and clears
 * the cookies, and every storage surface a script can read is inspected
 * directly. What the API does with the cookie is proven against the real HTTP
 * stack in the API's own integration suite.
 */

const SESSION_COOKIE = '__Host-copalibre_session';
const CSRF_COOKIE = 'copalibre_csrf';
const TARGET = '/control/liga-mendocina';
const LOGOUT_BUTTON = /log out|cerrar sesión/i;

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.e2e-signature`;
}

const NATIVE_TOKEN = jwt({ sub: 'e2e-operator', scp: 'copalibre.control', jti: 'native-1' });
const PROVIDER_TOKEN = jwt({ sub: 'idp-operator', scp: 'copalibre.control', jti: 'idp-1' });

function metadata(method: 'native' | 'oidc', subject: string) {
  return {
    subject,
    scopes: ['copalibre.control'],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    method,
  };
}

function sessionCookies(token: string): string[] {
  return [
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`,
    `${CSRF_COOKIE}=e2e-csrf.signature; Path=/; Secure; SameSite=Strict; Max-Age=3600`,
  ];
}

async function fulfillWithCookies(route: Route, body: unknown, cookies: string[]): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    // Playwright sends repeated headers joined by newlines.
    headers: { 'set-cookie': cookies.join('\n') },
    body: JSON.stringify(body),
  });
}

/** A stand-in API that only answers what a cookie actually authenticates. */
async function routeApi(page: Page): Promise<{ readonly unsafeWithoutCsrf: string[] }> {
  const unsafeWithoutCsrf: string[] = [];
  await page.route('**/runtime-config.json', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cookie = (await request.allHeaders()).cookie ?? '';
    const authorization = (await request.allHeaders()).authorization;
    const signedInAs = cookie.includes(`${SESSION_COOKIE}=${PROVIDER_TOKEN}`)
      ? 'oidc'
      : cookie.includes(`${SESSION_COOKIE}=${NATIVE_TOKEN}`)
        ? 'native'
        : undefined;

    if (request.method() !== 'GET' && cookie.includes(SESSION_COOKIE)) {
      if (!(await request.allHeaders())['x-copalibre-csrf']) unsafeWithoutCsrf.push(url.pathname);
    }

    if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
      return fulfillWithCookies(
        route,
        metadata('native', 'e2e-operator'),
        sessionCookies(NATIVE_TOKEN),
      );
    }
    if (url.pathname === '/api/auth/session' && request.method() === 'POST') {
      expect(authorization).toBe(`Bearer ${PROVIDER_TOKEN}`);
      return fulfillWithCookies(
        route,
        metadata('oidc', 'idp-operator'),
        sessionCookies(PROVIDER_TOKEN),
      );
    }
    if (url.pathname === '/api/auth/session') {
      return signedInAs
        ? route.fulfill({
            json: metadata(signedInAs, signedInAs === 'oidc' ? 'idp-operator' : 'e2e-operator'),
          })
        : route.fulfill({ status: 401, json: { message: 'No session present' } });
    }
    if (url.pathname === '/api/auth/refresh') {
      return route.fulfill({ status: 401, json: { message: 'No refresh session present' } });
    }
    if (url.pathname === '/api/auth/logout') {
      return fulfillWithCookies(route, { message: 'Logged out.' }, [
        `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
        `${CSRF_COOKIE}=; Path=/; Secure; SameSite=Strict; Max-Age=0`,
      ]);
    }
    if (url.pathname === '/api/organizations' && url.searchParams.get('mine') === 'true') {
      return signedInAs
        ? route.fulfill({
            json: [
              {
                organizationId: 'org-1',
                organizationAlias: 'liga-mendocina',
                organizationName: 'Liga Mendocina',
                role: 'admin',
              },
            ],
          })
        : route.fulfill({ status: 401, json: { message: 'Missing bearer token' } });
    }
    return signedInAs
      ? route.fulfill({ json: [] })
      : route.fulfill({ status: 401, json: { message: 'Missing bearer token' } });
  });
  return { unsafeWithoutCsrf };
}

/** Every storage surface a script on the page can read, and whether a token is in any of them. */
async function readableByScript(page: Page): Promise<{ text: string; cookie: string }> {
  return page.evaluate(() => {
    const dump = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? '';
        return `${key}=${storage.getItem(key) ?? ''}`;
      }).join('\n');
    return {
      text: `${dump(localStorage)}\n${dump(sessionStorage)}\n${document.cookie}`,
      cookie: document.cookie,
    };
  });
}

async function expectNoTokenReadable(page: Page, token: string): Promise<void> {
  const readable = await readableByScript(page);
  expect(readable.text).not.toContain(token);
  expect(readable.text).not.toContain('copalibre:session:v1');
  expect(readable.cookie).not.toContain(SESSION_COOKIE);
}

test('native sign-in keeps the token out of script, survives a reload and ends on logout', async ({
  page,
  context,
}) => {
  const api = await routeApi(page);
  await page.goto(`/control/login?returnTo=${encodeURIComponent(TARGET)}`);
  await page.getByLabel('Correo electrónico').fill('operator@example.com');
  await page.getByLabel('Contraseña').fill('correct-horse');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await page.waitForURL(`**${TARGET}`);
  await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toBeVisible();
  await expectNoTokenReadable(page, NATIVE_TOKEN);
  const stored = await context.cookies();
  expect(stored.find((cookie) => cookie.name === SESSION_COOKIE)).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
  });

  // A reload keeps the session: the browser sends the cookie, Control asks who is signed in.
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${TARGET}$`));
  await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toBeVisible();
  await expectNoTokenReadable(page, NATIVE_TOKEN);

  await page.getByRole('button', { name: LOGOUT_BUTTON }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(TARGET));
  await expect
    .poll(async () => (await context.cookies()).some((cookie) => cookie.name === SESSION_COOKIE))
    .toBe(false);
  expect(api.unsafeWithoutCsrf).toEqual([]);
});

test('OIDC sign-in hands the provider token to the API and keeps no copy', async ({
  page,
  context,
}) => {
  await routeApi(page);
  await page.route('https://identity.example/token', (route) =>
    route.fulfill({ json: { access_token: PROVIDER_TOKEN, expires_in: 3600 } }),
  );
  await page.addInitScript(
    ({ target }) => {
      if (sessionStorage.getItem('e2e-transaction-seeded')) return;
      sessionStorage.setItem('e2e-transaction-seeded', '1');
      sessionStorage.setItem(
        'copalibre.oidc.transaction',
        JSON.stringify({
          state: 'e2e-state',
          verifier: 'e2e-verifier',
          redirectUri: `${window.location.origin}/control/callback`,
          tokenEndpoint: 'https://identity.example/token',
          clientId: 'e2e-client',
          returnTo: target,
        }),
      );
    },
    { target: TARGET },
  );

  await page.goto('/control/callback?code=e2e-code&state=e2e-state');
  await page.waitForURL(`**${TARGET}`);
  await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toBeVisible();
  await expectNoTokenReadable(page, PROVIDER_TOKEN);
  expect((await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)?.httpOnly).toBe(
    true,
  );

  await page.reload();
  await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toBeVisible();
  await expectNoTokenReadable(page, PROVIDER_TOKEN);
});

test('a script on a public page obtains session metadata at most, never the token', async ({
  page,
  context,
}) => {
  await routeApi(page);
  await page.goto('/');
  // Signed in the way a browser is: the login response sets the HttpOnly cookie.
  await page.evaluate(() =>
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'operator@example.com', password: 'correct-horse' }),
    }),
  );
  expect((await context.cookies()).some((cookie) => cookie.name === SESSION_COOKIE)).toBe(true);

  const seen = await page.evaluate(async () => {
    const session = await fetch('/api/auth/session').then((response) => response.text());
    const refresh = await fetch('/api/auth/refresh', { method: 'POST' }).then((response) =>
      response.text(),
    );
    return { session, refresh, cookie: document.cookie };
  });

  expect(seen.session).toContain('"subject"');
  expect(seen.session).not.toContain(NATIVE_TOKEN);
  expect(seen.refresh).not.toContain(NATIVE_TOKEN);
  expect(seen.cookie).not.toContain(SESSION_COOKIE);
  await expectNoTokenReadable(page, NATIVE_TOKEN);
});

test('an older build’s token left in sessionStorage is deleted on load', async ({ page }) => {
  await routeApi(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-legacy-seeded')) return;
    sessionStorage.setItem('e2e-legacy-seeded', '1');
    sessionStorage.setItem('copalibre:session:v1', JSON.stringify({ token: 'legacy-jwt' }));
  });

  await page.goto(TARGET);
  await page.waitForURL('**/control/login**');
  expect(await page.evaluate(() => sessionStorage.getItem('copalibre:session:v1'))).toBeNull();
});
