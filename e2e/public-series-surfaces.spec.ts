import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

/**
 * The public bracket for a cross settled by a series (0159 tasks 7.3, 7.4).
 *
 * Two things a spectator has to be able to read here: how many games are left, and — where the
 * series is a two-legged tie — what the score is on aggregate. Both without color, because the
 * platform's non-color-redundancy rule applies with more force to "this match may never
 * happen" than to almost anything else on the page.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `${TOURNAMENT}/stages/1`;

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

/**
 * One best-of-five standing at two games to one — undecided, so the bracket must show no
 * winner and the cross after it must show no entrant from it — plus one two-legged aggregate
 * tie, decided 3–2 on aggregate after losing its first leg.
 */
let bracketFixture: { matches: unknown[] } = {
  matches: [
    {
      matchId: 'm-1',
      bracket: 'winner',
      round: 1,
      position: 1,
      status: 'in-progress',
      slots: [
        { kind: 'entrant', name: 'Talleres', abbreviation: 'TAL' },
        { kind: 'entrant', name: 'Independiente', abbreviation: 'IND' },
      ],
      series: {
        span: 5,
        resolutionClass: 'best-of',
        homeGamesWon: 2,
        awayGamesWon: 1,
        status: 'undecided',
        explanation: 'Best-of-5 series undecided (2-1)',
        games: [
          { number: 1, status: 'finalized', winner: 'home', scores: [2, 1] },
          { number: 2, status: 'finalized', winner: 'away', scores: [0, 1] },
          { number: 3, status: 'finalized', winner: 'home', scores: [3, 2] },
          { number: 4, status: 'scheduled' },
          { number: 5, status: 'scheduled' },
        ],
      },
    },
    {
      matchId: 'm-2',
      bracket: 'winner',
      round: 1,
      position: 2,
      status: 'finalized',
      slots: [
        { kind: 'entrant', name: 'Gimnasia', abbreviation: 'GIM' },
        { kind: 'entrant', name: 'Maipú', abbreviation: 'MAI' },
      ],
      series: {
        span: 2,
        resolutionClass: 'aggregate',
        homeGamesWon: 1,
        awayGamesWon: 1,
        aggregateScores: [2, 3],
        status: 'decided',
        winner: 'away',
        explanation: 'Aggregate series won by Maipú (3-2)',
        games: [
          { number: 1, status: 'finalized', winner: 'home', scores: [2, 1] },
          { number: 2, status: 'finalized', winner: 'away', scores: [0, 2] },
        ],
      },
    },
    {
      // The cross downstream of the undecided series: nothing has advanced into it.
      matchId: 'm-3',
      bracket: 'winner',
      round: 2,
      position: 1,
      status: 'scheduled',
      slots: [
        { kind: 'winner-of', matchId: '1' },
        { kind: 'winner-of', matchId: '2' },
      ],
    },
  ],
};

let apiServer: Server;

test.beforeAll(async () => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === `${TOURNAMENT}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (req.url === `${STAGE}/bracket`) {
      res.end(JSON.stringify(bracketFixture));
      return;
    }
    if (req.url === `${TOURNAMENT}/public/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });
  await new Promise<void>((resolve) => apiServer.listen(3001, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

const bracketPath = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`;

// The page is server-rendered, so the browser never issues the bracket request — swapping the
// fixture the stub server answers with is the only way to change what a test sees.
const UNDECIDED_FIXTURE = bracketFixture;
test.beforeEach(() => {
  bracketFixture = UNDECIDED_FIXTURE;
});

/** Round one of the winners' bracket, where both series crosses live. */
function roundOne(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: 'winner — round 1' });
}

test('7.3: shows the series bar, the running score, a pending cross and an aggregate tie', async ({
  page,
}) => {
  await page.goto(bracketPath);

  // Every position of the best-of-five is shown, whether or not it will be played, so a
  // spectator can see how many are left.
  const bestOfFive = roundOne(page).locator('[data-match="1"]');
  await expect(bestOfFive.locator('.cl-series__segment')).toHaveCount(5);
  await expect(bestOfFive.getByText('2 — 1')).toBeVisible();

  // Undecided: named as pending with its score, showing no winner.
  await expect(bestOfFive.getByText('Series undecided at 2–1')).toBeVisible();
  await expect(bestOfFive.getByText(/won the series/)).toHaveCount(0);

  // The two-legged tie names the side that advanced and shows the aggregate.
  const aggregate = roundOne(page).locator('[data-match="2"]');
  await expect(aggregate.getByText('On aggregate 2–3')).toBeVisible();
  await expect(aggregate.getByText('Maipú won the series')).toBeVisible();
  // Both legs stay individually readable alongside the aggregate.
  await expect(aggregate.locator('.cl-series__legs li')).toHaveCount(2);

  // Nothing has advanced out of the undecided cross: the round-two cross still names its
  // dependency rather than an entrant.
  const downstream = page.getByRole('region', { name: 'winner — round 2' });
  await expect(downstream.getByText('Ganador del 1')).toBeVisible();
  await expect(downstream.getByText('Talleres')).toHaveCount(0);
});

test('7.4: series state is legible with color disabled and carries a text equivalent', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(bracketPath);

  const bestOfFive = roundOne(page).locator('[data-match="1"]');

  // The state lives in the DOM as data and as words, never in a color: stripping every style
  // sheet leaves both standing.
  await expect(bestOfFive.locator('[data-state="won-home"]')).toHaveCount(2);
  await expect(bestOfFive.locator('[data-state="won-away"]')).toHaveCount(1);
  await expect(bestOfFive.locator('[data-state="upcoming"]')).toHaveCount(2);

  // Each position carries its state in words for assistive technology, and a mark rather than
  // a colour for everyone else.
  await expect(bestOfFive.getByLabel('Game 1: won by the home side')).toBeAttached();
  await expect(bestOfFive.getByLabel('Game 4: still to play')).toBeAttached();

  // The bar as a whole announces the series and its score.
  await expect(bestOfFive.getByLabel('Best of 5 series: 2 to 1')).toBeAttached();
});

test('7.4: a game that will not be played is distinguishable from one merely upcoming', async ({
  page,
}) => {
  bracketFixture = {
    matches: [
      {
        matchId: 'm-1',
        bracket: 'winner',
        round: 1,
        position: 1,
        status: 'finalized',
        slots: [
          { kind: 'entrant', name: 'Talleres', abbreviation: 'TAL' },
          { kind: 'entrant', name: 'Independiente', abbreviation: 'IND' },
        ],
        series: {
          span: 5,
          resolutionClass: 'best-of',
          homeGamesWon: 3,
          awayGamesWon: 1,
          status: 'decided',
          winner: 'home',
          explanation: 'Best-of-5 series won by Talleres (3-1)',
          games: [
            { number: 1, status: 'finalized', winner: 'home' },
            { number: 2, status: 'finalized', winner: 'away' },
            { number: 3, status: 'finalized', winner: 'home' },
            { number: 4, status: 'finalized', winner: 'home' },
            { number: 5, status: 'not-required' },
          ],
        },
      },
    ],
  };
  await page.goto(bracketPath);

  const bestOfFive = roundOne(page).locator('[data-match="1"]');
  await expect(bestOfFive.locator('[data-state="not-required"]')).toHaveCount(1);
  await expect(bestOfFive.locator('[data-state="upcoming"]')).toHaveCount(0);
  await expect(bestOfFive.getByLabel('Game 5: will not be played')).toBeAttached();
});
