import { expect, test } from './csp-guard.js';

const TOKEN = 'cl_pat_example_token_value';

test('the API reference renders from the local document, in CopaLibre fonts, with no outbound request', async ({
  page,
  baseURL,
}) => {
  const outbound: string[] = [];
  const failed: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL ?? 'http://localhost').origin) {
      outbound.push(request.url());
    }
  });
  page.on('requestfailed', (request) => failed.push(request.url()));
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const document = page.waitForResponse((response) => response.url().endsWith('/openapi/v1.json'));
  await page.goto('/help/api-reference/');
  expect((await document).status()).toBe(200);

  await expect(page.getByRole('heading', { name: 'CopaLibre API', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download OpenAPI Document' })).toBeVisible();
  // The introduction has left its loading skeleton: the document was read and rendered.
  await expect(page.locator('.introduction-skeleton')).toHaveCount(0);
  // The application's own fonts and colours, not Scalar's.
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
    .toContain('Barlow');
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.querySelector('.scalar-app') ?? document.body).fontFamily,
      ),
    )
    .toContain('Barlow');

  expect(outbound).toEqual([]);
  expect(failed).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('Try It sends the pasted token to this origin only, without the session cookie, and keeps it off storage', async ({
  page,
  context,
  baseURL,
}) => {
  // A signed-in operator's session cookie must not ride along: Try It acts as the token, not as them.
  await context.addCookies([
    { name: 'copalibre_session', value: 'session-secret', url: baseURL ?? 'http://localhost' },
  ]);
  const requests: { url: string; authorization?: string; cookie?: string }[] = [];
  await page.route('**/api/**', async (route) => {
    const headers = await route.request().allHeaders();
    requests.push({
      url: route.request().url(),
      authorization: headers.authorization,
      cookie: headers.cookie,
    });
    await route.fulfill({ json: { role: 'api', version: 'e2e' } });
  });

  await page.goto('/help/api-reference/');
  await expect(page.getByRole('heading', { name: 'CopaLibre API', level: 1 })).toBeVisible();
  await page.getByPlaceholder('Token').first().fill(TOKEN);
  await page
    .getByRole('link', { name: /Liveness probe/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /Test Request/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Send/ }).first().click();

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({
    url: `${baseURL}/api/health`,
    authorization: `Bearer ${TOKEN}`,
    cookie: undefined,
  });
  const stored = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  expect(stored).not.toContain(TOKEN);
});

test('the public site and the help site link nowhere to the reference: only Control does', async ({
  page,
}) => {
  for (const path of ['/', '/help/', '/es/help/']) {
    await page.goto(path);
    await expect(page.locator('main, body').first()).toBeVisible();
    await expect(page.locator('a[href*="api-reference"]')).toHaveCount(0);
  }
});
