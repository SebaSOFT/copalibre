import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The TV display launcher: its labels follow the language select with no reload, stages carry their
 * names, matches are grouped and identified, the overlay may pin a match of its own, and the form
 * wears the broadcast typography rather than the browser's default serif.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const LAUNCHER = `/tv?organization=${ORGANIZATION}&tournament=${TOURNAMENT}`;

const row = (
  venue: string | undefined,
  stageNumber: number,
  ordinal: number,
  round: number,
  zone: string,
  group: string | undefined,
  home: string,
  away: string,
) => ({
  matchId: `m-${stageNumber}-${ordinal}`,
  stageNumber,
  matchNumber: ordinal,
  round,
  status: 'final',
  homeName: home,
  awayName: away,
  zoneName: zone,
  ...(group === undefined ? {} : { groupName: group }),
  ...(venue === undefined ? {} : { venueName: venue }),
});

const matchesView = {
  matches: [
    row('Cancha 1', 1, 1, 1, 'Grupos', 'Grupo A', 'Talleres', 'Andes'),
    row('Cancha 2', 1, 2, 1, 'Grupos', 'Grupo B', 'Boca', 'River'),
    row('Cancha 1', 1, 3, 2, 'Grupos', 'Grupo A', 'Talleres', 'Boca'),
    row(undefined, 2, 1, 1, 'Copa Oro', undefined, 'Andes', 'River'),
  ],
};

