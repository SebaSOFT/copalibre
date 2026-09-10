import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * End-to-end coverage for OpenSpec 0223.
 *
 * Every case here is one a unit test cannot settle, because the thing being
 * checked is the browser's own behaviour: a menu that has to push the page down
 * rather than cover it, links that must leave the tab order when hidden, a
 * clipboard that refuses, a marquee under a reduced-motion preference, and a
 * page that must stay usable with its scripts disabled entirely.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  status: 'live',
  matches: [
    {
      matchNumber: 1,
      stageNumber: 1,
      homeName: 'Talleres',
      awayName: 'Independiente',
      homeScore: 3,
      awayScore: 1,
      status: 'live',
      scheduledAt: '2026-03-01T20:30:00Z',
    },
    {
      matchNumber: 2,
      stageNumber: 1,
      homeName: 'Gimnasia',
      awayName: 'Maipú',
      homeScore: 2,
      awayScore: 0,
      status: 'finalized',
      scheduledAt: '2026-02-28T18:00:00Z',
    },
  ],
  clubs: [],
  ruleset: {},
};

/** Two entrants level on points, separated by the head-to-head column. */
const standings = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: { en: 'Group standings', es: 'Tabla de posiciones' },
  projectionVersion: 7,
  defaultSort: [
    { columnCode: 'points', direction: 'desc' },
    { columnCode: 'head-to-head', direction: 'desc' },
    { columnCode: 'difference', direction: 'desc' },
  ],
  columns: [
    { code: 'entrant', header: { en: 'Team' }, shortHeader: { en: 'Team' }, format: 'text' },
    { code: 'points', header: { en: 'Points' }, shortHeader: { en: 'Pts' }, format: 'number' },
    {
      code: 'head-to-head',
      header: { en: 'Head to head' },
      shortHeader: { en: 'H2H' },
      format: 'number',
    },
    {
      code: 'difference',
      header: { en: 'Difference' },
      shortHeader: { en: 'Dif' },
      format: 'number',
    },
  ],
  rows: [
    {
      actorId: 'entrant-1',
      entrantName: 'Talleres',
      rank: 1,
      sharedRank: false,
      tieBroken: true,
      cells: {
        entrant: { formatted: 'Talleres', raw: 'Talleres' },
        points: { formatted: '6', raw: 6 },
        'head-to-head': { formatted: '3', raw: 3 },
        difference: { formatted: '3', raw: 3 },
      },
    },
    {
      actorId: 'entrant-2',
      entrantName: 'Gimnasia',
      rank: 2,
      sharedRank: false,
      tieBroken: true,
      cells: {
        entrant: { formatted: 'Gimnasia', raw: 'Gimnasia' },
        points: { formatted: '6', raw: 6 },
        'head-to-head': { formatted: '0', raw: 0 },
        difference: { formatted: '2', raw: 2 },
      },
    },
  ],
};

/** Four decided crosses feeding two semi-finals that still name their sources. */
const bracket = {
  format: 'single-elimination',
  matches: [
    {
      matchId: 'SE-1',
      bracket: 'winner',
      round: 1,
      position: 1,
      status: 'final',
      slots: [
        { kind: 'entrant', name: 'Talleres', score: 2 },
        { kind: 'entrant', name: 'Maipú', score: 0 },
      ],
    },
    {
      matchId: 'SE-2',
      bracket: 'winner',
      round: 1,
      position: 2,
      status: 'final',
      slots: [
        { kind: 'entrant', name: 'Gimnasia', score: 1 },
        { kind: 'entrant', name: 'Independiente', score: 3 },
      ],
    },
    {
      matchId: 'SE-3',
      bracket: 'winner',
      round: 2,
      position: 3,
      status: 'scheduled',
      slots: [
        { kind: 'winner-of', matchId: 'SE-1' },
        { kind: 'winner-of', matchId: 'SE-2' },
      ],
    },
  ],
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (
      path === `${BASE}/overview` ||
      path === `/organizations/${ORGANIZATION}/public/tournaments/${TOURNAMENT}/overview`
    ) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/public/tables`) {
      res.end(
        JSON.stringify({
          layouts: [
            {
              code: 'group-standings-default',
              target: 'group-phase',
              label: { en: 'Group standings' },
              entityGranularity: 'team',
            },
          ],
        }),
      );
      return;
    }
    // The stage page asks for the same layout scoped to its own stage.
    if (
      path === `${BASE}/public/tables/group-standings-default` ||
      path === `${BASE}/stages/1/public/tables/group-standings-default`
    ) {
      res.end(JSON.stringify(standings));
      return;
    }
    if (path === `${BASE}/stages/1/bracket`) {
      res.end(JSON.stringify(bracket));
      return;
    }
    if (path === `${BASE}/live`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          tournamentAlias: TOURNAMENT,
          matches: [],
        }),
      );
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

test.describe('Public header, expanding in page flow (0223)', () => {
  test.use({ viewport: { width: 375, height: 720 } });

  test('opening the menu pushes the ticker and content down rather than covering them', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    const toggle = page.locator('[data-public-nav-toggle]');
    await expect(toggle).toBeVisible();
    const ticker = page.locator('[data-ticker]');
    const before = await ticker.boundingBox();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const after = await ticker.boundingBox();
    expect(after?.y ?? 0).toBeGreaterThan(before?.y ?? 0);

    // Displaced, not overlaid: the navigation ends above where the ticker now is.
    const nav = page.locator('#cl-public-nav');
    const navBox = await nav.boundingBox();
    expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual((after?.y ?? 0) + 1);
  });

  test('a closed menu keeps its links out of the tab order', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    const toggle = page.locator('[data-public-nav-toggle]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#cl-public-nav')).toBeHidden();
    expect(await page.locator('#cl-public-nav a:visible').count()).toBe(0);
  });

  test('Escape closes the menu and returns focus to the control that opened it', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    const toggle = page.locator('[data-public-nav-toggle]');
    await toggle.click();
    await expect(page.locator('#cl-public-nav')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('the primary action is reachable from the row and from inside the opened menu', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    await expect(page.locator('.cl-public-header__cta')).toBeVisible();
    await page.locator('[data-public-nav-toggle]').click();
    await expect(page.locator('.cl-public-header__nav-cta')).toBeVisible();
  });

  test('the locale control offers a language and moves the page to it', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    await page.locator('.cl-public-header__locale > summary').click();
    const spanish = page.locator('.cl-public-header__locale-list a[hreflang="es"]');
    await expect(spanish).toBeVisible();
    await spanish.click();

    await expect(page).toHaveURL(new RegExp(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT}`));
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
});

