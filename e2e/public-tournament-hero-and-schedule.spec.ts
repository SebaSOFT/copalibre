import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * Openspec 0245: the tournament overview's discipline hero backdrop and its
 * spacing from the progress figure below it. The consolidated match-schedule
 * filter bar's own zone/group facet behavior is covered alongside the rest
 * of the matches view in `e2e/public-matches-view.spec.ts`.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const PUBLIC_TOURNAMENT_PATH = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

const sampleCompletion = {
  totalMatches: 4,
  resolvedMatches: 2,
  liveMatches: 0,
  scheduledMatches: 2,
  finalizedMatches: 2,
  forfeitedMatches: 0,
  stages: [],
};

const overviewWithBackground = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [],
  clubs: [],
  ruleset: {},
  disciplineImages: [{ key: 'modules/football/1.0.0/football-01.jpg' }],
};

// Two zones, one group each — the facet-switching scenario `resolveTournamentWinners`'s own bug
// report was shaped like (openspec 0245 design.md decision 3).
const goldMatch = {
  matchId: '00000000-0000-7000-8000-000000000030',
  stageNumber: 1,
  matchNumber: 1,
  status: 'final',
  round: 3,
  homeName: 'Club Andes',
  homeScore: 2,
  awayName: 'Deportivo Sur',
  awayScore: 1,
  zoneName: 'Copa de Oro',
  groupName: 'Grupo A',
};
const silverMatch = {
  matchId: '00000000-0000-7000-8000-000000000031',
  stageNumber: 1,
  matchNumber: 1,
  status: 'final',
  round: 3,
  homeName: 'River',
  homeScore: 3,
  awayName: 'Boca',
  awayScore: 0,
  zoneName: 'Copa de Plata',
  groupName: 'Grupo B',
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${TOURNAMENT}/overview`) {
      res.end(JSON.stringify(overviewWithBackground));
      return;
    }
    if (path === `${TOURNAMENT}/completion`) {
      res.end(JSON.stringify(sampleCompletion));
      return;
    }
    if (path === `${TOURNAMENT}/matches-view`) {
      res.end(JSON.stringify({ matches: [goldMatch, silverMatch] }));
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

test('0245: the hero renders the discipline backdrop image behind its content', async ({
  page,
}) => {
  await page.goto(PUBLIC_TOURNAMENT_PATH);

  const backdrop = page.locator('img.cl-tournament-hero__backdrop');
  await expect(backdrop).toBeAttached();
  await expect(backdrop).toHaveAttribute(
    'src',
    /\/objects\/discipline-background-image\?key=modules%2Ffootball%2F1\.0\.0%2Ffootball-01\.jpg/,
  );

  // The hero's own content (title, live badge) stays above the backdrop.
  await expect(page.getByRole('heading', { name: 'Apertura 2026' })).toBeVisible();
});

test('0245: the progress figure keeps a 24px gap from the hero above it', async ({ page }) => {
  await page.goto(PUBLIC_TOURNAMENT_PATH);

  const marginTop = await page
    .locator('.cl-completion-figure')
    .evaluate((el) => getComputedStyle(el).marginTop);
  expect(marginTop).toBe('24px');
});

test('0245: switching the zone facet on the matches page narrows the list and updates the URL', async ({
  page,
  context,
}) => {
  // Scripting off: every filtered view is server-rendered, like the state filter.
  await context.route('**/*.js', (route) => route.abort());
  await page.goto(`${PUBLIC_TOURNAMENT_PATH}/matches`);

  await expect(page.getByText('Club Andes', { exact: true })).toBeVisible();
  await expect(page.getByText('River', { exact: true })).toBeVisible();

  const zoneNav = page.getByRole('navigation', { name: 'Filter by zone' });
  await expect(zoneNav).toBeVisible();
  await zoneNav.getByRole('link', { name: 'Copa de Plata' }).click();

  await expect(page).toHaveURL(/[?&]zone=Copa\+de\+Plata/);
  await expect(page.getByText('River', { exact: true })).toBeVisible();
  await expect(page.getByText('Club Andes', { exact: true })).toHaveCount(0);

  // Selecting a zone narrows the group facet to that zone's own groups too.
  const groupNav = page.getByRole('navigation', { name: 'Filter by group' });
  await expect(groupNav).toHaveCount(0);
});
