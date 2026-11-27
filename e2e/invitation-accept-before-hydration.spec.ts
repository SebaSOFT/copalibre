import { expect, test } from './csp-guard.js';

/**
 * A submit that reaches the browser before React owns the form is a native GET,
 * which drops the invitation token from the URL. The screen must offer no form
 * until the form can send that token.
 */

const TOKEN = 'e2e-invitation-token';
const ACCEPT_PATH = `/invitations/accept?token=${TOKEN}`;

test('no form exists until the scripts load, and the token reaches the request', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/auth/accept-invitation', async (route) => {
    requests.push(route.request().postData() ?? '');
    await route.fulfill({
      json: {
        subject: 'e2e-invited',
        scopes: ['copalibre.control'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        method: 'native',
      },
    });
  });

  let releaseScripts = (): void => undefined;
  const scriptsReleased = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route(/\.m?[jt]sx?(\?.*)?$/, async (route) => {
    await scriptsReleased;
    await route.continue();
  });

  await page.goto(ACCEPT_PATH, { waitUntil: 'commit' });
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('form')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('token')).toBe(TOKEN);

  releaseScripts();
  await page.locator('#password').fill('correct-horse-battery');
  await page.locator('#confirmPassword').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Aceptar y comenzar' }).click();

  await expect.poll(() => requests.length).toBe(1);
  expect(JSON.parse(requests[0] ?? '{}').token).toBe(TOKEN);
});

test('without JavaScript the page says what it needs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: 'es-AR' });
  const page = await context.newPage();
  await page.goto(ACCEPT_PATH);

  // Text matchers skip `noscript`, so this reads the document itself.
  expect(await page.content()).toContain('hace falta JavaScript');
  await expect(page.locator('form')).toHaveCount(0);
  await context.close();
});
