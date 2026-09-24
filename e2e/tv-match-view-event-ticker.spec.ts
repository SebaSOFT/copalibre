import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * OpenSpec 0270: the pinned-match TV route shows recorded goal/card events (entrant, player, time)
 * alongside the score, reusing the same match-event data the public match report page already
 * renders — and shows no ticker section at all for a match with no recorded events.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const TV_MATCH_PATH = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/1`;

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

const live = {
  matches: [
    {
      matchId: 'match-1',
      stageNumber: 1,
      matchNumber: 1,
      state: 'live',
      projectionVersion: 1,
      sides: [
        { entrantId: 'entrant-home', name: 'Club Andes', abbreviation: 'AND', score: 1 },
        { entrantId: 'entrant-away', name: 'Deportivo Sur', abbreviation: 'SUR', score: 0 },
      ],
    },
  ],
};

const enrichedMatchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'round-robin',
  matchNumber: 1,
  round: 1,
  status: 'live',
  homeEntrantId: 'entrant-home',
  homeName: 'Club Andes',
  homeAbbreviation: 'AND',
  homeScore: 1,
  awayEntrantId: 'entrant-away',
  awayName: 'Deportivo Sur',
  awayAbbreviation: 'SUR',
  awayScore: 0,
  schedulePublished: true,
  officials: [],
  rosters: {
    home: [{ personId: 'person-1', number: 9, name: 'Julián Pérez', onField: true }],
    away: [{ personId: 'person-2', number: 4, name: 'Nicolás Ruiz', onField: true }],
  },
  timeline: [
    {
      eventId: 'event-1',
      definitionCode: 'goal',
      label: 'Goal — Julián Pérez',
      occurredAt: '2026-09-24T18:12:00.000Z',
      sequence: 1,
      side: 'entrant-home',
      personId: 'person-1',
      payload: {},
    },
    {
      eventId: 'event-2',
      definitionCode: 'card',
      label: 'Yellow card',
      occurredAt: '2026-09-24T18:34:00.000Z',
      sequence: 2,
      side: 'entrant-away',
      personId: 'person-2',
      payload: {},
    },
  ],
};

const emptyMatchReport = { ...enrichedMatchReport, timeline: [] };

let apiServer: Server;
let currentMatchReport: typeof enrichedMatchReport;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/live`) {
      res.end(JSON.stringify(live));
      return;
    }
    if (path === `${BASE}/stages/1/matches/1`) {
      res.end(JSON.stringify(currentMatchReport));
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

test.describe('OpenSpec 0270 TV match view event ticker', () => {
  test('shows the match’s recorded goal and card events alongside the score', async ({ page }) => {
    currentMatchReport = enrichedMatchReport;
    await page.goto(TV_MATCH_PATH);

    const ticker = page.getByRole('list', { name: 'Match events' });
    await expect(ticker).toBeVisible();
    await expect(ticker.getByText('Goal — Julián Pérez')).toBeVisible();
    await expect(ticker.getByText('Yellow card')).toBeVisible();
    await expect(ticker.getByText('Home', { exact: true })).toBeVisible();
    await expect(ticker.getByText('Away', { exact: true })).toBeVisible();

    // Humanized, not a raw ISO-8601 string (matches the rest of the public surface, openspec 0269).
    await expect(page.getByText('2026-09-24T18:12:00.000Z')).toHaveCount(0);
  });

  test('shows no ticker section for a match with no recorded events', async ({ page }) => {
    currentMatchReport = emptyMatchReport;
    await page.goto(TV_MATCH_PATH);

    await expect(page.getByRole('list', { name: 'Match events' })).toHaveCount(0);
  });
});
