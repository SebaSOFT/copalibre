import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * OpenSpec 0294: the TV scorebug's possession/timed-penalty indicators and the
 * full-frame bracket rail, rendered from the real public projections (never
 * sample data) — present on the kiosk and full-overlay presentations, the
 * indicator alone (no bracket) on the lower third, and neither indicator nor
 * bracket tab when the projection has no such fact or the featured stage
 * isn't an elimination bracket.
 */

const ORGANIZATION = 'liga-transmision';
const TOURNAMENT = 'playoffs-emision';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TV_PATH = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

const HOME_ID = 'entrant-home';
const AWAY_ID = 'entrant-away';

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Transmisión',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Playoffs Emisión',
  seasonName: 'Playoffs Emisión',
  matches: [],
  clubs: [],
  ruleset: {},
};

function liveMatchWithFacts(stageNumber: number) {
  return {
    matches: [
      {
        matchId: 'live-match-1',
        stageNumber,
        matchNumber: 1,
        state: 'in-progress',
        projectionVersion: 1,
        possessionEntrantId: HOME_ID,
        activePenalties: [{ timerId: 'timer-1', entrantId: AWAY_ID, remainingSeconds: 125 }],
        sides: [
          { entrantId: HOME_ID, name: 'Cóndores del Sur', abbreviation: 'CDS', score: 1 },
          { entrantId: AWAY_ID, name: 'Halcones Rojos', abbreviation: 'HRO', score: 0 },
        ],
      },
    ],
  };
}

function liveMatchWithoutFacts(stageNumber: number) {
  return {
    matches: [
      {
        matchId: 'live-match-1',
        stageNumber,
        matchNumber: 1,
        state: 'in-progress',
        projectionVersion: 1,
        sides: [
          { entrantId: HOME_ID, name: 'Cóndores del Sur', abbreviation: 'CDS', score: 1 },
          { entrantId: AWAY_ID, name: 'Halcones Rojos', abbreviation: 'HRO', score: 0 },
        ],
      },
    ],
  };
}

const eliminationBracket = {
  format: 'single-elimination',
  zones: [
    {
      zoneId: 'zone-a',
      zoneName: 'Zona A',
      matches: [
        {
          matchId: 'bracket-final',
          matchNumber: 1,
          bracket: 'winners',
          round: 1,
          position: 1,
          status: 'finalized',
          slots: [
            { kind: 'entrant', entrantId: HOME_ID, name: 'Cóndores del Sur', score: 3 },
            { kind: 'entrant', entrantId: AWAY_ID, name: 'Halcones Rojos', score: 1 },
          ],
        },
        {
          matchId: 'bracket-next',
          matchNumber: 2,
          bracket: 'winners',
          round: 2,
          position: 1,
          status: 'scheduled',
          slots: [{ kind: 'winner-of', matchId: 'bracket-final' }],
        },
      ],
    },
  ],
};

const roundRobinBracket = { format: 'round-robin', zones: [{ matches: [] }] };

let live: unknown = liveMatchWithFacts(1);
let bracket: unknown = eliminationBracket;
let server: Server;

test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
    } else if (path === `${BASE}/live`) {
      res.end(JSON.stringify(live));
    } else if (path === `${BASE}/stages/1/bracket`) {
      res.end(JSON.stringify(bracket));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  live = liveMatchWithFacts(1);
  bracket = eliminationBracket;
});

test('kiosk shows possession and timed-penalty indicators, and the published bracket', async ({
  page,
}) => {
  await page.goto(TV_PATH);

  const indicators = page.locator('.tv-match-indicators').first();
  await expect(indicators.getByText('Possession')).toBeVisible();
  await expect(indicators.getByText('CDS')).toBeVisible();
  await expect(indicators.getByText('Penalty')).toBeVisible();
  await expect(indicators.getByText('HRO')).toBeVisible();
  await expect(indicators).not.toContainText('%');

  await page.getByRole('button', { name: 'Bracket' }).click();
  const card = page.locator('.tv-bracket-card').first();
  await expect(card).toBeVisible();
  await expect(page.getByText('Zona A')).toBeVisible();
  await expect(page.getByText('Ganador del 1')).toBeVisible();
  const cardClasses = await card.getAttribute('class');
  expect(cardClasses).toContain('cl-chamfer');
  expect(cardClasses).toContain('cl-chamfer--control');
});

test('full overlay carries the same indicators and bracket as the kiosk', async ({ page }) => {
  await page.goto(`${TV_PATH}?mode=overlay-full`);

  const indicators = page.locator('.tv-match-indicators').first();
  await expect(indicators.getByText('Possession')).toBeVisible();
  await expect(indicators.getByText('Penalty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bracket' })).toBeVisible();
});

test('lower third keeps the indicator but never shows a bracket section', async ({ page }) => {
  await page.goto(`${TV_PATH}?mode=overlay-lower`);

  const indicators = page.locator('.tv-match-indicators').first();
  await expect(indicators.getByText('Possession')).toBeVisible();
  await expect(indicators.getByText('Penalty')).toBeVisible();
  await expect(page.locator('.tv-bracket')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bracket' })).toHaveCount(0);
});

test('omits both indicators when the live projection supplies neither fact', async ({ page }) => {
  live = liveMatchWithoutFacts(1);
  await page.goto(TV_PATH);

  await expect(page.getByText('CDS').first()).toBeVisible();
  await expect(page.locator('.tv-match-indicators')).toHaveCount(0);
});

test('shows no bracket tab or section for a non-elimination (grid) stage', async ({ page }) => {
  bracket = roundRobinBracket;
  await page.goto(TV_PATH);

  // The scorebug's own indicators are unaffected by the bracket's absence.
  const indicators = page.locator('.tv-match-indicators').first();
  await expect(indicators.getByText('Possession')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Bracket' })).toHaveCount(0);
  await expect(page.locator('.tv-bracket')).toHaveCount(0);
  // The rail's other sections still render — a missing bracket costs only its own tab.
  await expect(page.getByRole('button', { name: 'Standings' })).toBeVisible();
});
