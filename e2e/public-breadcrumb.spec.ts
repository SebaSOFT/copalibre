import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const MATCH_PATH = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/2/matches/3`;

const matchReport = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  stageNumber: 2,
  stageFormat: 'round-robin',
  matchNumber: 3,
  round: 1,
  status: 'final',
  homeName: 'Club Andes',
  homeAbbreviation: 'AND',
  homeScore: 2,
  awayName: 'Deportivo Sur',
  awayAbbreviation: 'SUR',
  awayScore: 1,
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  status: 'live',
  matches: [],
  clubs: [],
  ruleset: {},
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${BASE}/stages/2/matches/3`) {
      res.end(JSON.stringify(matchReport));
      return;
    }
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/completion`) {
      res.end(
        JSON.stringify({
          totalMatches: 0,
          resolvedMatches: 0,
          liveMatches: 0,
          scheduledMatches: 0,
          finalizedMatches: 0,
          forfeitedMatches: 0,
          stages: [],
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

test.describe('public breadcrumb', () => {
  test('a Spanish match page links back up the hierarchy and marks the match as current', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(MATCH_PATH);

    const trail = page.getByRole('navigation', { name: 'Ruta de navegación' });
    await expect(trail.getByRole('link')).toHaveCount(4);
    await expect(trail.getByRole('link', { name: 'Liga Mendocina' })).toHaveAttribute(
      'href',
      `/es/${ORGANIZATION}`,
    );
    await expect(trail.getByRole('link', { name: 'Apertura 2026' })).toHaveAttribute(
      'href',
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}`,
    );
    await expect(trail.getByRole('link', { name: 'Partidos' })).toHaveAttribute(
      'href',
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}/matches?stageNumber=2`,
    );
    await expect(trail.getByRole('link', { name: 'Fase 2' })).toHaveAttribute(
      'href',
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/2`,
    );
    await expect(trail.locator('[aria-current="page"]')).toHaveText('Ronda 1 · Partido 3');

    // The English position tag is gone; the state tag stays, in the page language.
    await expect(page.getByText('Stage 2 · Round 1 · Match 3')).toHaveCount(0);
    await expect(page.locator('.cl-match-hero__meta')).toContainText('FINALIZADO');
  });

  test('following the trail reaches the tournament page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(MATCH_PATH);

    await page
      .getByRole('navigation', { name: 'Ruta de navegación' })
      .getByRole('link', { name: 'Apertura 2026' })
      .click();

    await expect(page).toHaveURL(new RegExp(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT}$`));
    const trail = page.getByRole('navigation', { name: 'Ruta de navegación' });
    await expect(trail.locator('[aria-current="page"]')).toHaveText('Apertura 2026');
  });

  test('a narrow viewport keeps the first and last two levels behind an ellipsis link', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(MATCH_PATH);

    const trail = page.getByRole('navigation', { name: 'Ruta de navegación' });
    await expect(trail.getByRole('link', { name: 'Liga Mendocina' })).toBeVisible();
    await expect(trail.getByRole('link', { name: 'Apertura 2026' })).toBeHidden();
    await expect(trail.getByRole('link', { name: 'Partidos' })).toBeHidden();
    await expect(trail.getByRole('link', { name: 'Fase 2' })).toBeVisible();
    await expect(trail.locator('[aria-current="page"]')).toBeVisible();
    await expect(trail.getByRole('link', { name: 'Mostrar los niveles ocultos' })).toHaveAttribute(
      'href',
      `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}/matches?stageNumber=2`,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
