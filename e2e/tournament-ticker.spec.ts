import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * End-to-end tests for OpenSpec 0210: the tournament ticker.
 *
 * The reduced-motion case is the one worth an e2e rather than a unit test.
 * `@copalibre/design-tokens` emits a global rule collapsing every animation to
 * nothing under `prefers-reduced-motion`, so a CSS marquee would freeze at 0%
 * and hide every item past the fold. Only a real browser, with that stylesheet
 * loaded and the preference set, can show that the rail still reaches its
 * later items.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';

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
      homeScore: 3,
      awayScore: 1,
      status: 'in-progress',
      scheduledAt: '2026-03-01T15:00:00Z',
    },
    {
      matchNumber: 2,
      stageNumber: 1,
      homeName: 'Godoy Cruz',
      awayName: 'Independiente Rivadavia',
      status: 'scheduled',
      scheduledAt: '2026-03-01T18:00:00Z',
    },
    {
      matchNumber: 3,
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

const layouts = {
  layouts: [
    {
      code: 'top-scorers',
      target: 'player-ranking',
      label: { en: 'Top scorers', es: 'Goleadores' },
      entityGranularity: 'person',
    },
  ],
};

const topScorers = {
  layoutCode: 'top-scorers',
  target: 'player-ranking',
  label: { en: 'Top scorers', es: 'Goleadores' },
  defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
  projectionVersion: 4,
  columns: [
    { code: 'rank', header: { en: 'Rank', es: 'Puesto' }, format: 'number' },
    { code: 'goals', header: { en: 'Goals', es: 'Goles' }, format: 'number' },
  ],
  rows: [
    {
      actorId: 'player-1',
      entrantName: 'Nicolás Fernández',
      rank: 1,
      sharedRank: false,
      cells: { rank: { formatted: '1', raw: 1 }, goals: { formatted: '11', raw: 11 } },
    },
  ],
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    const base = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

    if (
      path === `${base}/overview` ||
      path === `/organizations/${ORGANIZATION}/public/tournaments/${TOURNAMENT_ALIAS}/overview`
    ) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${base}/public/tables`) {
      res.end(JSON.stringify(layouts));
      return;
    }
    if (path === `${base}/public/tables/top-scorers`) {
      res.end(JSON.stringify(topScorers));
      return;
    }
    if (path === `${base}/live`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          tournamentAlias: TOURNAMENT_ALIAS,
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

test.describe('Tournament ticker (OpenSpec 0210)', () => {
  test('the public tournament page shows the ticker with live match content', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const ticker = page.locator('[data-ticker]');
    await expect(ticker).toBeVisible();

    // The live fixture, with its score rather than a placeholder.
    await expect(ticker.getByText('Talleres').first()).toBeVisible();
    await expect(ticker.getByText('3 : 1').first()).toBeVisible();

    // A top performer, read from the discipline's own declared layout and
    // ranked by that layout's `defaultSort` — the goals, not the rank column.
    await expect(ticker.getByText('Nicolás Fernández').first()).toBeVisible();
    await expect(ticker.getByText('11').first()).toBeVisible();
  });

  test('under reduced motion the rail steps instead of scrolling, and still reaches its later items', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const track = page.locator('[data-ticker-track]');
    await expect(track).toBeVisible();

    const offsetAt = async () =>
      track.evaluate((element) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return matrix.m41;
      });

    // It starts at rest: nothing has scrolled it off its first item.
    expect(await offsetAt()).toBe(0);

    // And it advances in discrete jumps rather than sliding, so every item
    // becomes readable instead of being stranded past the fold.
    await expect.poll(offsetAt, { timeout: 15_000 }).toBeLessThan(0);

    await context.close();
  });
});
