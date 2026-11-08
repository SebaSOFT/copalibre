import { createServer, type Server } from 'node:http';
import AxeBuilder from '@axe-core/playwright';
import { resolveSemantic } from '@copalibre/design-tokens';
import { expect, test } from './fixtures.js';
import { expectNoSeriousSemanticViolations } from './support/semantic-axe.js';

/**
 * End-to-end tests for public navigation and accessibility hardening:
 * - Internal brand navigation preserves current locale
 * - 404 page resolves locale from requested pathname and renders home link
 * - Control-panel Modal close control exposes an accessible name in accessibility tree
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';

const cssColor = (hex: string): string => {
  const channels = hex.slice(1).match(/.{2}/g);
  if (!channels || channels.length !== 3) throw new Error('Expected a six-digit design token.');
  return `rgb(${channels.map((channel) => Number.parseInt(channel, 16)).join(', ')})`;
};

const organizationsList = [
  {
    organizationId: '01900000-0000-7000-8000-000000000001',
    alias: ORGANIZATION,
    name: 'Liga Mendocina',
    primaryLanguage: 'es',
    timezone: 'America/Argentina/Mendoza',
  },
];

const organizationTournaments = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournaments: [
    {
      tournamentId: '01900000-0000-7000-8000-000000000010',
      alias: TOURNAMENT_ALIAS,
      name: 'Apertura 2026',
      status: 'live',
      discipline: {
        descriptorId: '01890000-0000-7000-8000-000000000001',
        version: '1.0.0',
        name: 'Football',
      },
    },
  ],
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [
    {
      matchNumber: 1,
      stageNumber: 1,
      homeName: 'Talleres',
      awayName: 'San Martín',
      status: 'in-progress',
      scheduledAt: '2026-03-01T15:00:00Z',
    },
  ],
  clubs: [],
  ruleset: {},
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === '/api/organizations') {
      res.end(JSON.stringify(organizationsList));
      return;
    }

    if (path === `/api/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(JSON.stringify(organizationTournaments));
      return;
    }

    if (
      path === `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/overview` ||
      path === `/api/organizations/${ORGANIZATION}/public/tournaments/${TOURNAMENT_ALIAS}/overview`
    ) {
      res.end(JSON.stringify(overview));
      return;
    }

    if (path === `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/live`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          tournamentAlias: TOURNAMENT_ALIAS,
          matches: [],
        }),
      );
      return;
    }

    if (path === `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });

  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.describe('Public Navigation & Accessibility Hardening', () => {
  test('the Spanish home route is localized, flush, and leaves unknown routes as 404s', async ({
    page,
  }) => {
    const response = await page.goto('/es');
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('h1')).toHaveText('CopaLibre');
    await expect(page.getByText('No existe ninguna organización en esta dirección.')).toHaveCount(
      0,
    );

    const header = page.locator('.cl-public-header');
    expect(await header.evaluate((element) => (element as HTMLElement).offsetTop)).toBe(0);
    expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBe(0);

    const nav = page.locator('#cl-public-nav');
    await expect(nav.locator('a[href="/es/"]')).toBeVisible();
    await expect(nav.locator('a[href="/es/help/"]')).toHaveCount(0);

    const languageTrigger = page.locator('.cl-public-header__locale summary');
    await expect(languageTrigger).toBeVisible();
    await expect(languageTrigger).toHaveClass(/cl-chamfer--control/);
    await expect(languageTrigger.locator('svg.cl-icon')).toBeVisible();
    await expect(languageTrigger).toContainText('ES');
    await languageTrigger.click();
    const languagePopover = page.locator('.cl-public-header__locale-list');
    await expect(languagePopover).toBeVisible();
    await expect(languagePopover).toHaveClass(/cl-chamfer--control/);
    await expect(languagePopover.locator('a[hreflang="fr"]')).toHaveAttribute('href', '/fr');

    const missingRouteResponse = await page.goto('/some-missing-page');
    expect(missingRouteResponse?.status()).toBe(404);
  });

  test('the home page passes the semantic accessibility rules', async ({ page }) => {
    await page.goto('/es');
    await expect(page.locator('.cl-home-hero__badges > li')).toHaveCount(3);

    await expectNoSeriousSemanticViolations(page);
  });

  test('the main menu links to the TV display launcher in the page’s language', async ({
    page,
  }) => {
    await page.goto('/es');
    const spanish = page.locator('#cl-public-nav').getByRole('link', { name: 'TV Streaming' });
    await expect(spanish).toHaveAttribute('href', '/tv?lang=es');

    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    const english = page.locator('#cl-public-nav').getByRole('link', { name: 'TV Streaming' });
    await expect(english).toHaveAttribute('href', '/tv?lang=en');
    await english.click();
    await expect(page).toHaveURL(/\/tv\?lang=en/);
  });

  test('mobile public navigation separates global and tournament groups; desktop keeps one primary row', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const toggle = page.locator('[data-public-nav-toggle]');
    const globalNav = page.locator('#cl-public-nav');
    const tournamentNav = page.locator('#cl-public-tournament-nav nav');
    await expect(globalNav).toHaveAttribute('aria-label', 'Principal');
    await expect(tournamentNav).toHaveAttribute('aria-label', 'Torneo');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-controls', 'cl-public-nav cl-public-tournament-nav');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(globalNav).toBeHidden();
    await expect(tournamentNav).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(globalNav).toBeVisible();
    await expect(tournamentNav).toBeVisible();
    await expect(page.locator('.cl-public-header__global-label')).toHaveText('Plataforma');
    await expect(page.locator('.cl-public-header__context-label')).toHaveText('Torneo');
    await expect(globalNav.getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect(tournamentNav.getByRole('link', { name: 'Resumen' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth),
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await expect(globalNav).toBeHidden();
    await expect(tournamentNav).toBeHidden();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(toggle).toBeHidden();
    await expect(globalNav).toBeVisible();
    await expect(tournamentNav).toBeVisible();
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing header element: ${selector}`);
        return element.getBoundingClientRect();
      };
      const row = rect('.cl-public-header__row');
      const brand = rect('.cl-public-header__brand');
      const global = rect('.cl-public-header__nav');
      const actions = rect('.cl-public-header__actions');
      const context = rect('.cl-public-header__context-band');
      return {
        rowHeight: row.height,
        primaryCenterSpread:
          Math.max(
            brand.top + brand.height / 2,
            global.top + global.height / 2,
            actions.top + actions.height / 2,
          ) -
          Math.min(
            brand.top + brand.height / 2,
            global.top + global.height / 2,
            actions.top + actions.height / 2,
          ),
        primaryBottom: row.bottom,
        contextTop: context.top,
      };
    });
    expect(geometry.rowHeight).toBeLessThan(80);
    expect(geometry.primaryCenterSpread).toBeLessThan(1);
    expect(geometry.contextTop).toBeGreaterThanOrEqual(geometry.primaryBottom);
  });

  test('the public light theme follows the device, persists selection, and passes contrast checks', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/es');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      cssColor(resolveSemantic('surface-base', 'light')),
    );

    const themePicker = page.locator('[data-public-theme-picker]');
    await expect(themePicker).toBeVisible();
    await themePicker.locator('summary').click();
    await themePicker.getByRole('button', { name: 'Claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('cl-theme'))).toBe('light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      cssColor(resolveSemantic('surface-base', 'light')),
    );
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    expect(violations).toEqual([]);
  });

  test('TV layouts remain dark when the device prefers light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/tv?bg=neutral');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      cssColor(resolveSemantic('surface-base')),
    );
  });

  test('8.1: from a /es/ tournament page, brand link navigates to /es/ root', async ({ page }) => {
    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await expect(page.locator('a.cl-logo')).toHaveAttribute('href', '/es/');

    await page.locator('a.cl-logo').click();
    await page.waitForURL('**/es/**');
    expect(page.url()).toMatch(/\/es\/?$/);
  });

  test('8.1 (baseline): from an unprefixed tournament page, brand link navigates to / root', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await expect(page.locator('a.cl-logo')).toHaveAttribute('href', '/');

    await page.locator('a.cl-logo').click();
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '');
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('the shell header renders the brand lockup, not a default-styled link', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const lockup = page.locator('a.cl-logo');
    await expect(lockup).toBeVisible();
    // Mark and wordmark are one unit.
    await expect(lockup.locator('img')).toBeVisible();
    await expect(lockup.locator('.cl-logo__wordmark')).toHaveText('CopaLibre');

    // The defect this replaces: browser-default underlined link text.
    await expect(lockup).toHaveCSS('text-decoration-line', 'none');
  });

  test('public CTAs render the shared chamfered button treatment', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}`);

    const cta = page.locator('a.cl-btn').first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveClass(/cl-chamfer--control/);
    await expect(cta).toHaveCSS('text-decoration-line', 'none');
  });

  test('8.2: 404 page resolves requested Spanish locale and renders Spanish copy with link', async ({
    page,
  }) => {
    const response = await page.goto('/es/some-missing-page');
    expect(response?.status()).toBe(404);

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByText('No existe ninguna organización en esta dirección.')).toBeVisible();
    const brandLink = page.locator('a.cl-logo');
    await expect(brandLink).toHaveAttribute('href', '/es/');
  });

  test('8.2 (baseline): 404 page for unprefixed missing route renders English copy with link', async ({
    page,
  }) => {
    const response = await page.goto('/some-missing-page');
    expect(response?.status()).toBe(404);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('No organization exists at this address.')).toBeVisible();
    const brandLink = page.locator('a.cl-logo');
    await expect(brandLink).toHaveAttribute('href', '/');
  });

  test('8.2 (fallback): static 404 template renders not-found markup with return home link', async ({
    page,
  }) => {
    await page.goto('/404');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#static-not-found h1')).toHaveText('Page not found');
    await expect(page.getByRole('link', { name: 'Return to tournaments' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
