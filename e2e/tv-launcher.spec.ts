import { createServer, type Server } from 'node:http';
import { expect, test } from './support/tv-ready.js';

/**
 * The TV display launcher: its labels follow the language select with no reload, stages carry their
 * names, matches are grouped and identified, the overlay may pin a match of its own, and the form
 * wears the broadcast typography rather than the browser's default serif.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
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
    if (path === '/api/organizations') {
      res.end(
        JSON.stringify([
          { organizationId: 'o1', alias: ORGANIZATION, name: 'Liga Mendocina' },
          { organizationId: 'o2', alias: 'liga-sur', name: 'Liga Sur', primaryLanguage: 'es' },
        ]),
      );
    } else if (path === `/api/organizations/${ORGANIZATION}/public/tournaments`) {
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
  await page.goto(`${LAUNCHER}&mode=overlay-lower&bg=court`);
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
  await expect(page.locator('[data-launcher-view]')).toHaveValue('overlay-lower');
  await expect(page.locator('[data-launcher-background]')).toHaveValue('court');
  await expect(page.getByRole('link', { name: /Lanzar pantalla TV/ })).toHaveAttribute(
    'href',
    /lang=es/,
  );
  expect(new URL(page.url()).searchParams.get('lang')).toBe('es');
});

test('starts on the language of the selected organization', async ({ page }) => {
  await page.goto('/tv?organization=liga-sur');
  await expect(page.locator('[data-launcher-language]')).toHaveValue('es');

  await page.goto('/tv?organization=liga-sur&lang=de');
  await expect(page.locator('[data-launcher-language]')).toHaveValue('de');
});

test('stages show their names and matches are grouped with the competition, round, sides, court, state and identifier', async ({
  page,
}) => {
  await page.goto(`${LAUNCHER}&view=match&lang=es`);

  await expect(page.locator('[data-launcher-stage]').locator('option')).toHaveText([
    '1 · Fase de grupos',
    '2 · Copas',
  ]);
  // Every match is over, so the stage the launcher opens on is the last one.
  await expect(page.locator('[data-launcher-stage]')).toHaveValue('2');
  const match = page.locator('[data-launcher-match]');
  await expect(match.locator('optgroup')).toHaveCount(1);
  await expect(match.locator('option[value]:not([value=""])')).toHaveText([
    'Copa Oro · Ronda 1 · Andes — River · Finalizado · #1',
  ]);

  await page.locator('[data-launcher-stage]').selectOption('1');
  await expect(match.locator('optgroup')).toHaveCount(2);
  await expect(match.locator('optgroup').first()).toHaveAttribute('label', 'Grupos · Grupo A');
  await expect(match.locator('option[value]:not([value=""])')).toHaveText([
    'Grupo A · Ronda 1 · Talleres — Andes · Cancha 1 · Finalizado · #1',
    'Grupo A · Ronda 2 · Talleres — Boca · Cancha 1 · Finalizado · #3',
    'Grupo B · Ronda 1 · Boca — River · Cancha 2 · Finalizado · #2',
  ]);
});

test('the pinned match view launches that match', async ({ page }) => {
  await page.goto(`${LAUNCHER}&view=match`);
  await page.locator('[data-launcher-stage]').selectOption('1');
  await page.locator('[data-launcher-match]').selectOption('3');

  await expect(page.getByRole('link', { name: /Launch TV display/ })).toHaveAttribute(
    'href',
    new RegExp(`/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/matches/3\\?`),
  );
});

test('every view is offered with its one-line description, and an overlay starts transparent', async ({
  page,
}) => {
  await page.goto(LAUNCHER);
  await expect(page.locator('[data-launcher-view] option')).toHaveCount(10);
  await expect(page.locator('[data-launcher-background]')).toHaveValue('discipline');

  await page.locator('[data-launcher-view]').selectOption('overlay-lower');
  await expect(page.locator('[data-view-description]')).toContainText('Bottom band');
  await expect(page.locator('[data-launcher-background]')).toHaveValue('transparent');
  await expect(page.getByRole('link', { name: /Launch TV display/ })).toHaveAttribute(
    'href',
    /bg=transparent/,
  );

  // Once the operator picks a background, changing the view keeps it.
  await page.locator('[data-launcher-background]').selectOption('neutral');
  await page.locator('[data-launcher-view]').selectOption('kiosk');
  await expect(page.locator('[data-launcher-background]')).toHaveValue('neutral');
});

test('the overlay asks for a match or a court, and the link carries whichever it is', async ({
  page,
}) => {
  await page.goto(LAUNCHER);
  await expect(page.locator('[data-match-fields]')).toBeHidden();

  await page.locator('[data-launcher-view]').selectOption('overlay-scorebug');
  await expect(page.locator('[data-match-fields]')).toBeVisible();
  await expect(page.locator('[data-court-field]')).toBeVisible();
  // Nothing is pinned and no court is followed: the overlay has nothing to show yet.
  await expect(page.locator('[data-nothing-to-show]')).toBeVisible();
  const launch = page.getByRole('link', { name: /Launch TV display/ });
  await expect(launch).not.toHaveAttribute('href', /court=/);
  await expect(launch).not.toHaveAttribute('href', /stages/);

  await page.locator('[data-launcher-court]').selectOption('Cancha 1');
  await expect(launch).toHaveAttribute('href', /mode=overlay-scorebug&court=Cancha\+1/);
  await expect(page.locator('[data-nothing-to-show]')).toBeHidden();

  await page.locator('[data-launcher-court]').selectOption('Cancha 2');
  await expect(launch).toHaveAttribute('href', /court=Cancha\+2/);

  // A pinned match replaces the court: choosing one clears the other.
  await page.locator('[data-launcher-stage]').selectOption('1');
  await page.locator('[data-launcher-match]').selectOption('2');
  await expect(page.locator('[data-launcher-court]')).toHaveValue('');
  await expect(launch).toHaveAttribute('href', /stages\/1\/matches\/2\?.*mode=overlay-scorebug/);
  await expect(launch).not.toHaveAttribute('href', /court=/);

  await page.locator('[data-launcher-court]').selectOption('Cancha 1');
  await expect(page.locator('[data-launcher-match]')).toHaveValue('');
  await expect(launch).toHaveAttribute('href', /court=Cancha\+1/);
});

test('the final link is copied to the clipboard and announced, and the preview frame shows it', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${LAUNCHER}&mode=overlay-lower&lang=en`);

  const field = page.locator('[data-launcher-url]');
  await expect(field).toHaveText(
    /\/tv\/liga-mendocina\/tournaments\/apertura-2026\?.*mode=overlay-lower/,
  );
  const preview = page.locator('[data-launcher-preview]');
  expect(await preview.getAttribute('src')).toBe(await field.textContent());

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await field.textContent());
});

test('the match list view and the standings view name themselves in the address', async ({
  page,
}) => {
  await page.goto(LAUNCHER);
  const launch = page.getByRole('link', { name: /Launch TV display/ });

  await page.locator('[data-launcher-view]').selectOption('matches');
  await expect(launch).toHaveAttribute('href', /view=matches/);
  await expect(page.locator('[data-match-fields]')).toBeHidden();
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
  await page.goto(`${LAUNCHER}&mode=overlay-lower&lang=es`);
  await expect(page.getByRole('heading', { name: 'Lanzador de pantalla TV' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: /Lanzar pantalla TV/ })).toBeVisible();
});

test('a saved preset restores the language, the view it always meant and the court background', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'copalibre.tv.launcher_preset',
      JSON.stringify({
        organization: 'liga-mendocina',
        tournament: 'apertura-2026',
        view: 'dashboard',
        background: 'court',
        language: 'es',
      }),
    );
  });
  await page.goto('/tv');
  // The saved language applies to the labels, so the launcher opens in Spanish.
  await expect(page.getByRole('heading', { name: 'Lanzador de pantalla TV' })).toBeVisible();
  await expect(page.locator('[data-launcher-language]')).toHaveValue('es');
  // A preset saved as the rotating dashboard restores as the kiosk view it always meant.
  await expect(page.locator('[data-launcher-view]')).toHaveValue('kiosk');
  await expect(page.locator('[data-launcher-background]')).toHaveValue('court');
  await expect(page.locator('html')).toHaveAttribute('data-tv-background', 'court');
});

test('a stage the tournament does not have is not kept: the launcher opens on its default stage', async ({
  page,
}) => {
  await page.goto(`${LAUNCHER}&view=match&stage=9&match=1&lang=en`);
  await expect(page.locator('[data-launcher-stage]')).toHaveValue('2');
});

test('a requested match of another stage pins nothing: the launcher opens with no match and no address to it', async ({
  page,
}) => {
  await page.goto(`${LAUNCHER}&view=match&stage=9&match=1&lang=en`);
  await expect(page.locator('[data-launcher-stage]')).toHaveValue('2');
  await expect(page.locator('[data-launcher-match]')).toHaveValue('');
  const launch = page.getByRole('link', { name: /Launch TV display/ });
  await expect(launch).toHaveAttribute('aria-disabled', 'true');
  // With no match the pinned view names no page: no address to copy and nothing to preview.
  await expect(page.locator('[data-launcher-url]')).toHaveText('');
  await expect(page.locator('[data-launcher-copy]')).toBeDisabled();
  expect(await page.locator('[data-launcher-preview]').getAttribute('src')).toBeNull();
});

test('picking a match in the pinned view gives it an address, a copy control and a preview', async ({
  page,
}) => {
  await page.goto(`${LAUNCHER}&view=match&lang=en`);
  await expect(page.locator('[data-launcher-copy]')).toBeDisabled();
  await page.locator('[data-launcher-stage]').selectOption('1');
  await page.locator('[data-launcher-match]').selectOption('3');
  await expect(page.locator('[data-launcher-url]')).toContainText('/stages/1/matches/3');
  await expect(page.locator('[data-launcher-copy]')).toBeEnabled();
  await expect(page.locator('[data-launcher-preview]')).toHaveAttribute(
    'src',
    /\/stages\/1\/matches\/3/,
  );
});

test('after a saved preset restores an overlay, moving to another overlay mode keeps the pinned match', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'copalibre.tv.launcher_preset',
      JSON.stringify({
        organization: 'liga-mendocina',
        tournament: 'apertura-2026',
        view: 'overlay-scorebug',
        background: 'transparent',
        language: 'en',
        stage: 1,
        match: 2,
      }),
    );
  });
  // The saved preset restores only on a bare launcher address, so this one names no organization.
  await page.goto('/tv');
  await expect(page.locator('[data-launcher-view]')).toHaveValue('overlay-scorebug');
  await expect(page.locator('[data-launcher-match]')).toHaveValue('2');

  await page.locator('[data-launcher-view]').selectOption('overlay-full');
  await expect(page.locator('[data-launcher-match]')).toHaveValue('2');
  await expect(page.getByRole('link', { name: /Launch TV display/ })).toHaveAttribute(
    'href',
    /stages\/1\/matches\/2\?.*mode=overlay-full/,
  );
});

test('a court the tournament does not have is not kept: the overlay follows no court', async ({
  page,
}) => {
  await page.goto(`${LAUNCHER}&view=overlay-lower&court=${encodeURIComponent('Cancha 9')}&lang=en`);
  await expect(page.locator('[data-launcher-court]')).toHaveValue('');
  await expect(page.getByRole('link', { name: /Launch TV display/ })).not.toHaveAttribute(
    'href',
    /court=/,
  );
  await expect(page.locator('[data-nothing-to-show]')).toBeVisible();
});
