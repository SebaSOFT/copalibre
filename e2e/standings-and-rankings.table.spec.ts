import { expect, test } from './fixtures.js';
import type { Server } from 'node:http';
import { expectNoBrokenWords, expectTablesFitTheirFrame } from './support/table-assertions.js';
import { expectNoSeriousSemanticViolations } from './support/semantic-axe.js';
import {
  ORGANIZATION,
  RESPONSIVE_WIDTHS,
  TOURNAMENT_ALIAS,
  createStandingsApiServer,
  footballColumns,
  groupStandingsFixture,
} from './standings-and-rankings.fixtures.js';

test.describe('B2: public tournament page', () => {
  let apiServer: Server;
  let groupStandingsResponse: object = groupStandingsFixture;

  test.beforeAll(async ({ workerPort }) => {
    apiServer = createStandingsApiServer(() => groupStandingsResponse);
    await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  });

  test('heads the shipped football columns in German', async ({ page }) => {
    groupStandingsResponse = { ...groupStandingsFixture, columns: footballColumns };
    try {
      await page.goto(`/de/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

      const table = page.locator('.cl-table').first();
      for (const header of ['Pl.', 'Mannschaft', 'Sp', 'S', 'U', 'N', 'T', 'GT', 'TD', 'Pkt']) {
        await expect(table.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
      }
      await expect(table.getByRole('columnheader', { name: 'GF', exact: true })).toHaveCount(0);
    } finally {
      groupStandingsResponse = groupStandingsFixture;
    }
  });

  test('names the column that separated teams level on points under the group table', async ({
    page,
  }) => {
    const row = (
      name: string,
      rank: number,
      points: number,
      gd: number,
      separatedFromAboveBy?: string,
    ) => ({
      actorId: name,
      actorName: name,
      entrantId: name,
      entrantName: name,
      rank,
      sharedRank: false,
      ...(separatedFromAboveBy === undefined ? {} : { separatedFromAboveBy }),
      cells: {
        name: { formatted: name },
        points: { raw: points, formatted: String(points) },
        gd: { raw: gd, formatted: String(gd) },
      },
    });
    groupStandingsResponse = {
      ...groupStandingsFixture,
      columns: [
        { code: 'name', header: { en: 'Team', es: 'Equipo' }, format: 'text' },
        { code: 'points', header: { en: 'Pts', es: 'Pts' }, format: 'number' },
        {
          code: 'gd',
          header: { en: 'Goal difference', es: 'Diferencia de gol' },
          shortHeader: { en: 'GD', es: 'Dif' },
          format: 'number',
        },
      ],
      defaultSort: [
        { columnCode: 'points', direction: 'desc' },
        { columnCode: 'gd', direction: 'desc' },
      ],
      rows: [
        row('Talleres', 1, 6, 9),
        row('Independiente', 2, 6, 6, 'gd'),
        row('Gimnasia', 3, 3, -2),
      ],
    };
    try {
      await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

      const tieBreaks = page.locator('.cl-standings-tie-breaks');
      await expect(tieBreaks).toHaveAttribute('aria-label', 'Desempates');
      await expect(tieBreaks.locator('li')).toHaveText([
        'Talleres por delante de Independiente por Diferencia de gol',
      ]);
    } finally {
      groupStandingsResponse = groupStandingsFixture;
    }
  });

  test('shows no tie-break list when every team is separated by points', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    await expect(page.getByRole('heading', { name: 'Group Standings' })).toBeVisible();
    await expect(page.locator('.cl-standings-tie-breaks')).toHaveCount(0);
  });

  test('keeps the name on a phone in German and moves the other columns into a disclosure', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto(`/de/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const table = page.locator('.cl-table--priority').first();
    await expect(table.getByRole('cell', { name: /Talleres/ })).toBeVisible();
    // GF is a low-priority column: its header and cells are out of the way on a phone…
    await expect(table.getByRole('columnheader', { name: 'GF' })).toBeHidden();

    // …and its value is one tap away in the row's disclosure.
    const row = table.getByRole('row').filter({ hasText: 'Talleres' });
    await row.locator('summary').click();
    const detail = row.locator('.cl-more__list');
    await expect(detail.getByText('GF', { exact: true })).toBeVisible();

    await expectNoBrokenWords(page, '.cl-table-scroll');
    await expectTablesFitTheirFrame(page, 'priority');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('renders the discipline’s own GF/GC/Dif/Avg columns for a spectator', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    await expect(page.getByRole('heading', { name: 'Group Standings' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'GF' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'GC' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Dif' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Avg' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Talleres' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '4.00' })).toBeVisible();
  });

  test('the standings table fills its panel, and the name column takes the spare width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await expect(page.getByRole('cell', { name: 'Talleres' })).toBeVisible();

    const widths = await page.locator('#standings').evaluate((section) => {
      const table = section.querySelector('table.cl-table');
      const fill = table?.querySelector('thead th.cl-table__fill');
      return {
        table: table?.getBoundingClientRect().width ?? 0,
        panel: table?.closest('.cl-table-scroll')?.clientWidth ?? 0,
        fill: fill?.getBoundingClientRect().width ?? 0,
        others: [...(table?.querySelectorAll('thead th:not(.cl-table__fill)') ?? [])].map(
          (th) => th.getBoundingClientRect().width,
        ),
      };
    });
    expect(widths.panel).toBeGreaterThan(0);
    expect(widths.table).toBeCloseTo(widths.panel, 0);
    for (const width of widths.others) expect(width).toBeLessThan(widths.fill);
    expect(widths.fill).toBeGreaterThan(widths.table / 2);
  });

  for (const path of [
    `/${ORGANIZATION}`,
    `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`,
    `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/live`,
    `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/players/p-1`,
    `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`,
    `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/1`,
  ]) {
    test(`${path} stays visible without page overflow at responsive reference widths`, async ({
      page,
    }) => {
      for (const width of RESPONSIVE_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.locator('main').first()).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth),
          )
          .toBe(true);
      }
    });
  }

  test('switches a constrained entrant name to its persisted abbreviation with a tooltip', async ({
    page,
  }) => {
    // A state filter asks for a list of matches rather than a bracket; this mock's stage has no format.
    await page.goto(
      `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/matches?view=cards&state=final`,
    );

    const grid = page.locator('.cl-matches-view__grid');
    const entrantName = grid.getByTestId('entrant-name').first();
    await expect(entrantName).toBeVisible({ timeout: 15_000 });
    await expect(grid.locator('astro-island').first()).not.toHaveAttribute('ssr', '', {
      timeout: 15_000,
    });
    // `flex: none` on top of the existing forced width: this span is now a real `flex: 1 1 auto` item of
    // `.cl-match-card__side` (its ownership-scanner selector fix widened
    // what it matches — the entrant name previously fell outside it
    // entirely, past the `<astro-island>` a `client:load` wrapper inserts),
    // so `flex-grow: 1` re-expands a bare inline `width` back to fill the
    // row before this test's manual resize can take effect. Overriding
    // `flex` here keeps testing EntrantName's own ResizeObserver logic in
    // isolation, the unit this test is actually about, without fighting the
    // real flex layout it now correctly participates in.
    await entrantName.evaluate((element) => {
      element.setAttribute('style', 'display: block; min-width: 0; width: 1px; flex: none');
    });

    await expect(entrantName.getByTitle('Talleres')).toHaveText('TAL');
  });

  test('renders finished match report header, officials, roster, and timeline', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/1`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Talleres vs Independiente' }),
    ).toBeVisible();
    await expect(page.locator('.cl-scoreboard__side--home .cl-team-name')).toHaveText('Talleres');
    await expect(page.locator('.cl-scoreboard__side--home .cl-team-score')).toHaveText('2');
    await expect(page.locator('.cl-scoreboard__side--away .cl-team-score')).toHaveText('1');
    await expect(page.locator('.cl-scoreboard__side--away .cl-team-name')).toHaveText(
      'Independiente',
    );
    await expect(page.getByText('Marta Referee — referee')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Sofía Gómez' })).toBeVisible();
    await expect(page.getByText('Goal')).toBeVisible();
  });

  test('renders upcoming match report empty roster and timeline states', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/2`);

    await expect(page.getByText('No officials assigned.')).toBeVisible();
    await expect(page.getByText('Rosters are not yet available.')).toBeVisible();
    await expect(page.getByText('Events are not yet available.')).toBeVisible();
  });

  test('the standings table with its club filter and legend passes the semantic accessibility rules', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="group-standings-default"]').click();
    await expect(page.locator('a[data-club-filter="all"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.cl-table-legend')).toBeVisible();

    await expectNoSeriousSemanticViolations(page);
  });

  test('a tab and a club chip change the table in place, without a reload or a scroll jump', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 320 });
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="group-standings-default"]').click();
    await expect(page).toHaveURL(/tab=group-standings-default/);
    await page.waitForFunction(() => {
      const deferredHrefs = Array.from(
        document.querySelectorAll<HTMLMetaElement>('meta[name="copalibre:deferred-stylesheet"]'),
      ).map((meta) => meta.content);
      const links = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      );
      return deferredHrefs.every((href) =>
        links.some((link) => link.getAttribute('href') === href && link.sheet !== null),
      );
    });
    await page.evaluate(async () => {
      void document.body.offsetHeight;
      await document.fonts.ready;
    });
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
      document.querySelector('.cl-standings-section')?.scrollIntoView();
    });
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled).toBeGreaterThan(0);

    await page.getByRole('tab', { name: 'Top Scorers' }).click();
    await expect(page.getByRole('cell', { name: 'Goleador Uno' })).toBeVisible();
    await expect(page).toHaveURL(/tab=top-scorers/);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

    const chip = page.getByRole('link', { name: 'Club Atlético Independiente' });
    await chip.click();
    await expect(page).toHaveURL(/club=club-independiente/);
    await expect(page.getByRole('cell', { name: 'Goleador Uno' })).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

    // Same document throughout: nothing reloaded, and the selection is still exposed.
    expect(
      await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
    ).toBe(true);
    await expect(page.getByRole('link', { name: 'Club Atlético Independiente' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Top Scorers' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('an abbreviated header explains itself on focus, and the legend lists every abbreviation', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="group-standings-default"]').click();
    await expect(page).toHaveURL(/tab=group-standings-default/);

    // `ga` declares a short header: it shows GC, its long header is the hint.
    await expect(page.getByRole('button', { name: 'GC', exact: true })).toHaveAccessibleDescription(
      'GA',
    );
    // `gf` is explained by its own description.
    await expect(page.getByRole('button', { name: 'GF', exact: true })).toHaveAccessibleDescription(
      'Goals for',
    );
    // The icon is an island: retry until it has hydrated.
    const popover = page.getByRole('dialog', { name: 'About GF' });
    await expect(async () => {
      await page.getByRole('button', { name: 'About GF' }).click();
      await expect(popover).toBeVisible({ timeout: 500 });
    }).toPass();
    await expect(popover).toHaveText('Goals for');

    const legend = page.getByRole('group', { name: 'Table abbreviations' });
    await expect(legend).toContainText('GF');
    await expect(legend).toContainText('Goals for');
    await expect(legend).toContainText('GC');
    // A header that already says everything gets no legend entry.
    await expect(legend).not.toContainText('Team');
  });

  test.describe('Column hints on a touch screen', () => {
    test.use({ hasTouch: true, viewport: { width: 768, height: 1024 } });

    test('a tap on the icon opens a column hint without sorting', async ({ page }) => {
      await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
      await page.locator('[data-full-layout-code="group-standings-default"]').click();
      await expect(page).toHaveURL(/tab=group-standings-default/);

      const icon = page.locator('th:visible .cl-popover__trigger').first();
      const header = icon.locator('xpath=ancestor::th');
      await expect(icon).toBeVisible();
      // The icon is an island: retry until it has hydrated.
      await expect(async () => {
        await icon.tap();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 500 });
      }).toPass();
      await expect(header).toHaveAttribute('aria-sort', 'none');
    });
  });

  test('club chips are compact, show the stored abbreviation, and mark selection by more than colour', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="group-standings-default"]').click();
    await expect(page).toHaveURL(/tab=group-standings-default/);

    const chip = page.locator('a[data-club-filter="club-talleres"]');
    // No emblem uploaded in this fixture: the stored abbreviation stands in.
    await expect(chip.locator('.cl-entrant-emblem__monogram')).toHaveText('TAL');

    const emblem = chip.locator('.cl-entrant-emblem--small').first();
    await expect(emblem).toBeVisible();
    const emblemBox = await emblem.boundingBox();
    expect(emblemBox?.width).toBe(32);
    expect(emblemBox?.height).toBe(32);

    // The active chip carries a check icon, drawn from the icon registry rather than a character.
    await expect(page.locator('a[data-club-filter="all"] .cl-club-chip__check svg')).toHaveCount(1);
    await expect(chip.locator('.cl-club-chip__check')).toHaveCount(0);
  });

  test('a bracket match card links to its report page', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`);

    // The played match (position 1, matchNumber 1) links to the report
    // already asserted above (same fixture, same header).
    await page.locator('article[data-match="1"] a[href$="/matches/1"]').click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Talleres vs Independiente' }),
    ).toBeVisible();

    // Still linked though its own slots are winner-of placeholders: the
    // report page renders correctly for a not-yet-played match.
    await page.goBack();
    await page.locator('article[data-match="2"] a[href$="/matches/2"]').click();
    await page.waitForURL(`**/stages/1/matches/2`);
  });

  test('a resolved bracket renders real scores and never NaN or corrupted placeholders', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`);

    // Real score is visible
    await expect(page.locator('article[data-match="1"]').getByText('Talleres')).toBeVisible();
    await expect(page.locator('article[data-match="1"]').getByText('2')).toBeVisible();
    await expect(page.locator('article[data-match="1"]').getByText('Independiente')).toBeVisible();
    await expect(page.locator('article[data-match="1"]').getByText('1')).toBeVisible();

    // Compact bracket labels retain the full source as their title; full cards show it directly.
    const final = page.locator('article[data-match="2"]');
    for (const source of ['Winner of Match 1', 'Winner of Match 3']) {
      await expect(
        final
          .getByText(source, { exact: true })
          .or(final.getByTitle(source, { exact: true }))
          .first(),
      ).toBeVisible();
    }

    // Entire stage body must never contain "NaN"
    await expect(page.locator('body')).not.toContainText('NaN');
    await expect(page.locator('body')).not.toContainText('NaN0');
  });

  test('filters the leaderboard to one club by URL, keeps whole-table ranks, and clears', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="top-scorers"]').click();
    await expect(page).toHaveURL(/tab=top-scorers/);

    // The full-ranking destination exposes its layout tabs and club filter.
    await page.getByRole('tab', { name: 'Top Scorers' }).click();
    await expect(page.getByRole('heading', { name: 'Top Scorers' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Goleador Uno' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Goleador Dos' })).toBeVisible();

    // Click the club filter — the interaction named as its motivation,
    // wired up here for the first time. The pill is a rendered club
    // emblem (placeholder, in this fixture) plus its name, both inside the
    // one filtering link.
    const independienteFilter = page.getByRole('link', { name: 'Club Atlético Independiente' });
    await independienteFilter.click();
    await page.waitForURL(/club=club-independiente/);
    await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      /club=club-independiente/,
    );

    // Only that club's player, with the same row data the unfiltered table
    // showed for them — not recomputed as if they led a smaller table (the
    // already-accepted whole-table-rank rule; verified server-side by
    // table-projections.integration.test.ts, which this fixture mirrors).
    const filteredRow = page.getByRole('row').filter({ hasText: 'Goleador Dos' });
    await expect(filteredRow).toBeVisible();
    await expect(filteredRow.getByRole('cell', { name: '5' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Goleador Uno' })).toHaveCount(0);

    // A linked filtered table renders filtered without further interaction
    // (public-web-shell's own scenario for this) — reload the same URL.
    await page.reload();
    await expect(page.getByRole('cell', { name: 'Goleador Dos' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Goleador Uno' })).toHaveCount(0);

    // Clearing the filter restores every entrant. Exact match: "All" is
    // otherwise a substring of "Talleres" among this page's other links.
    await page.getByRole('link', { name: 'All', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Goleador Uno' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Goleador Dos' })).toBeVisible();
    await expect(page).not.toHaveURL(/clubId=/);

    // Matches / ticker is unaffected throughout.
    await expect(page.getByRole('heading', { name: 'Matches' }).first()).toBeVisible();
  });

  test('a team name in the standings opens its club page', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await page.locator('[data-full-layout-code="group-standings-default"]').click();

    await page
      .locator(`a[href="/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/clubs/club-talleres"]`)
      .first()
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/clubs/club-talleres$`),
    );
  });

  test('a legacy clubId page URL answers 301 to the club alias form', async ({ page }) => {
    const response = await page.request.get(
      `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}?clubId=club-independiente&tab=group-standings-default`,
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(301);
    const location = response.headers()['location'] ?? '';
    expect(location).toContain('club=club-independiente');
    expect(location).toContain('tab=group-standings-default');
    expect(location).not.toContain('clubId=');
  });

  test('standings render a visible header row and never overflow the page at 375px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const table = page.locator('table.cl-table').first();
    await expect(table).toBeVisible();

    // The defect this replaces: plain text columns with no header treatment.
    const header = table.locator('thead th').first();
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('text-transform', 'uppercase');

    // A wide table scrolls inside its own box; the document never scrolls sideways.
    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(pageOverflows).toBe(false);
  });
});
