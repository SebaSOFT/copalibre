import { expect, test } from '@playwright/test';

const scalarCdn = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.64.0';

test('navigates help content and searches through Starlight', async ({ page }) => {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  await page.goto('/help/');

  await expect(page.getByRole('heading', { name: 'Ayuda de CopaLibre' })).toBeVisible();
  await expect(page.locator('meta[name="astro-view-transitions-enabled"]')).toHaveCount(1);

  await page.getByRole('link', { name: 'Primer torneo', exact: true }).click();
  await expect(page).toHaveURL(/\/help\/getting-started\/$/);
  await expect(page.getByRole('heading', { name: 'Crear torneo' })).toBeVisible();

  const search = page.getByRole('button', { name: 'Buscar' }).first();
  await expect(search).toBeEnabled();
  await search.click();
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  const input = dialog.locator('input');
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill('Roster');
  await expect(dialog.getByRole('link', { name: /Roster/ }).first()).toBeVisible();
});

test('renders the static OpenAPI artifact with request execution disabled', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.route(scalarCdn, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.Scalar = {
          createApiReference(target, configuration) {
            const root = document.querySelector(target);
            if (!root) throw new Error('Scalar mount is missing');
            root.dataset.scalarReady = 'true';
            if (!configuration.hideTestRequestButton) {
              const button = document.createElement('button');
              button.textContent = 'Try It';
              root.append(button);
            }
            fetch(configuration.url)
              .then((response) => response.json())
              .then((document) => {
                root.dataset.openapiVersion = document.info.version;
                root.textContent = document.info.title;
              });
          },
        };
      `,
    }),
  );

  await page.goto('/help/api-reference/');

  const reference = page.locator('#api-reference[data-scalar-ready="true"]');
  await expect(reference).toHaveAttribute('data-openapi-version', '4.0.0');
  await expect(reference).toHaveText('CopaLibre API');
  await expect(page.getByRole('button', { name: 'Try It' })).toHaveCount(0);

  expect(requests).toContain('http://localhost:4321/openapi/v1.json');
  expect(requests).toEqual(
    expect.arrayContaining([expect.stringMatching(/^http:\/\/localhost:4321\//), scalarCdn]),
  );
  expect(
    requests.every((url) => url.startsWith('http://localhost:4321/') || url === scalarCdn),
  ).toBe(true);
});
