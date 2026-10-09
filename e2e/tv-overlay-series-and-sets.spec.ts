import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The broadcast overlay shows only the match it was given — pinned, or the live match of its court —
 * and says so when it has none. A match inside a series shows where the series stands; a match
 * played in sets shows the sets played and the one in play, read from the live projection and the
 * match report. A plain match renders as it always did.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TV = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

const side = (id: string, name: string, abbreviation: string, score: number) => ({
  entrantId: id,
  name,
  abbreviation,
  score,
});
const SETS = [
  {
    number: 1,
    type: 'set',
    label: { en: 'Set' },
    timed: false,
    state: 'completed',
    scores: [6, 4],
  },
  {
    number: 2,
    type: 'set',
    label: { en: 'Set' },
    timed: false,
    state: 'completed',
    scores: [3, 6],
  },
  { number: 3, type: 'set', label: { en: 'Set' }, timed: false, state: 'active', scores: [2, 1] },
];

const liveMatch = (
  ordinal: number,
  home: [string, string],
  away: [string, string],
  segments?: typeof SETS,
) => ({
  matchId: `match-${ordinal}`,
  stageNumber: 1,
  matchNumber: 1,
  stageOrdinal: ordinal,
  state: 'live',
  projectionVersion: 1,
  sides: [side(`h${ordinal}`, home[0], home[1], 1), side(`a${ordinal}`, away[0], away[1], 0)],
  ...(segments === undefined ? {} : { segments }),
});

const live = {
  matches: [
    liveMatch(1, ['Talleres', 'TAL'], ['Andes', 'AND'], SETS),
    liveMatch(2, ['Boca', 'BOC'], ['River', 'RIV']),
    liveMatch(3, ['Gimnasia', 'GIM'], ['Maipú', 'MAI']),
  ],
};

const overviewMatch = (ordinal: number, home: string, away: string) => ({
  matchId: `match-${ordinal}`,
  matchNumber: 1,
  stageOrdinal: ordinal,
  stageNumber: 1,
  round: 1,
  status: 'in-progress',
  homeName: home,
  awayName: away,
  homeScore: 1,
  awayScore: 0,
});

const matchesView = {
  matches: [
    {
      matchId: 'match-1',
      stageNumber: 1,
      matchNumber: 1,
      round: 1,
      status: 'live',
      homeName: 'Talleres',
      awayName: 'Andes',
      venueName: 'Cancha 1',
    },
    {
      matchId: 'match-2',
      stageNumber: 1,
      matchNumber: 2,
      round: 1,
      status: 'live',
      homeName: 'Boca',
      awayName: 'River',
      venueName: 'Cancha 2',
      series: {
        span: 3,
        resolutionClass: 'best-of',
        games: [
          { number: 1, status: 'finalized', winner: 'home', scores: [2, 1] },
          { number: 2, status: 'in-progress' },
          { number: 3, status: 'scheduled' },
        ],
        homeGamesWon: 1,
        awayGamesWon: 0,
        status: 'undecided',
        explanation: 'Boca leads 1–0',
      },
    },
    {
      matchId: 'match-3',
      stageNumber: 1,
      matchNumber: 3,
      round: 1,
      status: 'live',
      homeName: 'Gimnasia',
      awayName: 'Maipú',
      venueName: 'Cancha 3',
    },
  ],
};

const report = (ordinal: number, segments?: typeof SETS) => ({
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'round-robin',
  matchNumber: ordinal,
  round: 1,
  status: 'live',
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
  ...(segments === undefined ? {} : { segments }),
});

