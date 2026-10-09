import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * A cup's bracket: every fixture drawn (the generated graph's seven matches and the five placement
 * games), a link between each match and the ones that feed it, and the whole zone on the match page.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`;

const side = (
  name: string,
  score: number,
  from?: { matchId: string; outcome: 'winner' | 'loser' },
) => ({
  kind: 'entrant',
  entrantId: `e-${name}`,
  name,
  score,
  ...(from ? { from } : {}),
});
const match = (
  matchId: string,
  bracket: string,
  round: number,
  position: number,
  matchNumber: number,
  slots: unknown[],
  role?: string,
) => ({
  matchId,
  bracket,
  round,
  position,
  matchNumber,
  status: 'finalized',
  ...(role ? { role } : {}),
  slots,
});

// Eight clubs, drawn out of seed order: the semi-finals are fed by matches 1 and 4, and 2 and 3.
const matches = [
  match('SE-R1-M1', 'winners', 1, 1, 1, [side('A', 3), side('B', 1)]),
  match('SE-R1-M2', 'winners', 1, 2, 2, [side('C', 2), side('D', 0)]),
  match('SE-R1-M3', 'winners', 1, 3, 3, [side('E', 1), side('F', 4)]),
  match('SE-R1-M4', 'winners', 1, 4, 4, [side('G', 5), side('H', 2)]),
  match('SE-R2-M1', 'winners', 2, 1, 7, [
    side('A', 2, { matchId: 'SE-R1-M1', outcome: 'winner' }),
    side('G', 1, { matchId: 'SE-R1-M4', outcome: 'winner' }),
  ]),
  match('SE-R2-M2', 'winners', 2, 2, 8, [
    side('C', 0, { matchId: 'SE-R1-M2', outcome: 'winner' }),
    side('F', 1, { matchId: 'SE-R1-M3', outcome: 'winner' }),
  ]),
  match('SE-R3-M1', 'winners', 3, 1, 11, [
    side('A', 1, { matchId: 'SE-R2-M1', outcome: 'winner' }),
    side('F', 0, { matchId: 'SE-R2-M2', outcome: 'winner' }),
  ]),
  match(
    'PL-R2-M1',
    'placement',
    2,
    1,
    5,
    [
      side('B', 1, { matchId: 'SE-R1-M1', outcome: 'loser' }),
      side('H', 0, { matchId: 'SE-R1-M4', outcome: 'loser' }),
    ],
    'places-5-8',
  ),
  match(
    'PL-R2-M2',
    'placement',
    2,
    2,
    6,
    [
      side('D', 3, { matchId: 'SE-R1-M2', outcome: 'loser' }),
      side('E', 2, { matchId: 'SE-R1-M3', outcome: 'loser' }),
    ],
    'places-5-8',
  ),
  match(
    'PL-R3-M1',
    'placement',
    3,
    1,
    12,
    [
      side('G', 2, { matchId: 'SE-R2-M1', outcome: 'loser' }),
      side('C', 2, { matchId: 'SE-R2-M2', outcome: 'loser' }),
    ],
    'place-3',
  ),
  match(
    'PL-R3-M2',
    'placement',
    3,
    2,
    13,
    [
      side('B', 4, { matchId: 'PL-R2-M1', outcome: 'winner' }),
      side('D', 1, { matchId: 'PL-R2-M2', outcome: 'winner' }),
    ],
    'place-5',
  ),
  match(
    'PL-R3-M3',
    'placement',
    3,
    3,
    14,
    [
      side('H', 0, { matchId: 'PL-R2-M1', outcome: 'loser' }),
      side('E', 1, { matchId: 'PL-R2-M2', outcome: 'loser' }),
    ],
    'place-7',
  ),
];

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [],
  clubs: [],
  ruleset: {},
};

const placementReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'single-elimination',
  matchNumber: 12,
  round: 3,
  status: 'final',
  homeName: 'G',
  awayName: 'C',
  homeScore: 2,
  awayScore: 2,
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
    } else if (path === `${BASE}/stages/1/bracket`) {
      res.end(JSON.stringify({ format: 'single-elimination', zones: [{ matches }] }));
    } else if (path === `${BASE}/stages/1/matches/12`) {
      res.end(JSON.stringify(placementReport));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.describe('public knockout bracket', () => {
  test('draws the tree with the final in the middle and lists the placement games under it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(STAGE);

    const canvas = page.locator('.cl-bracket-stage__canvas');
    await expect(canvas.locator('.cl-bracket-stage__node')).toHaveCount(7);
    await expect(canvas.getByText('Final', { exact: true })).toBeVisible();

    // The five placement games are not in the tree; they are listed under what each decides.
    const list = page.locator('.cl-placement-games');
    await expect(list.locator('.cl-placement-games__game')).toHaveCount(5);
    await expect(list.getByText('3º puesto', { exact: true })).toBeVisible();
    await expect(list.getByText('5º puesto', { exact: true })).toBeVisible();
    await expect(list.getByText('7º puesto', { exact: true })).toBeVisible();
    await expect(list.getByText('5º al 8º puesto', { exact: true })).toHaveCount(1);
    await expect(list.getByRole('link', { name: 'G 2 – 2 C' })).toBeVisible();
  });

  test('links every match to the ones that fed it, with no card on another', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(STAGE);

    await expect(page.locator('[data-link-from="SE-R1-M1"][data-link-to="SE-R2-M1"]')).toHaveCount(
      1,
    );
    await expect(page.locator('[data-link-from="SE-R1-M4"][data-link-to="SE-R2-M1"]')).toHaveCount(
      1,
    );
    await expect(page.locator('[data-link-from="SE-R2-M2"][data-link-to="SE-R3-M1"]')).toHaveCount(
      1,
    );
    // Nothing is drawn for the placement games.
    await expect(page.locator('[data-link-to^="PL-"]')).toHaveCount(0);

    const boxes = await page
      .locator('.cl-bracket-stage__canvas .cl-bracket-stage__node')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const overlaps =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });

  test('puts one semi-final on each side of the final, each with its own two feeders', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(STAGE);
    const left = async (from: string, to: string) =>
      page
        .locator(`[data-link-from="${from}"][data-link-to="${to}"]`)
        .evaluate((el) => el.getBoundingClientRect().left);
    // The first semi-final (fed by matches 1 and 4) sits left of the final, the second right of it.
    expect(await left('SE-R2-M1', 'SE-R3-M1')).toBeLessThan(await left('SE-R2-M2', 'SE-R3-M1'));
    // Matches 1 and 4 feed the same semi-final, so they are drawn in the same column.
    expect(await left('SE-R1-M1', 'SE-R2-M1')).toBeCloseTo(await left('SE-R1-M4', 'SE-R2-M1'), 0);
  });

  test('the match page shows the whole zone, with the current game marked in the list', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${STAGE}/matches/12`);

    const panel = page.locator('.cl-bracket-context');
    await expect(panel.locator('.cl-bracket-stage__node')).toHaveCount(7);
    const current = panel.locator('.cl-placement-games__game--current');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('aria-current', 'true');

    // No inner scroll box shorter than the bracket: nothing is cut off.
    const clipped = await panel.locator('.cl-bracket-stage__scroll').evaluate((el) => {
      const canvas = el.querySelector('.cl-bracket-stage__canvas') as HTMLElement;
      return el.clientHeight < canvas.offsetHeight;
    });
    expect(clipped).toBe(false);
  });

  test('a phone scrolls the bracket sideways inside its own box, never the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(STAGE);
    await expect(page.locator('.cl-bracket-stage__canvas')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
