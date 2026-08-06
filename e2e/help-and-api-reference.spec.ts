import { expect, test } from '@playwright/test';

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

test('loads its rendering script and stylesheet same-origin, not from a CDN', async ({ page }) => {
  // Vendored (0040): the reference's own script tag must point at this
  // origin's build output, never a third-party host — the literal defect
  // this task fixes (a blank page on an install with no internet egress).
  const documentRequests: string[] = [];
  page.on('request', (request) => {
    if (['script', 'stylesheet'].includes(request.resourceType())) {
      documentRequests.push(request.url());
    }
  });

  await page.goto('/help/api-reference/');
  await expect(page.getByText('CopaLibre API')).toBeVisible();

  expect(documentRequests).toContain('http://localhost:4321/vendor/scalar/standalone.js');
  expect(documentRequests.every((url) => url.startsWith('http://localhost:4321/'))).toBe(true);
});

test('renders correctly when Scalar’s own hosted endpoints are unreachable', async ({ page }) => {
  // Even vendored, this pinned build still calls out to Scalar's cloud for a
  // couple of secondary features (default webfont, an AI-agent "suggested
  // docs" prefetch) that no documented config flag fully suppresses — see
  // design.md's "residual outbound calls" note. What must hold regardless:
  // those calls failing (as they would on a true no-egress install) must not
  // break the reference itself.
  await page.route('**://fonts.scalar.com/**', (route) => route.abort());
  await page.route('**://api.scalar.com/**', (route) => route.abort());

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/help/api-reference/');

  await expect(page.locator('#api-reference')).not.toBeEmpty();
  await expect(page.getByText('CopaLibre API')).toBeVisible();
  await expect(page.getByRole('button', { name: /Send Request|Test Request/ })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
