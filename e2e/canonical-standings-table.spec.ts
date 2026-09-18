import { expect, test } from './fixtures.js';
import type { Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * openspec 0248: the canonical table molecule's own behaviour on the operator
 * standings screen — compact density, a floating sticky header, tri-state
 * bidirectional column sorting with `aria-sort`, and a column description
 * tooltip. Not a pixel comparison against the reference mock
 * (`openspec/changes/0248-operator-standings-and-points-distribution/uploaded_media_1789615576845.png`):
 * a hand-built mock's font rendering never matches a real browser's, so this
 * spec asserts the structural/behavioural claims the mock and design.md make
 * instead.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `${TOURNAMENT}/stages/1`;
const TARGET = `/control/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/standings`;

const layoutsFixture = {
  layouts: [
    {
      code: 'group-standings-default',
      target: 'group-phase',
      label: 'Group Standings',
      entityGranularity: 'team',
    },
  ],
};

// `gd`'s full header ("Goal Difference") differs from its short header
// ("Dif") on purpose: only then does the description tooltip say something
// the visible label doesn't already.
const groupStandingsFixture = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  columns: [
    { code: 'name', header: 'Team', format: 'text' },
    { code: 'gf', header: 'Goals For', shortHeader: 'GF', format: 'number' },
    { code: 'gd', header: 'Goal Difference', shortHeader: 'Dif', format: 'number' },
    { code: 'pts', header: 'Points', shortHeader: 'Pts', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'pts', direction: 'desc' }],
  rows: [
    {
      actorId: 'Talleres',
      entrantId: 'Talleres',
      rank: 1,
      sharedRank: false,
      cells: {
        name: { formatted: 'Talleres' },
        gf: { raw: 12, formatted: '12' },
        gd: { raw: 9, formatted: '9' },
        pts: { raw: 15, formatted: '15' },
      },
    },
    {
      actorId: 'Independiente',
      entrantId: 'Independiente',
      rank: 2,
      sharedRank: false,
      cells: {
        name: { formatted: 'Independiente' },
        gf: { raw: 6, formatted: '6' },
        gd: { raw: 1, formatted: '1' },
        pts: { raw: 9, formatted: '9' },
      },
    },
  ],
  projectionVersion: 3,
};

async function mockControlApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tournament, stage, layouts, groupStandings, tokenEndpoint }) => {
      window.fetch = async (input) => {
        const url = String(input);
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${tournament}/tables`) return Response.json(layouts);
        if (url === `${stage}/tables/group-standings-default`) return Response.json(groupStandings);
        return new Response('Not found', { status: 404 });
      };
    },
    {
      tournament: TOURNAMENT,
      stage: STAGE,
      layouts: layoutsFixture,
      groupStandings: groupStandingsFixture,
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

async function openStandings(page: Page): Promise<void> {
  await mockControlApi(page);
  await seedLoginTransaction(page, TARGET);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${TARGET}`);
}

test.describe('canonical standings table', () => {
  test('renders compact rows and a floating sticky header', async ({ page }) => {
    await openStandings(page);
    const table = page.locator('.cl-data-table');
    await expect(table).toHaveClass(/cl-data-table--compact/);
    await expect(table).toHaveClass(/cl-data-table--sticky/);
    const stickyHeader = page.locator('.cl-data-table--sticky thead th').first();
    await expect(stickyHeader).toHaveCSS('position', 'sticky');
  });

  test('cycles a sortable column through descending, ascending, then back to none', async ({
    page,
  }) => {
    await openStandings(page);
    const header = page.getByRole('button', { name: 'GF' });
    const th = page.locator('th', { has: header });

    // The projection's own order: Talleres (12 GF) before Independiente (6 GF).
    // `:not(.cl-data-table__detail-row)` excludes the per-row expandable
    // tiebreak-trace row `StandingsTemplate` renders after every data row.
    const rowsInOrder = async (): Promise<readonly string[]> =>
      page
        .locator('.cl-data-table__table tbody > tr:not(.cl-data-table__detail-row)')
        .evaluateAll((rows) =>
          rows.map((row) => row.querySelector('td')?.nextElementSibling?.textContent?.trim() ?? ''),
        );

    await expect(th).toHaveAttribute('aria-sort', 'none');
    expect(await rowsInOrder()).toEqual(['12', '6']);

    await header.click();
    await expect(th).toHaveAttribute('aria-sort', 'descending');
    expect(await rowsInOrder()).toEqual(['12', '6']);

    await header.click();
    await expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(await rowsInOrder()).toEqual(['6', '12']);

    await header.click();
    await expect(th).toHaveAttribute('aria-sort', 'none');
    expect(await rowsInOrder()).toEqual(['12', '6']);
  });

  test('reveals a column description tooltip on hover and on keyboard focus', async ({ page }) => {
    await openStandings(page);
    const header = page.getByRole('button', { name: 'Dif' });
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    await header.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText('Goal Difference');

    // Move away, then reach it by keyboard alone.
    await page.mouse.move(0, 0);
    await header.focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
  });

  test('carries no aria-sort/tooltip wiring for a column with no description', async ({ page }) => {
    await openStandings(page);
    const teamHeader = page.getByRole('button', { name: 'Team' });
    const th = page.locator('th', { has: teamHeader });
    await expect(th).toHaveAttribute('aria-sort', 'none');
    await teamHeader.hover();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});