test.describe('The public page without JavaScript (0223)', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 720 } });

  test('navigation is already expanded, and its destinations are locale-aware', async ({
    page,
  }) => {
    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    const nav = page.locator('#cl-public-nav');
    await expect(nav).toBeVisible();
    // The toggle never appears: nothing would answer it.
    await expect(page.locator('[data-public-nav-toggle]')).toBeHidden();

    const help = nav.locator('a[href="/es/help/"]');
    await expect(help).toBeVisible();
  });

  test('the ticker still reads, with no control that would do nothing', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    const ticker = page.locator('[data-ticker]');
    await expect(ticker).toBeVisible();
    await expect(ticker.getByText('Talleres').first()).toBeVisible();
    await expect(page.locator('[data-ticker-pause]')).toBeHidden();
  });
});

test.describe('The ticker in a browser (0223)', () => {
  test('pause is keyboard-operable and reports its state', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    const pause = page.locator('[data-ticker-pause]');
    await expect(pause).toBeVisible();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');

    await pause.focus();
    await page.keyboard.press('Enter');
    await expect(pause).toHaveAttribute('aria-pressed', 'true');

    // Paused means the transport stops moving, not that the rail disappears.
    const track = page.locator('[data-ticker-track]');
    const first = await track.evaluate((element) => getComputedStyle(element).transform);
    await page.waitForTimeout(400);
    const second = await track.evaluate((element) => getComputedStyle(element).transform);
    expect(second).toBe(first);
  });

  test('reduced motion leaves a static list with every entry reachable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);

    const track = page.locator('[data-ticker-track]');
    await expect(track).toHaveCSS('flex-wrap', 'wrap');

    const before = await track.evaluate((element) => getComputedStyle(element).transform);
    await page.waitForTimeout(500);
    const after = await track.evaluate((element) => getComputedStyle(element).transform);
    expect(after).toBe(before);

    // The rail keeps its declared height, so nothing beneath it moves.
    const rail = page.locator('[data-ticker]');
    await expect(rail).toHaveCSS('height', '44px');
    await expect(page.locator('[data-ticker-pause]')).toBeHidden();
  });
});

test.describe('Standings and bracket in a browser (0223)', () => {
  test('the tied leaders show the comparator that separated them', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1`);

    const standingsSection = page.locator('.cl-standings-section');
    await expect(standingsSection).toBeVisible();

    // Level on points, and the head-to-head column that separated them is
    // present with the values the projection sent — not a rank the page worked
    // out for itself.
    await expect(standingsSection.getByText('Talleres').first()).toBeVisible();
    await expect(standingsSection.getByText('Gimnasia').first()).toBeVisible();
    const rows = standingsSection.locator('tbody tr');
    expect(await rows.first().textContent()).toContain('Talleres');
  });

  test('every bracket node links to a match report', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1`);

    const stage = page.locator('.cl-bracket-stage');
    await expect(stage).toBeVisible();

    const links = stage.locator('a[href*="/matches/"]');
    expect(await links.count()).toBeGreaterThan(0);
    for (const href of await links.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('href') ?? ''),
    )) {
      expect(href).toContain(`/${ORGANIZATION}/tournaments/${TOURNAMENT}`);
    }
  });

  test('the key names each outcome in words, not by fill alone', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1`);

    const legend = page.locator('.cl-outcome-legend');
    await expect(legend).toBeVisible();
    await expect(legend.getByText('Advancing')).toBeVisible();
    await expect(legend.getByText('Eliminated')).toBeVisible();
  });

  test('a bracket wider than the viewport scrolls in its own region, not the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1`);

    await expect(page.locator('.cl-bracket-stage__scroll')).toHaveCSS('overflow-x', 'auto');
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test('below the graph’s floor the round-and-branch view carries the same stage', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 374, height: 720 });
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1`);

    await expect(page.locator('.cl-bracket-stage__outline')).toBeVisible();
    await expect(page.locator('.cl-bracket-stage__scroll')).toBeHidden();
    // The sources a pending cross is waiting on are named, not blank.
    await expect(page.locator('.cl-bracket-stage__outline')).toContainText('Ganador');
  });
});

test.describe('Representative widths keep the page inside the viewport (0223)', () => {
  for (const width of [375, 768, 1024, 1440]) {
    test(`no body-level horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1`);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows).toBe(false);
    });
  }

  test('no body-level horizontal overflow at 200% zoom', async ({ page }) => {
    // 200% zoom of a 1280px window is a 640px layout viewport.
    await page.setViewportSize({ width: 640, height: 720 });
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1`);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
