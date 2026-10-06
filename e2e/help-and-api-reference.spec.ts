import { expect, test } from '@playwright/test';

test('navigates help content and searches through Starlight', async ({ page }) => {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  await page.goto('/help/');

  await expect(page.getByRole('heading', { name: 'CopaLibre Help' })).toBeVisible();
  await expect(page.locator('meta[name="astro-view-transitions-enabled"]')).toHaveCount(1);

  await page.getByRole('link', { name: 'Your first tournament', exact: true }).click();
  await expect(page).toHaveURL(/\/help\/getting-started\/$/);
  await expect(page.getByRole('heading', { name: 'Create the tournament' })).toBeVisible();

  const search = page.getByRole('button', { name: 'Search' }).first();
  await expect(search).toBeEnabled();
  await search.click();
  await page.waitForTimeout(1_000);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  const input = page.getByRole('textbox', { name: 'Search' }).first();
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill('Roster');
  await expect(page.getByRole('link', { name: /Roster/ }).first()).toBeVisible();
});

test('serves the dashboard-specific help article under each locale prefix', async ({ page }) => {
  const localizedPages = [
    ['/help/control/overview/', 'Organization dashboard'],
    ['/es/help/control/overview/', 'Panel de la organización'],
    ['/fr/help/control/overview/', 'Tableau de bord de l’organisation'],
    ['/pt/help/control/overview/', 'Painel da organização'],
    ['/it/help/control/overview/', 'Dashboard dell’organizzazione'],
    ['/de/help/control/overview/', 'Organisationsübersicht'],
    ['/ru/help/control/overview/', 'Панель организации'],
    ['/zh/help/control/overview/', '组织控制面板'],
  ] as const;

  await page.goto('/help/control/');
  await expect(page.getByRole('heading', { name: 'Control panel', level: 1 })).toBeVisible();

  for (const [path, title] of localizedPages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  }
});

test('public home page renders hero orientation hub with zero organizations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CopaLibre', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ready for Competition', level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Control Panel' })).toHaveAttribute(
    'href',
    '/control/',
  );
  await expect(page.getByRole('link', { name: 'Read the Guides' })).toHaveAttribute(
    'href',
    '/help/',
  );

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Help' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: /API reference/i })).toHaveCount(0);
});
