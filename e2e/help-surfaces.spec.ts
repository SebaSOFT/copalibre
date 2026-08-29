import { expect, test } from '@playwright/test';

// openspec 0162: every control-panel route's helpPath must resolve to a
// page describing that screen, including platform administration (whose
// route previously declared an empty helpPath and was invisible to the
// existing link check).
const CONTROL_HELP_PATHS = [
  'preferences',
  'clubs',
  'resources',
  'schedule',
  'tournament-authoring',
  'registration-review',
  'person-profile',
  'report-review',
  'standings',
  'seeding',
  'roles-permissions',
  'match-console',
  'load-match-data',
  'zone-groups',
  'promotion-plan',
  'platform-administration',
];

test.describe('every control-panel help link resolves to a real, current page (6.1)', () => {
  for (const helpPath of CONTROL_HELP_PATHS) {
    test(`/help/control/${helpPath}/ renders`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      const response = await page.goto(`/help/control/${helpPath}/`);
      expect(response?.ok()).toBe(true);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(pageErrors).toEqual([]);
    });
  }
});

test('a help page renders its declared roles visibly, not only in frontmatter (6.2)', async ({
  page,
}) => {
  await page.goto('/help/control/platform-administration/');
  await expect(page.getByRole('heading', { name: 'Platform administration' })).toBeVisible();

  // The role badge is real page content in the accessible tree, not a
  // tooltip or attribute a reader would never see.
  await expect(page.getByText('For roles:')).toBeVisible();
  await expect(page.getByText('Super-admin', { exact: true })).toBeVisible();
});

test('a page whose declared roles do not include broadcaster does not claim one it does not declare', async ({
  page,
}) => {
  await page.goto('/help/control/roles-permissions/');
  await expect(page.getByText('For roles:')).toBeVisible();
  await expect(page.getByText('Admin', { exact: true })).toBeVisible();
  await expect(page.getByText('Broadcaster', { exact: true })).toHaveCount(0);
});

test('the series and schedule pages are reachable and render in a non-English locale (6.3)', async ({
  page,
}) => {
  const seriesResponse = await page.goto('/es/help/control/series/');
  expect(seriesResponse?.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Series de varios partidos' })).toBeVisible();
  await expect(page.getByText('Para roles:')).toBeVisible();

  const scheduleResponse = await page.goto('/es/help/control/schedule/');
  expect(scheduleResponse?.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Horarios', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Grano de partido/i })).toBeVisible();
});