let server: Server;
test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${BASE}/overview`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          organizationName: 'Liga Mendocina',
          tournamentAlias: TOURNAMENT,
          tournamentName: 'Apertura 2026',
          seasonName: '2026',
          status: 'live',
          ruleset: {},
          clubs: [],
          matches: [
            overviewMatch(1, 'Talleres', 'Andes'),
            overviewMatch(2, 'Boca', 'River'),
            overviewMatch(3, 'Gimnasia', 'Maipú'),
          ],
        }),
      );
    } else if (path === `${BASE}/live`) res.end(JSON.stringify(live));
    else if (path === `${BASE}/matches-view`) res.end(JSON.stringify(matchesView));
    else if (path === `${BASE}/stages/1/bracket`)
      res.end(JSON.stringify({ format: 'round-robin', zones: [] }));
    else if (path === `${BASE}/stages/1/matches/1`) res.end(JSON.stringify(report(1, SETS)));
    else if (path === `${BASE}/stages/1/matches/2`) res.end(JSON.stringify(report(2)));
    else if (path === `${BASE}/stages/1/matches/3`) res.end(JSON.stringify(report(3)));
    else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('an overlay with no match and no court shows the no-match state and no score', async ({
  page,
}) => {
  await page.goto(`${TV}?mode=overlay&bg=neutral`);

  await expect(page.getByTestId('tv-overlay-no-match')).toContainText('No match selected');
  await expect(page.locator('body')).not.toContainText('TAL');
  await expect(page.locator('body')).not.toContainText('BOC');
});

test('two overlays each show only their own match', async ({ page }) => {
  await page.goto(`${TV}/stages/1/matches/1?mode=overlay`);
  await expect(page.getByTestId('tv-lower-third')).toContainText('TAL');
  await expect(page.getByTestId('tv-lower-third')).not.toContainText('BOC');

  await page.goto(`${TV}/stages/1/matches/3?mode=overlay`);
  await expect(page.getByTestId('tv-lower-third')).toContainText('GIM');
  await expect(page.getByTestId('tv-lower-third')).not.toContainText('TAL');
});

test('an overlay addressed to a court follows that court’s live match, and says when it has none', async ({
  page,
}) => {
  await page.goto(`${TV}?mode=overlay&court=${encodeURIComponent('Cancha 3')}`);
  await expect(page.getByTestId('tv-lower-third')).toContainText('GIM');
  await expect(page.getByTestId('tv-lower-third')).not.toContainText('BOC');

  await page.goto(`${TV}?mode=overlay&court=${encodeURIComponent('Cancha 9')}`);
  await expect(page.getByTestId('tv-overlay-no-match')).toContainText(
    'No live match on this court',
  );
});

test('a match in sets shows the sets played and the one in play', async ({ page }) => {
  await page.goto(`${TV}/stages/1/matches/1?mode=overlay&bg=neutral`);

  const sets = page.getByTestId('tv-sets');
  await expect(sets.locator('.tv-progress__set-score')).toHaveText(['6–4', '3–6', '2–1']);
  await expect(sets.locator('[aria-current="true"]')).toHaveCount(1);
  await expect(sets.locator('.tv-progress__set-label').first()).toHaveText('Set 1');
  // The segment in play is named by its place among the sets.
  await expect(page.getByTestId('tv-segment')).toHaveText('3rd Set');
});

test('on a phone-shaped frame the lower third keeps the score and the sets on two rows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${TV}/stages/1/matches/2?mode=overlay&bg=neutral`);

  const series = await page.getByTestId('tv-series').boundingBox();
  const score = await page.locator('.tv-lower-third__clock').boundingBox();
  if (series === null || score === null) throw new Error('the overlay did not render');
  // Series on the second row, below the score's row and never wrapped to a third.
  expect(series.y).toBeGreaterThan(score.y + score.height - 1);
  expect(series.height).toBeLessThan(30);
});

test('a match in a series shows where the series stands next to the score', async ({ page }) => {
  await page.goto(`${TV}/stages/1/matches/2?mode=overlay&bg=neutral`);

  await expect(page.getByTestId('tv-series')).toHaveAttribute('title', 'Series 1–0 · Game 2 of 3');
  await expect(page.locator('.tv-progress__pip')).toHaveCount(3);
  await expect(page.locator('.tv-progress__pip--current')).toHaveCount(1);
});

test('a plain match renders without any progress strip', async ({ page }) => {
  await page.goto(`${TV}/stages/1/matches/3?mode=overlay`);

  await expect(page.getByTestId('tv-lower-third')).toBeVisible();
  await expect(page.getByTestId('tv-match-progress')).toHaveCount(0);
});

test('the sets strip does not change width when a set ends', async ({ page }) => {
  await page.goto(`${TV}/stages/1/matches/1?mode=overlay`);
  const chip = page.locator('.tv-progress__set').first();
  const before = (await chip.boundingBox())?.width ?? 0;

  // The score of the first set going from one to two digits must not move its neighbours.
  await page.evaluate(() => {
    const score = document.querySelector('.tv-progress__set-score');
    if (score) score.textContent = '10–12';
  });
  const after = (await chip.boundingBox())?.width ?? 0;
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

test('captures the overlays at broadcast and phone size', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${TV}/stages/1/matches/1?mode=overlay-full&bg=neutral&lang=es`);
  await expect(page.getByTestId('tv-sets')).toBeVisible();
  await page.screenshot({ path: 'docs/assets/screenshots/tv-overlay-sets-desktop.png' });
  await page.goto(`${TV}/stages/1/matches/2?mode=overlay-full&bg=neutral&lang=es`);
  await expect(page.getByTestId('tv-series')).toBeVisible();
  await page.screenshot({ path: 'docs/assets/screenshots/tv-overlay-series-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${TV}/stages/1/matches/1?mode=overlay-full&bg=neutral&lang=es`);
  await expect(page.getByTestId('tv-sets')).toBeVisible();
  await page.screenshot({ path: 'docs/assets/screenshots/tv-overlay-sets-mobile.png' });
  await page.goto(`${TV}/stages/1/matches/2?mode=overlay-full&bg=neutral&lang=es`);
  await page.screenshot({ path: 'docs/assets/screenshots/tv-overlay-series-mobile.png' });
});