let server: Server;
test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === '/organizations') {
      res.end(
        JSON.stringify([{ organizationId: 'o1', alias: ORGANIZATION, name: 'Liga Mendocina' }]),
      );
    } else if (path === `/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          organizationName: 'Liga Mendocina',
          clubs: [],
          tournaments: [
            {
              alias: TOURNAMENT,
              name: 'Apertura 2026',
              status: 'in-progress',
              discipline: { descriptorId: 'football' },
            },
          ],
        }),
      );
    } else if (path === `${BASE}/overview`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          organizationName: 'Liga Mendocina',
          tournamentAlias: TOURNAMENT,
          tournamentName: 'Apertura 2026',
          seasonName: '2026',
          matches: [],
          clubs: [],
          ruleset: {},
        }),
      );
    } else if (path === `${BASE}/matches-view`) {
      res.end(JSON.stringify(matchesView));
    } else if (path === `${BASE}/completion`) {
      res.end(
        JSON.stringify({
          stages: [
            { stageNumber: 1, stageName: 'Fase de grupos' },
            { stageNumber: 2, stageName: 'Copas' },
          ],
        }),
      );
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('choosing a language rewrites the launcher’s labels without reloading and keeps the other choices', async ({
  page,
}) => {
  await page.goto(`${LAUNCHER}&view=overlay&bg=court`);
  await expect(page.getByRole('heading', { name: 'TV display launcher' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __kept: boolean }).__kept = true;
  });

  await page.locator('[data-launcher-language]').selectOption('es');

  await expect(page.getByRole('heading', { name: 'Lanzador de pantalla TV' })).toBeVisible();
  await expect(page.locator('label').filter({ hasText: 'Organización' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Lanzar pantalla TV/ })).toBeVisible();
  // Same page, same choices: the script never reloaded and the other selections stand.
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
  await expect(page.locator('[data-launcher-view]')).toHaveValue('overlay');
  await expect(page.locator('[data-launcher-background]')).toHaveValue('court');
  await expect(page.getByRole('link', { name: /Lanzar pantalla TV/ })).toHaveAttribute(
    'href',
    /lang=es/,
  );
  expect(new URL(page.url()).searchParams.get('lang')).toBe('es');
});

test('stages show their names and matches are grouped with round, names and identifier', async ({
  page,
}) => {
  await page.goto(`${LAUNCHER}&view=match&lang=es`);

  await expect(page.locator('[data-launcher-stage]').locator('option')).toHaveText([
    '1 · Fase de grupos',
    '2 · Copas',
  ]);
  const match = page.locator('[data-launcher-match]');
  await expect(match.locator('optgroup')).toHaveCount(2);
  await expect(match.locator('optgroup').first()).toHaveAttribute('label', 'Grupos · Grupo A');
  await expect(match.locator('option:not([disabled])')).toHaveText([
    'Ronda 1 · Talleres — Andes · #1',
    'Ronda 2 · Talleres — Boca · #3',
    'Ronda 1 · Boca — River · #2',
  ]);

  await page.locator('[data-launcher-stage]').selectOption('2');
  await expect(match.locator('option:not([disabled])')).toHaveText([
    'Ronda 1 · Andes — River · #1',
  ]);
});

test('the pinned match view launches that match', async ({ page }) => {
  await page.goto(`${LAUNCHER}&view=match`);
  await page.locator('[data-launcher-match]').selectOption('3');

  await expect(page.getByRole('link', { name: /Launch TV display/ })).toHaveAttribute(
    'href',
    new RegExp(`/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/matches/3\\?`),
  );
});

test('the overlay view asks for a match or a court, and the link carries it', async ({ page }) => {
  await page.goto(LAUNCHER);
  await expect(page.locator('[data-launcher-match]')).toBeHidden();

  await page.locator('[data-launcher-view]').selectOption('overlay');
  await expect(page.locator('[data-launcher-match]')).toBeVisible();
  const launch = page.getByRole('link', { name: /Launch TV display/ });
  // An overlay starts on a court when the tournament has any: it follows that court's live match.
  await expect(page.locator('[data-launcher-match] optgroup').first()).toHaveAttribute(
    'label',
    'Follow the live match of a court',
  );
  await expect(page.locator('[data-launcher-match]')).toHaveValue('court:Cancha 1');
  await expect(launch).toHaveAttribute('href', /mode=overlay&court=Cancha\+1/);
  await expect(launch).not.toHaveAttribute('href', /stages/);

  await page.locator('[data-launcher-match]').selectOption('court:Cancha 2');
  await expect(launch).toHaveAttribute('href', /court=Cancha\+2/);

  // A pinned match replaces the court: two overlays, two matches.
  await page.locator('[data-launcher-match]').selectOption('2');
  await expect(launch).toHaveAttribute('href', /stages\/1\/matches\/2\?.*mode=overlay/);
  await expect(launch).not.toHaveAttribute('href', /court=/);
  await page.locator('[data-launcher-match]').selectOption('3');
  await expect(launch).toHaveAttribute('href', /stages\/1\/matches\/3\?.*mode=overlay/);
});

test('the match list view and the standings view name themselves in the address', async ({
  page,
}) => {
  await page.goto(LAUNCHER);
  const launch = page.getByRole('link', { name: /Launch TV display/ });

  await page.locator('[data-launcher-view]').selectOption('matches');
  await expect(launch).toHaveAttribute('href', /view=matches/);
  await expect(page.locator('[data-launcher-match]')).toBeHidden();
  await page.locator('[data-launcher-view]').selectOption('standings');
  await expect(launch).toHaveAttribute('href', /view=standings/);
});

test('the launcher wears the broadcast typography instead of the browser default', async ({
  page,
}) => {
  await page.goto(LAUNCHER);

  const faces = await page.evaluate(() => {
    const face = (selector: string): string =>
      getComputedStyle(document.querySelector(selector) as Element).fontFamily;
    return { heading: face('h1'), select: face('select'), launch: face('[data-launcher-link]') };
  });
  for (const family of Object.values(faces)) {
    expect(family.toLowerCase()).not.toMatch(/^"?(times|serif)/);
    expect(family.length).toBeGreaterThan(0);
  }
  expect(faces.heading).not.toBe(faces.select);
});

test('captures the launcher at desktop and phone size', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${LAUNCHER}&view=overlay&lang=es`);
  await expect(page.getByRole('heading', { name: 'Lanzador de pantalla TV' })).toBeVisible();
  await page.screenshot({ path: 'docs/assets/screenshots/tv-launcher-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: /Lanzar pantalla TV/ })).toBeVisible();
  await page.screenshot({ path: 'docs/assets/screenshots/tv-launcher-mobile.png' });
});
