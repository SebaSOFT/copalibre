import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

/**
 * The public matches view (openspec 0172): a flat, filterable card grid of a
 * tournament's matches, server-rendered so the default and every
 * state-filtered view work with scripting off. The deciding-factor line is
 * deliberately a one-line summary here — the full comparator trace only ever
 * reaches the authorized control-web equivalent, proven separately in
 * `e2e/control-matches-view.spec.ts`.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

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

const finalizedMatch = {
  matchId: '00000000-0000-7000-8000-000000000020',
  stageNumber: 1,
  matchNumber: 3,
  status: 'final',
  round: 1,
  homeName: 'Club Andes',
  homeScore: 2,
  awayName: 'Deportivo Sur',
  awayScore: 1,
  zoneName: 'Zona Norte',
  groupName: 'Grupo A',
  homePosition: 1,
  awayPosition: 2,
  decidingFactor: 'head-to-head goal difference',
};

const liveMatch = {
  matchId: '00000000-0000-7000-8000-000000000021',
  stageNumber: 1,
  matchNumber: 4,
  status: 'live',
  round: 1,
  homeName: 'Talleres',
  homeScore: 1,
  awayName: 'Independiente',
  awayScore: 1,
  clockSeconds: 2145,
  venueName: 'Estadio Central',
  latestEvent: { label: 'Goal — Talleres', occurredAt: '2026-08-28T20:15:00.000Z' },
};

let apiServer: Server;

test.beforeAll(async () => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path, query] = (req.url ?? '').split('?');
    if (path === `${TOURNAMENT}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${TOURNAMENT}/matches-view`) {
      const state = new URLSearchParams(query).get('state');
      const matches =
        state === 'live'
          ? [liveMatch]
          : state === 'final'
            ? [finalizedMatch]
            : [finalizedMatch, liveMatch];
      res.end(JSON.stringify({ matches }));
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

const matchesPath = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/matches`;

test('shows every match with venue, clock, and a one-line deciding-factor summary — no full trace', async ({
  page,
}) => {
  await page.goto(matchesPath);

  await expect(page.getByText('Club Andes', { exact: true })).toBeVisible();
  await expect(page.getByText('Talleres', { exact: true })).toBeVisible();
  await expect(page.getByText('Estadio Central')).toBeVisible();
  await expect(page.getByText('Decided by: head-to-head goal difference')).toBeVisible();

  // The public card never carries the internal comparator trace lines.
  await expect(page.getByText(/ahead by|behind by/)).toHaveCount(0);
  await expect(page.getByText('Full standings comparator trace')).toHaveCount(0);
});

test('the Live filter link narrows the server-rendered list with scripting off', async ({
  page,
  context,
}) => {
  await context.route('**/*.js', (route) => route.abort());
  await page.goto(matchesPath);

  await expect(page.getByText('Club Andes', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Live' }).click();

  await expect(page.getByText('Talleres', { exact: true })).toBeVisible();
  await expect(page.getByText('Club Andes', { exact: true })).toHaveCount(0);
});
