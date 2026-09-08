import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Organization dashboard layout: summary-tile grid, page gutters, and mobile
 * scrolling (openspec 0203, tasks 4.1 and 4.2).
 */

const ORG_ALIAS = 'liga-mendocina';
const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 375, height: 667 } as const;

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
        status: 'in_progress',
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

async function openDashboard(page: Page): Promise<void> {
  await setupMockApi(page);
  const target = `/control/${ORG_ALIAS}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByTestId('activeTournaments')).toBeVisible();
}

test('4.1: summary tiles sit in a row on desktop, stack on mobile, and keep a page gutter', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openDashboard(page);

  const tiles = page.locator('.cl-stat-tile');
  await expect(tiles).toHaveCount(3);

  const desktopBoxes = await tiles.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()).map(({ x, y }) => ({ x, y })),
  );
  // One row: every tile shares a top edge and each starts to the right of the last.
  expect(new Set(desktopBoxes.map((box) => box.y)).size).toBe(1);
  expect(desktopBoxes.map((box) => box.x)).toEqual(
    [...desktopBoxes.map((box) => box.x)].sort((a, b) => a - b),
  );
  expect(new Set(desktopBoxes.map((box) => box.x)).size).toBe(3);

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
  expect(new Set(mobileBoxes.map((box) => box.y)).size).toBe(3);

  const mobileGutter = await page.evaluate(() => {
    const main = document.querySelector('main');
    const tile = document.querySelector('.cl-stat-tile');
    if (!main || !tile) return 0;
    return tile.getBoundingClientRect().left - main.getBoundingClientRect().left;
  });
  expect(mobileGutter).toBeGreaterThan(0);
});

test('4.2: the dashboard scrolls to its last section at a mobile viewport', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await openDashboard(page);

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

/**
 * The tournament section (openspec 0211).
 *
 * Its cards used to be a hand-rolled article with the exports sitting beside it
 * in a `<p>` styled as a flex row — five equal-weight buttons that at 375px
 * wrapped into four ragged rows per tournament, pushing the rest of the
 * dashboard a full screen down.
 */
test('0211: the section is titled, its cards share rows on desktop and stack on mobile', async ({
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

test('0211: a card’s actions stay one row at 375px rather than a stack of export buttons', async ({
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
  expect(rows).toBe(1);

  // And the exports are not buttons of their own any more.
  await expect(page.getByRole('button', { name: 'Participantes CSV' })).toHaveCount(0);
});

test('0211: the export menu works from the keyboard and gives focus back to its trigger', async ({
  page,
}) => {
  await openDashboard(page);

  const trigger = page.getByRole('button', { name: 'Exportar' }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __exports?: string[] }).__exports ?? []),
    )
    .not.toHaveLength(0);
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('0211: a card title opens that tournament’s matches view', async ({ page }) => {
  await openDashboard(page);

  await page.getByRole('link', { name: 'Torneo Apertura 1' }).click();

  await page.waitForURL(`**/control/${ORG_ALIAS}/tournaments/torneo-1/matches-view`);
  expect(new URL(page.url()).pathname).toBe(
    `/control/${ORG_ALIAS}/tournaments/torneo-1/matches-view`,
  );
});
