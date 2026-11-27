import { expect, test } from './fixtures.js';
import type { Server } from 'node:http';
import {
  ONE_PIXEL_PNG_BASE64,
  ORGANIZATION,
  PLAYER_PROFILE_PATH,
  TOURNAMENT,
  TOURNAMENT_ALIAS,
  createStandingsApiServer,
  disciplineDrilldownStatisticsFixture,
  groupStandingsFixture,
  playerProfileFixture,
  playerProfileFixtureNoStats,
  topScorersStatisticsFixture,
} from './standings-and-rankings.fixtures.js';

test.describe('B2: public tournament page', () => {
  let apiServer: Server;
  const groupStandingsResponse: object = groupStandingsFixture;

  test.beforeAll(async ({ workerPort }) => {
    apiServer = createStandingsApiServer(() => groupStandingsResponse);
    await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  });

  test('opens player career popup on leaderboard player click and allows standalone navigation', async ({
    page,
  }) => {
    // The `<img>` tag's own GET goes through the network stack, not any
    // in-page fetch mock — this stands in for the real photo-serving route
    // A real photo renders framed on the public page.
    await page.route(
      `**/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/persons/p-1/photo`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
        }),
    );

    // The preview server has no proxy, so the browser's call to the API is answered here.
    const profileRequests: string[] = [];
    await page.route(PLAYER_PROFILE_PATH, (route) => {
      profileRequests.push(new URL(route.request().url()).pathname);
      return route.fulfill({ json: playerProfileFixture });
    });

    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="top-scorers"]').click();
    await expect(page).toHaveURL(/tab=top-scorers/);

    const playerLink = page.getByRole('link', { name: 'Goleador Uno' });
    await expect(playerLink).toBeVisible();

    // Click player name to open modal popup
    await playerLink.click();
    const dialog = page.locator('#cl-player-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('AR', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Age: 28')).toBeVisible();
    await expect(dialog.getByText('Career Statistics')).toBeVisible();
    await expect(dialog.getByText('Competition History')).toBeVisible();
    expect(profileRequests).toEqual([
      `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/persons/p-1/public/profile`,
    ]);

    // Close modal
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(dialog).not.toBeVisible();

    // Direct standalone URL navigation
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-1`);
    await expect(page.getByRole('heading', { name: 'Goleador Uno' })).toBeVisible();
    await expect(page.getByText('Age: 28')).toBeVisible();
    await expect(page.locator('.cl-image-frame img')).toBeVisible();
  });

  test('the player dialog shows a stored name as text and never runs it', async ({ page }) => {
    const storedName = 'Casa de Italia <img src=x onerror=window.__storedNameRan=true>';
    await page.route(PLAYER_PROFILE_PATH, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          displayName: 'Goleador Uno',
          competitionHistory: [{ tournamentName: 'Copa', teamName: storedName, role: 'player' }],
        }),
      }),
    );

    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="top-scorers"]').click();
    await page.getByRole('link', { name: 'Goleador Uno' }).click();

    const dialog = page.locator('#cl-player-dialog');
    await expect(dialog.getByRole('cell', { name: storedName })).toBeVisible();
    await expect(dialog.locator('#cl-player-dialog-body img')).toHaveCount(0);
    const ran = await page.evaluate(
      () => (window as unknown as { __storedNameRan?: boolean }).__storedNameRan,
    );
    expect(ran).toBeUndefined();
  });

  test('the standings CSV link is a path on the app origin that serves the file', async ({
    page,
  }) => {
    const csvPath = `${TOURNAMENT}/public/tables/top-scorers/csv`;
    await page.route(`**${csvPath}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        body: 'player,goals,cards\nGoleador Uno,9,4/5\n',
      }),
    );

    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="top-scorers"]').click();

    await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', csvPath);
    const response = await page.evaluate(async (href) => {
      const reply = await fetch(href);
      return { status: reply.status, type: reply.headers.get('content-type') ?? '' };
    }, csvPath);
    expect(response.status).toBe(200);
    expect(response.type).toContain('text/csv');
  });

  test('the player dialog on a Spanish page shows Spanish statistic labels and role', async ({
    page,
  }) => {
    await page.route(PLAYER_PROFILE_PATH, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          displayName: 'Goleador Uno',
          careerStatistics: [
            {
              statistics: [
                { label: 'Goals', localizedLabel: { en: 'Goals', es: 'Goles' }, value: 10 },
              ],
            },
          ],
          competitionHistory: [{ tournamentName: 'Copa', teamName: 'Talleres', role: 'player' }],
        }),
      }),
    );

    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="top-scorers"]').click();
    await page.getByRole('link', { name: 'Goleador Uno' }).click();

    const dialog = page.locator('#cl-player-dialog');
    await expect(dialog.locator('.cl-stat-label')).toHaveText('Goles');
    await expect(dialog.getByRole('cell', { name: 'Jugador' })).toBeVisible();
  });

  test('shows tournament-total and match-by-match statistics, excluding composite columns from match rows, and switches declared layouts', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-1`);

    const statsSection = page.getByRole('heading', { name: 'Tournament Statistics' }).locator('..');

    // Tournament total: every declared column, composite included.
    await expect(statsSection.getByText('Y/R Cards')).toBeVisible();
    await expect(statsSection.getByText('4/5')).toBeVisible();

    // Match-by-match table: only the collector-kind `goals` column, one row
    // per finalized match — never the composite `cards`/"Y/R Cards" column.
    const matchTable = statsSection.getByRole('table').nth(1);
    await expect(matchTable.getByRole('columnheader', { name: 'Goals' })).toBeVisible();
    await expect(matchTable.getByRole('columnheader', { name: 'Y/R Cards' })).not.toBeVisible();
    await expect(matchTable.getByRole('cell', { name: '5', exact: true })).toBeVisible();
    await expect(matchTable.getByRole('cell', { name: '4', exact: true })).toBeVisible();

    // Switching the selector to another declared layout updates the URL and
    // renders that layout's own columns, without mixing in the previous
    // layout's values. "Assists" is a collector-kind stat, so it legitimately
    // appears as a column header in both the tournament-total and
    // match-by-match tables — scope to the total table specifically
    // rather than the ambiguous whole-section text match.
    await page.getByRole('tab', { name: 'Discipline Drilldown' }).click();
    await page.waitForURL(/\?layout=discipline-drilldown/);
    const totalTable = statsSection.getByRole('table').nth(0);
    await expect(totalTable.getByRole('columnheader', { name: 'Assists' })).toBeVisible();
    await expect(totalTable.getByRole('cell', { name: '3', exact: true })).toBeVisible();
    await expect(statsSection.getByText('Y/R Cards')).not.toBeVisible();
  });

  test('states an absence, not zeroes, for a player with no roster history', async ({ page }) => {
    await page.route(`**${TOURNAMENT}/persons/p-2/public/profile`, (route) =>
      route.fulfill({ json: playerProfileFixtureNoStats }),
    );

    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="top-scorers"]').click();
    await expect(page).toHaveURL(/tab=top-scorers/);
    const playerLink = page.getByRole('link', { name: 'Goleador Dos' });
    await expect(playerLink).toBeVisible();

    await playerLink.click();
    const dialog = page.locator('#cl-player-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Career Statistics', { exact: true })).toBeVisible();
    await expect(dialog.getByText('No career statistics recorded.')).toBeVisible();
    await expect(dialog.getByText('Competition History', { exact: true })).toBeVisible();
    await expect(dialog.getByText('No competition history recorded.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog' }).click();

    // The standalone profile page states the same absence (PlayerProfileView.astro
    // already did — this confirms it still does).
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-2`);
    await expect(page.getByRole('heading', { name: 'Goleador Dos' })).toBeVisible();
    await expect(page.getByText('No career statistics recorded.')).toBeVisible();
    await expect(page.getByText('No competition history recorded.')).toBeVisible();
    // No inferred tournament-total or zero-valued match rows either.
    await expect(
      page.getByText('No tournament statistics recorded for this player.'),
    ).toBeVisible();

    // No photo was uploaded for this player: the frame
    // renders the placeholder, not a broken image or an empty gap.
    await expect(page.getByRole('img', { name: 'No photo uploaded' })).toBeVisible();
  });

  test('player profile shows header club and shirt number, next-match card, match links, and zero-valued career statistics', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-1`);

    const headerMeta = page.locator('.cl-player-profile__meta');
    await expect(headerMeta.getByText('Club: Talleres (TAL)', { exact: true })).toBeVisible();
    await expect(headerMeta.getByText('#3', { exact: true })).toBeVisible();

    // Next-match card displays opponent, date/time, venue, and links to the match report.
    const nextMatchCard = page.locator('.cl-player-profile__next-match');
    await expect(nextMatchCard).toBeVisible();
    await expect(
      nextMatchCard.getByRole('heading', { name: 'Next match', exact: true }),
    ).toBeVisible();
    await expect(nextMatchCard.locator('time[datetime="2026-01-02T18:00:00.000Z"]')).toBeVisible();
    await expect(nextMatchCard.getByText('Estadio Central', { exact: true })).toBeVisible();
    const nextMatchLink = nextMatchCard.getByRole('link', { name: 'Independiente', exact: true });
    await expect(nextMatchLink).toHaveAttribute(
      'href',
      `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/2`,
    );

    // Zero-valued declared career stat stays visible alongside non-zero career tiles.
    const careerList = page.locator('.cl-player-profile__stat-list');
    await expect(careerList.getByText('Career goals', { exact: true })).toBeVisible();
    await expect(careerList.getByText('9', { exact: true })).toBeVisible();
    await expect(careerList.getByText('Career assists', { exact: true })).toBeVisible();
    await expect(careerList.getByText('0', { exact: true })).toBeVisible();

    // Match-by-match rows show date, opponent, score, and link directly to the match report.
    const statsSection = page.getByRole('heading', { name: 'Tournament Statistics' }).locator('..');
    const matchTable = statsSection.getByRole('table').nth(1);
    const firstMatchLink = matchTable.locator(`a[href$="/stages/1/matches/1"]`);
    const secondMatchLink = matchTable.locator(`a[href$="/stages/1/matches/2"]`);
    await expect(firstMatchLink).toContainText('Independiente');
    await expect(firstMatchLink).toContainText('2–1');
    await expect(secondMatchLink).toContainText('San Martín');
    await expect(secondMatchLink).toContainText('4–3');

    await firstMatchLink.click();
    await page.waitForURL(`**/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/1`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Talleres vs Independiente' }),
    ).toBeVisible();

    // Follow the next-match link on a fresh visit to verify it lands on match 2.
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-1`);
    await page.locator('.cl-player-profile__next-match a').click();
    await page.waitForURL(`**/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/2`);

    // A player without a shirt number or upcoming match omits both cleanly, while
    // keeping a zero-valued career statistic visible in Spanish too.
    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-3`);
    const p3Meta = page.locator('.cl-player-profile__meta');
    await expect(p3Meta.getByText('Club: San Martín (SMT)', { exact: true })).toBeVisible();
    await expect(p3Meta).not.toContainText('#');
    await expect(page.locator('.cl-player-profile__next-match')).toHaveCount(0);
    await expect(page.locator('#player-next-match-heading')).toHaveCount(0);

    const p3CareerList = page.locator('.cl-player-profile__stat-list');
    await expect(p3CareerList.getByText('Goles', { exact: true })).toBeVisible();
    await expect(p3CareerList.getByText('0', { exact: true })).toBeVisible();
    await expect(p3CareerList.getByText('Asistencias', { exact: true })).toBeVisible();
    await expect(p3CareerList.getByText('4', { exact: true })).toBeVisible();
  });

  test('player dialog shows club, shirt number, tournament totals, and Ver perfil link preserving layout', async ({
    page,
  }) => {
    await page.route(PLAYER_PROFILE_PATH, (route) => route.fulfill({ json: playerProfileFixture }));
    await page.route(`**${TOURNAMENT}/persons/p-1/public/statistics*`, (route) => {
      const url = new URL(route.request().url());
      const layout = url.searchParams.get('layout');
      if (layout === 'discipline-drilldown') {
        return route.fulfill({ json: disciplineDrilldownStatisticsFixture });
      }
      return route.fulfill({ json: topScorersStatisticsFixture });
    });

    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}?tab=discipline-drilldown`);
    await page.getByRole('link', { name: 'Goleador Uno' }).click();

    const dialog = page.locator('#cl-player-dialog');
    await expect(dialog).toBeVisible();
    const meta = dialog.locator('.cl-modal-meta');
    await expect(meta.getByText('Club: Talleres (TAL)', { exact: true })).toBeVisible();
    await expect(meta.getByText('#3', { exact: true })).toBeVisible();
    await expect(dialog.locator('.cl-modal-tournament-totals__line')).toHaveText('Assists: 3');

    const viewProfileLink = dialog.locator('.cl-player-dialog__profile-link');
    await expect(viewProfileLink).toHaveText('Ver perfil');
    await expect(viewProfileLink).toHaveAttribute(
      'href',
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-1?layout=discipline-drilldown`,
    );

    await viewProfileLink.click();
    await page.waitForURL(
      `**/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-1?layout=discipline-drilldown`,
    );
    await expect(page.getByRole('tab', { name: 'Discipline Drilldown' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('player search filters case- and accent-insensitively with scripts off and in place with scripts on while preserving ranks', async ({
    browser,
    page,
  }) => {
    // 1. JavaScript disabled: GET form submission reloads with ?q=leon and preserves rank 3.
    const noScriptContext = await browser.newContext({ javaScriptEnabled: false });
    const noScriptPage = await noScriptContext.newPage();
    await noScriptPage.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}?tab=top-scorers`);

    const noScriptForm = noScriptPage.locator('form[data-table-search-form]');
    await noScriptForm.locator('input[data-table-search-input]').fill('leon');
    await noScriptForm.locator('button[type="submit"]').click();

    await noScriptPage.waitForURL((url) => url.searchParams.get('q') === 'leon');
    expect(new URL(noScriptPage.url()).searchParams.get('tab')).toBe('top-scorers');
    const noScriptRows = noScriptPage.locator('#standings tbody tr');
    await expect(noScriptRows).toHaveCount(1);
    await expect(noScriptRows.first()).toContainText('León Vega');
    await expect(noScriptRows.first().locator('td').first()).toHaveText('3');
    await expect(noScriptPage.getByRole('cell', { name: 'Goleador Uno' })).toHaveCount(0);
    await noScriptContext.close();

    // 2. JavaScript enabled: typing filters in place without reload, preserves rank, updates ?q=.
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}?tab=top-scorers`);
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
    });

    const input = page.locator('input[data-table-search-input]');
    await input.fill('leon');

    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('leon');
    expect(
      await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
    ).toBe(true);

    const visibleRows = page.locator('#standings tbody tr:not([hidden])');
    await expect(visibleRows).toHaveCount(1);
    await expect(visibleRows.first()).toContainText('León Vega');
    await expect(visibleRows.first().locator('td').first()).toHaveText('3');

    await input.fill('');
    await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false);
    await expect(page.locator('#standings tbody tr:not([hidden])')).toHaveCount(3);
  });

  test('person-granularity table places shirt number before player name, shows sort indicators, and renders zero-denominator fractions cleanly', async ({
    page,
  }) => {
    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}?tab=top-scorers`);

    const table = page.locator('#standings table[data-sortable-table]');
    const headers = table.locator('thead th');
    const headerTexts = await headers.allTextContents();
    const cleanedHeaders = headerTexts.map((text) => text.trim());
    const numberIndex = cleanedHeaders.indexOf('N.º');
    const playerIndex = cleanedHeaders.indexOf('Player');
    expect(numberIndex).toBeGreaterThan(-1);
    expect(playerIndex).toBe(numberIndex + 1);

    // Rank column starts ascending with a visible sort indicator.
    const rankTh = headers.nth(0);
    await expect(rankTh).toHaveAttribute('aria-sort', 'ascending');
    await expect(rankTh.locator('.cl-sort-indicator')).toBeVisible();
    await expect(rankTh.locator('.cl-sort-indicator')).toHaveCSS('opacity', '1');

    const goalsTh = headers.filter({ hasText: 'Goals' });
    await expect(goalsTh).toHaveAttribute('aria-sort', 'none');
    await expect(goalsTh.locator('.cl-sort-indicator')).toHaveCSS('opacity', '0.4');

    // Click Goals twice: ascending, then descending.
    const goalsButton = goalsTh.locator('[data-table-sort-button]');
    await goalsButton.click();
    await expect(goalsTh).toHaveAttribute('aria-sort', 'ascending');
    await expect(rankTh).toHaveAttribute('aria-sort', 'none');

    await goalsButton.click();
    await expect(goalsTh).toHaveAttribute('aria-sort', 'descending');
    await expect(rankTh).toHaveAttribute('aria-sort', 'none');
    await expect(goalsTh.locator('.cl-sort-indicator')).toHaveCSS('opacity', '1');
    await expect(rankTh.locator('.cl-sort-indicator')).toHaveCSS('opacity', '0.4');

    const goalsIndex = cleanedHeaders.indexOf('Goals');
    const goalsOrder = await table
      .locator('tbody tr')
      .evaluateAll(
        (rows, idx) => rows.map((row) => row.querySelectorAll('td').item(idx)?.textContent?.trim()),
        goalsIndex,
      );
    expect(goalsOrder).toEqual(['9', '5', '2']);

    // Zero-denominator fraction renders cleanly without "0/0".
    const leonRow = table.locator('tbody tr', { hasText: 'León Vega' });
    await expect(leonRow).toContainText('—');
    await expect(table).not.toContainText('0/0');

    // English locale uses "No." before the player name.
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}?tab=top-scorers`);
    const enHeaders = await page
      .locator('#standings table[data-sortable-table] thead th')
      .allTextContents();
    const enCleaned = enHeaders.map((text) => text.trim());
    const enNumberIndex = enCleaned.indexOf('No.');
    expect(enNumberIndex).toBeGreaterThan(-1);
    expect(enCleaned.indexOf('Player')).toBe(enNumberIndex + 1);
  });

  test('player profile fills data table width and renders zero or dash for every unrecorded discipline column', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-3`);
    const statsSection = page.getByRole('heading', { name: 'Tournament Statistics' }).locator('..');
    const totalTable = statsSection.getByRole('table').first();
    const cells = await totalTable.locator('tbody td').allTextContents();
    expect(cells.map((value) => value.trim())).toEqual(['4', '0', '—', '0', '-']);

    // Narrow data tables stretch both table and row grid to fill their .cl-data-table container.
    const widths = await totalTable.evaluate((el) => {
      const container = el.closest('.cl-data-table');
      const headerRow = el.querySelector('thead tr');
      return {
        tableWidth: el.getBoundingClientRect().width,
        rowWidth: headerRow ? headerRow.getBoundingClientRect().width : 0,
        containerWidth: container ? container.clientWidth : 0,
      };
    });
    expect(widths.containerWidth).toBeGreaterThan(0);
    expect(widths.tableWidth).toBeGreaterThanOrEqual(widths.containerWidth - 2);
    expect(widths.rowWidth).toBeGreaterThanOrEqual(widths.containerWidth - 2);
  });
});
