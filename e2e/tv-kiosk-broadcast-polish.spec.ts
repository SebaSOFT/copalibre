import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The venue kiosk of a finished tournament: the header names the day it ended rather than ticking a
 * clock, no machine timestamp reaches the screen, every route keeps its bottom margin, each view
 * shows what it is named for, and a pinned match is found by its ordinal within the stage — the
 * same one the public match route uses — however many matches share the persisted number 1.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TV = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const ZONE = 'America/Argentina/San_Juan';
const MATCHES = 36;

const club = (ordinal: number, side: 'A' | 'B') => `Club ${ordinal}${side}`;
const abbreviation = (ordinal: number, side: 'A' | 'B') => `C${ordinal}${side}`;
const kickoff = (ordinal: number) =>
  new Date(Date.UTC(2025, 10, 1, 12, 0) + ordinal * 3_600_000).toISOString();

/** One stage of thirty-six finished matches; every one carries `matches.number = 1`. */
const overviewMatches = Array.from({ length: MATCHES }, (_, index) => {
  const ordinal = index + 1;
  return {
    matchId: `match-${ordinal}`,
    matchNumber: 1,
    stageOrdinal: ordinal,
    stageNumber: 1,
    round: Math.ceil(ordinal / 12),
    status: 'final',
    homeEntrantId: `home-${ordinal}`,
    homeName: club(ordinal, 'A'),
    homeAbbreviation: abbreviation(ordinal, 'A'),
    homeScore: ordinal % 7,
    awayEntrantId: `away-${ordinal}`,
    awayName: club(ordinal, 'B'),
    awayAbbreviation: abbreviation(ordinal, 'B'),
    awayScore: 1,
    scheduledAt: kickoff(ordinal),
  };
});

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  organizationTimeZone: ZONE,
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  seasonName: '2026',
  status: 'finished',
  ruleset: {},
  clubs: [],
  matches: overviewMatches,
  winners: [
    {
      champion: { entrantId: 'home-1', name: club(1, 'A'), abbreviation: abbreviation(1, 'A') },
      champions: [{ entrantId: 'home-1', name: club(1, 'A'), abbreviation: abbreviation(1, 'A') }],
    },
  ],
  standingsPreview: [
    {
      rank: 1,
      entrantId: 'home-1',
      name: club(1, 'A'),
      abbreviation: abbreviation(1, 'A'),
      sharedRank: false,
      statistics: { played: 3, points: 9 },
    },
  ],
};

const matchesView = {
  matches: overviewMatches.map((match) => ({
    matchId: match.matchId,
    stageNumber: 1,
    matchNumber: match.stageOrdinal,
    round: match.round,
    status: 'final',
    homeName: match.homeName,
    homeAbbreviation: match.homeAbbreviation,
    homeScore: match.homeScore,
    awayName: match.awayName,
    awayAbbreviation: match.awayAbbreviation,
    awayScore: match.awayScore,
    zoneName: 'Grupos',
    groupName: `Grupo ${match.round}`,
  })),
};

const report = (ordinal: number) => ({
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  stageNumber: 1,
  stageFormat: 'round-robin',
  matchNumber: ordinal,
  round: 1,
  status: 'final',
  homeEntrantId: `home-${ordinal}`,
  homeName: club(ordinal, 'A'),
  homeScore: ordinal % 7,
  awayEntrantId: `away-${ordinal}`,
  awayName: club(ordinal, 'B'),
  awayScore: 1,
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
});

const requested: string[] = [];
let server: Server;
test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    requested.push(path ?? '');
    if (path === `${BASE}/overview`) res.end(JSON.stringify(overview));
    else if (path === `${BASE}/live`) res.end(JSON.stringify({ matches: [] }));
    else if (path === `${BASE}/matches-view`) res.end(JSON.stringify(matchesView));
    else if (path === `${BASE}/stages/1/bracket`)
      res.end(JSON.stringify({ format: 'round-robin', zones: [] }));
    else {
      const ordinal = Number(path?.match(/\/stages\/1\/matches\/(\d+)$/)?.[1]);
      if (Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= MATCHES) {
        res.end(JSON.stringify(report(ordinal)));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('the pinned route finds match 34 of stage 1 by its ordinal', async ({ page }) => {
  await page.goto(`${TV}/stages/1/matches/34?lang=es`);

  const spotlight = page.getByTestId('tv-match-spotlight');
  await expect(spotlight).toContainText(club(34, 'A'));
  await expect(spotlight).toContainText(club(34, 'B'));
  await expect(spotlight).toContainText('Partido 34');
  // A finished tournament still shows the match, not the champion recap.
  await expect(page.getByTestId('tv-champion-panel')).toHaveCount(0);
});

test('a match beyond the stage is reported as missing instead of showing another view', async ({
  page,
}) => {
  await page.goto(`${TV}/stages/1/matches/99?lang=es`);

  await expect(page.getByTestId('tv-match-not-found')).toContainText('Este partido no existe');
  await expect(page.getByTestId('tv-match-spotlight')).toHaveCount(0);
  await expect(page.getByTestId('tv-champion-panel')).toHaveCount(0);
});

test('the standings view shows the standings, not the recap of a finished tournament', async ({
  page,
}) => {
  await page.goto(`${TV}?view=standings&lang=es`);

  await expect(page.locator('.tv-standings-table')).toBeVisible();
  await expect(page.getByTestId('tv-champion-panel')).toHaveCount(0);
  await expect(page.locator('.tv-focal-panel')).toHaveCount(0);
});

test('the header of a finished tournament names the day it ended and runs no clock', async ({
  page,
}) => {
  await page.goto(`${TV}?lang=es`);

  const clocks = page.locator('.tv-scorebug__clock');
  await expect(clocks).toHaveCount(1);
  // The last kick-off, in the organization's zone: 2 November 2025, 23:00 in San Juan.
  await expect(clocks).toHaveAttribute('data-time', /Finalizado el 2 de noviembre de 2025/);
  await expect(page.locator('.tv-scorebug__clock-label')).toHaveCount(0);
});

test('no machine timestamp reaches the screen, the ticker included', async ({ page }) => {
  await page.goto(`${TV}?lang=es`);
  await expect(page.locator('.cl-ticker__meta').first()).toBeVisible();

  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  // The kick-off reads as a date and a time in the organization's zone: 12:00Z + 1 h = 10:00.
  await expect(page.locator('.cl-ticker__meta').first()).toContainText('1-nov 10:00');
});

test('the dashboard and the pinned route keep the same bottom margin', async ({ page }) => {
  const bottomGap = async (path: string): Promise<number> => {
    await page.goto(path);
    await expect(page.locator('.tv-root-container')).toBeVisible();
    const box = await page.locator('.tv-main-stage').boundingBox();
    if (box === null) throw new Error('the main stage should have a layout box');
    return Math.round(1080 - (box.y + box.height));
  };

  const dashboard = await bottomGap(`${TV}?lang=es`);
  const pinned = await bottomGap(`${TV}/stages/1/matches/34?lang=es`);

  // The dashboard carries a ticker above it and the pinned route does not; the margin below is one.
  expect(dashboard).toBeGreaterThanOrEqual(40);
  expect(Math.abs(dashboard - pinned)).toBeLessThanOrEqual(2);
});

test('the kiosk refreshes the live matches from an address that is served', async ({ page }) => {
  await page.clock.install();
  const refresh = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `${BASE}/live`,
  );
  await page.goto(`${TV}?lang=es`);
  await page.clock.runFor(16_000);

  expect((await refresh).status()).toBe(200);
  expect(requested).not.toContain(`/api${BASE}/live`);
});
