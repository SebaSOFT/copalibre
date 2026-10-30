import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';
import { expectNoVisibleIdentifiers } from './support/visible-identifiers.js';

/**
 * Organization dashboard layout: summary-tile grid, page gutters, scope rail,
 * and mobile scrolling.
 */

const ORG_ALIAS = 'liga-mendocina';
const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 375, height: 667 } as const;
const REVIEW_VIEWPORTS = [
  ['mobile', MOBILE],
  ['desktop', DESKTOP],
] as const;

/** Enough tournaments and activity that the mobile page is taller than its viewport. */
const TOURNAMENT_COUNT = 6;
const AUDIT_RECORD_COUNT = 10;

async function setupMockApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint, orgAlias, tournamentCount, auditRecordCount }) => {
      const tournaments = Array.from({ length: tournamentCount }, (_, index) => ({
        tournamentId: `t-${index + 1}`,
        organizationId: 'org-1',
        alias: `torneo-${index + 1}`,
        name: `Torneo Apertura ${index + 1}`,
        status: 'started',
      }));
      const auditRecords = Array.from({ length: auditRecordCount }, (_, index) => ({
        auditId: `audit-${index + 1}`,
        entityType: 'match',
        entityId: `match-${index + 1}`,
        action: 'match.finalized',
        actor: `user:referee-${index + 1}`,
        authorizationContext: 'copalibre.control',
        occurredAt: new Date(Date.now() - (index + 1) * 60_000).toISOString(),
        outcome: 'applied',
        organizationId: 'org-1',
      }));

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === '/organizations?mine=true' && method === 'GET') {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias: orgAlias,
              organizationName: 'Liga Mendocina',
              role: 'admin',
            },
          ]);
        }
        if (url === `/organizations/${orgAlias}/tournaments` && method === 'GET') {
          return Response.json(tournaments);
        }
        const tournamentSettingsPrefix = `/organizations/${orgAlias}/tournaments/`;
        if (
          method === 'GET' &&
          url.startsWith(tournamentSettingsPrefix) &&
          url.endsWith('/settings')
        ) {
          const alias = url.slice(tournamentSettingsPrefix.length, -'/settings'.length);
          const tournament = tournaments.find((one) => one.alias === alias);
          return Response.json({ name: tournament?.name ?? alias });
        }
        if (url.includes(`/organizations/${orgAlias}/audit-trail`) && method === 'GET') {
          return Response.json({
            records: auditRecords,
            total: auditRecords.length,
            limit: 10,
            offset: 0,
          });
        }
        if (url.includes('/exports/') || url.endsWith('/export')) {
          (window as unknown as { __exports?: string[] }).__exports ??= [];
          (window as unknown as { __exports: string[] }).__exports.push(url);
          return new Response('alias,name\nclub,Club\n');
        }
        if (url.includes('/registrations') || url.includes('/display-tokens')) {
          return Response.json([]);
        }
        if (url === '/disciplines' && method === 'GET') {
          return Response.json([
            {
              descriptorId: 'football.default',
              version: '1.0.0',
              name: 'Futbol',
              supportedFormats: ['round-robin'],
            },
          ]);
        }
        if (url === `/organizations/${orgAlias}/tournaments/custom-script-vocabulary`) {
          return Response.json({ hooks: [], entries: [] });
        }
        if (url === `/events/control/${orgAlias}`) {
          return new Response('', { status: 403 });
        }
        return Response.json([]);
      };
    },
    {
      tokenEndpoint: TOKEN_ENDPOINT,
      orgAlias: ORG_ALIAS,
      tournamentCount: TOURNAMENT_COUNT,
      auditRecordCount: AUDIT_RECORD_COUNT,
    },
  );
}

