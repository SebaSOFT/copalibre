import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * OpenSpec 0238: the public match report page's bracket-context panel, and its absence
 * for a stage whose format isn't bracket-shaped.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

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

/** A single-elimination stage's match 1 report — the bracket-context panel should apply. */
const bracketMatchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'single-elimination',
  matchNumber: 1,
  round: 1,
  status: 'final',
  homeName: 'Talleres',
  awayName: 'Independiente',
  homeScore: 2,
  awayScore: 0,
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
};

/** The same stage's bracket, three matches across two rounds. */
const bracketData = {
  format: 'single-elimination',
  matches: [
    {
      matchId: 'WB-R1-M1',
      bracket: 'winners',
      round: 1,
      position: 1,
      status: 'finalized',
      slots: [
        { kind: 'entrant', name: 'Talleres', score: 2 },
        { kind: 'entrant', name: 'Independiente', score: 0 },
      ],
    },
    {
      matchId: 'WB-R1-M2',
      bracket: 'winners',
      round: 1,
      position: 2,
      status: 'scheduled',
      slots: [
        { kind: 'entrant', name: 'Gimnasia' },
        { kind: 'entrant', name: 'Maipú' },
      ],
    },
    {
      matchId: 'WB-R2-M1',
      bracket: 'winners',
      round: 2,
      position: 1,
      status: 'scheduled',
      slots: [
        { kind: 'winner-of', matchId: 'WB-R1-M1' },
        { kind: 'winner-of', matchId: 'WB-R1-M2' },
      ],
    },
  ],
};

/** A round-robin stage's match report — no bracket-context panel applies. */
const roundRobinMatchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 2,
  stageFormat: 'round-robin',
  matchNumber: 1,
  round: 1,
  status: 'final',
  homeName: 'Talleres',
  awayName: 'Independiente',
  homeScore: 1,
  awayScore: 1,
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
};

let apiServer: Server;
let bracketRequests = 0;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/stages/1/matches/1`) {
      res.end(JSON.stringify(bracketMatchReport));
      return;
    }
    if (path === `${BASE}/stages/1/bracket`) {
      bracketRequests += 1;
      res.end(JSON.stringify(bracketData));
      return;
    }
    if (path === `${BASE}/stages/2/matches/1`) {
      res.end(JSON.stringify(roundRobinMatchReport));
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

test.beforeEach(() => {
  bracketRequests = 0;
});

test('shows the bracket-context panel with the current match emphasized, and links to the full bracket', async ({
  page,
}) => {
  await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/1`);

  const panel = page.getByRole('region', { name: /this match in the bracket/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Talleres')).toBeVisible();
  await expect(panel.getByText('Independiente')).toBeVisible();
  await expect(panel.getByText('Gimnasia')).toBeVisible();
  await expect(panel.getByText('Maipú')).toBeVisible();
  expect(bracketRequests).toBe(1);

  // The current match's node (Talleres vs Independiente, round one) carries the emphasis
  // class — the same treatment BracketView.astro's own championship node uses.
  const focusedNode = panel
    .locator('.cl-bracket-stage__node--focused')
    .filter({ hasText: 'Talleres' });
  await expect(focusedNode).toHaveCount(1);

  const viewFullLink = panel.getByRole('link', { name: /view full bracket/i });
  await viewFullLink.click();
  await page.waitForURL(`**/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`);
});

test('shows no bracket-context panel for a round-robin stage, and issues no bracket request', async ({
  page,
}) => {
  await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/2/matches/1`);

  await expect(page.getByRole('region', { name: /this match in the bracket/i })).toHaveCount(0);
  expect(bracketRequests).toBe(0);
});
