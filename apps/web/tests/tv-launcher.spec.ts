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
  if ((await match.locator('option').count()) > 0) {
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
  await page.goto('/tv');
  // The preset names the organization and tournament this environment offers, so the restore applies.
  const organization = await page.locator('[data-launcher-organization]').inputValue();
  const tournament = await page.locator('[data-launcher-tournament]').inputValue();
  await page.evaluate(
    (preset) => window.localStorage.setItem('copalibre.tv.launcher_preset', JSON.stringify(preset)),
    {
      organization,
      tournament,
      view: 'dashboard',
      background: 'court',
      language: 'es',
    },
  );
  await page.goto('/tv');
  // The saved language applies to the labels, so the launcher opens in Spanish.
  await expect(page.getByRole('heading', { name: 'Lanzador de pantalla TV' })).toBeVisible();
  await expect(page.locator('[data-launcher-language]')).toHaveValue('es');
  // A preset saved as the rotating dashboard restores as the kiosk view it always meant.
  await expect(page.locator('[data-launcher-view]')).toHaveValue('kiosk');
  await expect(page.locator('[data-launcher-background]')).toHaveValue('court');
  await expect(page.locator('html')).toHaveAttribute('data-tv-background', 'court');
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
  await expect(page.locator('html')).toHaveClass(/tv-overlay--scorebug/);
});