async function openDashboard(page: Page, language: 'es' | 'de' = 'es'): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('copalibre.language', value), language);
  await setupMockApi(page);
  const target = `/control/${ORG_ALIAS}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByTestId('activeTournaments')).toBeVisible();
  await expectNoVisibleIdentifiers(page, [
    ORG_ALIAS,
    ...Array.from({ length: TOURNAMENT_COUNT }, (_, index) => `torneo-${index + 1}`),
  ]);
  // `TYPOGRAPHY` loads Barlow/Barlow Condensed from Google Fonts with
  // `display=swap` (packages/design-tokens/src/primitives.ts): text renders
  // in the fallback stack first, then reflows once the real font swaps in.
  // Several tests in this file measure flex-wrap boundaries (row counts at a
  // specific viewport width), which is exactly what that reflow can tip over —
  // waiting here, once, keeps every layout assertion below from racing it.
  await page.evaluate(() => document.fonts.ready);
}

test('summary tiles sit in a row on desktop, stack on mobile, and keep a page gutter @visible-identifier-lint', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openDashboard(page);

  const tiles = page.locator('.cl-stat-tile');
  await expect(tiles).toHaveCount(2);

  const desktopBoxes = await tiles.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()).map(({ x, y }) => ({ x, y })),
  );
  // One row: every tile shares a top edge and each starts to the right of the last.
  expect(new Set(desktopBoxes.map((box) => box.y)).size).toBe(1);
  expect(desktopBoxes.map((box) => box.x)).toEqual(
    [...desktopBoxes.map((box) => box.x)].sort((a, b) => a - b),
  );
  expect(new Set(desktopBoxes.map((box) => box.x)).size).toBe(2);

  const desktopGutter = await page.evaluate(() => {
    const main = document.querySelector('main');
    const tile = document.querySelector('.cl-stat-tile');
    if (!main || !tile) return 0;
    return tile.getBoundingClientRect().left - main.getBoundingClientRect().left;
  });
  expect(desktopGutter).toBeGreaterThan(0);

  await page.setViewportSize(MOBILE);
  const mobileBoxes = await tiles.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()).map(({ x, y }) => ({ x, y })),
  );
  // One column: every tile shares a left edge and each sits below the last.
  expect(new Set(mobileBoxes.map((box) => box.x)).size).toBe(1);
  expect(new Set(mobileBoxes.map((box) => box.y)).size).toBe(2);

  const mobileGutter = await page.evaluate(() => {
    const main = document.querySelector('main');
    const tile = document.querySelector('.cl-stat-tile');
    if (!main || !tile) return 0;
    return tile.getBoundingClientRect().left - main.getBoundingClientRect().left;
  });
  expect(mobileGutter).toBeGreaterThan(0);
});

test('the dashboard scrolls to its last section at a mobile viewport', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await openDashboard(page);

  await expect(page.locator('.cl-control__mobile-header')).toBeVisible();
  await expect(page.locator('.cl-control__nav')).toBeHidden();

  const scroll = await page.evaluate(() => {
    const element = document.scrollingElement ?? document.documentElement;
    return { height: element.scrollHeight, viewport: element.clientHeight };
  });
  expect(scroll.height).toBeGreaterThan(scroll.viewport);

  const activityFeed = page.locator('.cl-activity-feed');
  await activityFeed.scrollIntoViewIfNeeded();
  await expect(activityFeed).toBeInViewport();

  const scrolled = await page.evaluate(
    () => (document.scrollingElement ?? document.documentElement).scrollTop,
  );
  expect(scrolled).toBeGreaterThan(0);
});

test('the list and TV rail stack below the container width threshold', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openDashboard(page);

  const template = page.locator('.cl-list-with-rail-template');
  const listing = page.locator('.cl-list-with-rail-template__list');
  const rail = page.locator('.cl-list-with-rail-template__rail');
  const placeTemplate = (width: number) =>
    template.evaluate((element, nextWidth) => {
      (element as HTMLElement).style.width = `${nextWidth}px`;
    }, width);

  await placeTemplate(1000);
  const stacked = await Promise.all([
    listing.evaluate((element) => element.getBoundingClientRect().top),
    rail.evaluate((element) => element.getBoundingClientRect().top),
  ]);
  expect(stacked[1]).toBeGreaterThan(stacked[0]);

  await placeTemplate(1024);
  const columns = await Promise.all([
    listing.evaluate((element) => element.getBoundingClientRect()),
    rail.evaluate((element) => element.getBoundingClientRect()),
  ]);
  expect(columns[0].y).toBe(columns[1].y);
  expect(columns[1].x).toBeGreaterThan(columns[0].x);
});

for (const language of ['es', 'de'] as const) {
  for (const [viewportName, viewport] of REVIEW_VIEWPORTS) {
    test(`dashboard has no horizontal overflow and passes axe in ${language} at ${viewportName}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openDashboard(page, language);

      await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
        'text-transform',
        'uppercase',
      );

      const scrollWidth = await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      );
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width);

      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map(({ id, impact, nodes }) => ({
          id,
          impact,
          targets: nodes.map(({ target }) => target),
        })),
      ).toEqual([]);
    });
  }

  test(`dashboard filter search keeps its own row at tablet width in ${language}`, async ({
    page,
  }) => {
    const tablet = { width: 768, height: 900 };
    await page.setViewportSize(tablet);
    await openDashboard(page, language);

    const filterBar = page.locator('.cl-filter-bar');
    const search = page.locator('.cl-filter-bar > .cl-form-field');
    const filters = page.locator('.cl-filter-bar__filters');
    const resultCount = page.locator('.cl-filter-bar__result-count');
    const [barBox, searchBox, filtersBox, countBox] = await Promise.all([
      filterBar.boundingBox(),
      search.boundingBox(),
      filters.boundingBox(),
      resultCount.boundingBox(),
    ]);

    expect(barBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(filtersBox).not.toBeNull();
    expect(countBox).not.toBeNull();
    if (!barBox || !searchBox || !filtersBox || !countBox) {
      throw new Error('Dashboard filter controls must have measurable bounds');
    }
    expect(searchBox.width).toBeGreaterThanOrEqual(barBox.width * 0.95);
    expect(filtersBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height);
    expect(countBox.x).toBeGreaterThanOrEqual(filtersBox.x + filtersBox.width);
    expect(
      Math.abs(countBox.y + countBox.height - (filtersBox.y + filtersBox.height)),
    ).toBeLessThanOrEqual(1);

    const scrollWidth = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    );
    expect(scrollWidth).toBeLessThanOrEqual(tablet.width);
  });
}

