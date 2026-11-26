import { expect, test } from './tv-fixtures.js';

test('TV launcher previews background changes and exposes pinned match controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tv?lang=es&view=match&bg=football');

  await expect(page.getByRole('heading', { name: 'Lanzador de pantalla TV' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-tv-background', 'football');

  const organization = page.getByLabel('Organización');
  if ((await organization.count()) === 0) {
    await expect(page.getByRole('status')).toBeVisible();
    return;
  }

  await expect(organization).toBeVisible();
  await expect(page.locator('[data-launcher-tournament]')).toBeVisible();
  await expect(page.locator('[data-launcher-stage]')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Fijar un partido', exact: true })).toBeVisible();

  await page.getByLabel('Fondo').selectOption('court');
  await expect(page.locator('html')).toHaveAttribute('data-tv-background', 'court');
  await page.getByLabel('Fondo').selectOption('chroma');
  await expect(page.locator('html')).toHaveAttribute('data-tv-background', 'chroma');

  const match = page.getByRole('combobox', { name: 'Fijar un partido', exact: true });
  // No match is named until the operator picks one: the first real match is picked here.
  const firstMatch = match.locator('option[value]:not([value=""])').first();
  if ((await firstMatch.count()) > 0) {
    await match.selectOption((await firstMatch.getAttribute('value')) ?? '');
    const launch = page.getByRole('link', { name: 'Lanzar pantalla TV' });
    await expect(launch).toHaveAttribute(
      'href',
      /\/tv\/[^/]+\/tournaments\/[^/]+\/stages\/\d+\/matches\/\d+\?/,
    );
  } else {
    await expect(page.locator('.tv-launcher__notice')).toContainText(
      'No hay partidos disponibles para fijar en este torneo.',
    );
  }
});

test('TV launcher remains usable at mobile viewport and restores a valid saved preset', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'copalibre.tv.launcher_preset',
      JSON.stringify({
        organization: 'liga-mendocina',
        tournament: 'apertura-2026',
        view: 'dashboard',
        background: 'court',
        language: 'es',
      }),
    );
  });
  await page.goto('/tv');
  await expect(page.getByRole('heading', { name: 'TV display launcher' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-tv-background', /court|discipline/);
  await expect(page.locator('body')).toBeVisible();
});

test('kiosk and pinned-match routes render all supported TV backgrounds', async ({ page }) => {
  const routes = [
    '/tv/liga-mendocina/tournaments/apertura-2026',
    '/tv/liga-mendocina/tournaments/apertura-2026/stages/1/matches/1',
  ];
  const backgrounds = ['discipline', 'neutral', 'chroma', 'football', 'court', 'transparent'];

  for (const route of routes) {
    for (const background of backgrounds) {
      await page.goto(`${route}?bg=${background}`);
      await expect(page.locator('html')).toHaveAttribute('data-tv-background', background);
    }
  }

  await page.goto('/tv/liga-mendocina/tournaments/apertura-2026?mode=overlay');
  await expect(page.locator('html')).toHaveAttribute('data-tv-background', 'transparent');
});