test('the active dashboard filter reads as a cyan well', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openDashboard(page);

  const activeFilter = page.locator('.cl-filter-bar__option[aria-pressed="true"]');
  const primaryAction = page.locator('.cl-control__nav .cl-btn--primary').first();
  await expect(activeFilter).toHaveCount(1);
  await expect(activeFilter).toHaveClass(/cl-btn--secondary/);
  const [filterColors, actionColors] = await Promise.all([
    activeFilter.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    }),
    primaryAction.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    }),
  ]);
  expect(filterColors.background).not.toBe(actionColors.background);
  expect(filterColors.color).not.toBe(actionColors.color);
});

/**
 * The tournament section.
 *
 * Its cards used to be a hand-rolled article with the exports sitting beside it
 * in a `<p>` styled as a flex row — five equal-weight buttons that at 375px
 * wrapped into four ragged rows per tournament, pushing the rest of the
 * dashboard a full screen down.
 */
test('the section is titled, its cards share rows on desktop and stack on mobile', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openDashboard(page);

  // A visible heading, as the activity feed and the device panel already have.
  await expect(page.getByRole('heading', { level: 2, name: 'Torneos' })).toBeVisible();

  const cards = page.locator('.cl-entity-card-grid > .cl-card');
  await expect(cards).toHaveCount(TOURNAMENT_COUNT);

  const desktopRows = await cards.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().y)),
  );
  // More than one card per row: fewer distinct top edges than there are cards.
  expect(new Set(desktopRows).size).toBeLessThan(TOURNAMENT_COUNT);

  await page.setViewportSize(MOBILE);
  const mobileRows = await cards.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().y)),
  );
  expect(new Set(mobileRows).size).toBe(TOURNAMENT_COUNT);
});

test('tournament actions stay within two rows at 375px with public and TV shortcuts', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await openDashboard(page);

  const footer = page.locator('.cl-entity-card-actions').first();
  await expect(footer).toBeVisible();

  const rows = await footer.evaluate((element) => {
    const tops = [...element.children].map((child) =>
      Math.round(child.getBoundingClientRect().top),
    );
    return new Set(tops).size;
  });
  expect(rows).toBeLessThanOrEqual(2);

  await expect(footer.getByRole('link', { name: 'Público' })).toHaveAttribute(
    'href',
    '/liga-mendocina/tournaments/torneo-1',
  );
  await expect(footer.getByRole('link', { name: 'Pantalla TV' })).toHaveAttribute(
    'href',
    '/tv/liga-mendocina/tournaments/torneo-1',
  );

  // And the exports are not buttons of their own any more.
  await expect(page.getByRole('button', { name: 'Participantes CSV' })).toHaveCount(0);
});

test('the export menu works from the keyboard and gives focus back to its trigger', async ({
  page,
}) => {
  await openDashboard(page);

  const trigger = page.getByRole('button', { name: 'Más acciones' }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();

  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');

  const columnsDialog = page.getByRole('dialog');
  await expect(columnsDialog).toBeVisible();
  await expect(columnsDialog.getByRole('checkbox').nth(0)).toBeChecked();
  await expect(columnsDialog.getByRole('checkbox').nth(1)).not.toBeChecked();
  const download = columnsDialog.getByRole('button').last();
  await download.focus();
  await page.keyboard.press('Enter');

  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __exports?: string[] }).__exports ?? []),
    )
    .not.toHaveLength(0);
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the rail follows organization and tournament scope as navigation changes', async ({
  page,
}) => {
  await openDashboard(page);

  const organizationScope = page.locator('.cl-context-rail-header[data-scope="organization"]');
  await expect(organizationScope).toBeVisible();
  await expect(organizationScope.getByText('Liga Mendocina')).toBeVisible();

  await page.getByRole('link', { name: 'Torneo Apertura 1' }).click();

  await page.waitForURL(`**/control/${ORG_ALIAS}/tournaments/torneo-1/matches-view`);
  expect(new URL(page.url()).pathname).toBe(
    `/control/${ORG_ALIAS}/tournaments/torneo-1/matches-view`,
  );
  const tournamentScope = page.locator('.cl-context-rail-header[data-scope="tournament"]');
  await expect(tournamentScope).toBeVisible();
  await expect(tournamentScope.getByText('Torneo Apertura 1')).toBeVisible();
});

test('clicking "Crear torneo" from the dashboard arrives at the tournament setup wizard', async ({
  page,
}) => {
  await openDashboard(page);

  await page.getByRole('link', { name: 'Crear torneo' }).click();

  await page.waitForURL(`**/control/${ORG_ALIAS}/tournaments/new`);
  expect(new URL(page.url()).pathname).toBe(`/control/${ORG_ALIAS}/tournaments/new`);
  await expect(page.getByLabel('Nombre')).toBeVisible();
});
