import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The tournament club index and the per-club page: identity and status, the
 * next match, the standing, results, squad and knockout path. Every section
 * is composed server-side, so the page renders with scripting off.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const BASE = `/liga-mendocina/tournaments/${TOURNAMENT_ALIAS}`;
const API = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

const HISPANO_ID = '01936f4a-0a00-7000-8000-000000000001';
const LOMAS_ID = '01936f4a-0a00-7000-8000-000000000002';
const TIRO_ID = '01936f4a-0a00-7000-8000-000000000004';
const UNALIASED_ID = '01936f4a-0a00-7000-8000-000000000003';
const ATLETICO_ID = '01936f4a-0a00-7000-8000-000000000005';

const clubs = [
  {
    clubId: HISPANO_ID,
    name: 'Club Hispano',
    abbreviation: 'HIS',
    alias: 'club-hispano',
    // Held before a rename: links naming it are redirected to `club-hispano`.
    formerAliases: ['hispano-viejo'],
  },
  {
    clubId: LOMAS_ID,
    name: 'Lomas de Rivadavia',
    abbreviation: 'LDR',
    alias: 'lomas-de-rivadavia',
  },
  { clubId: TIRO_ID, name: 'Tiro Federal', abbreviation: 'TIR', alias: 'tiro-federal' },
  { clubId: UNALIASED_ID, name: 'Club Sin Alias', abbreviation: 'SIN' },
  { clubId: ATLETICO_ID, name: 'Atlético Bello', abbreviation: 'ATB', alias: 'atletico-bello' },
];

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  organizationTimeZone: 'America/Argentina/Buenos_Aires',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  stages: [
    { stageNumber: 1, stageName: 'Fase de grupos', format: 'round-robin' },
    { stageNumber: 2, stageName: 'Copa Oro', format: 'single-elimination' },
  ],
  standingsStageNumber: 1,
  matches: [],
  clubs,
  ruleset: {},
};

const finalGroupMatch = (
  matchNumber: number,
  homeClubAlias: string,
  awayClubAlias: string,
  homeScore: number,
  awayScore: number,
  scheduledAt: string,
) => ({
  matchId: `00000000-0000-7000-8000-0000000001${matchNumber.toString().padStart(2, '0')}`,
  stageNumber: 1,
  matchNumber,
  status: 'final',
  round: 1,
  zoneName: 'Zona Norte',
  groupName: 'Grupo A',
  homeName: clubs.find((club) => club.alias === homeClubAlias)?.name,
  homeClubId: clubs.find((club) => club.alias === homeClubAlias)?.clubId,
  homeClubAlias,
  homeScore,
  awayName: clubs.find((club) => club.alias === awayClubAlias)?.name,
  awayClubId: clubs.find((club) => club.alias === awayClubAlias)?.clubId,
  awayClubAlias,
  awayScore,
  scheduledAt,
});

const matches = [
  finalGroupMatch(1, 'club-hispano', 'lomas-de-rivadavia', 2, 1, '2026-11-16T18:00:00.000Z'),
  finalGroupMatch(2, 'tiro-federal', 'club-hispano', 3, 0, '2026-11-18T18:00:00.000Z'),
  {
    matchId: '00000000-0000-7000-8000-000000000201',
    stageNumber: 1,
    matchNumber: 3,
    status: 'upcoming',
    round: 2,
    zoneName: 'Zona Norte',
    groupName: 'Grupo A',
    homeName: 'Club Hispano',
    homeClubId: HISPANO_ID,
    homeClubAlias: 'club-hispano',
    awayName: 'Lomas de Rivadavia',
    awayClubId: LOMAS_ID,
    awayClubAlias: 'lomas-de-rivadavia',
    venueName: 'Aldo Cantoni',
    scheduledAt: '2026-12-01T21:00:00.000Z',
  },
  {
    matchId: '00000000-0000-7000-8000-000000000202',
    stageNumber: 2,
    matchNumber: 34,
    status: 'upcoming',
    round: 2,
    nodeKey: 'SE-R2-M1',
    sourceFinalRound: 3,
    zoneName: 'Copa Oro',
    homeName: 'Club Hispano',
    homeClubId: HISPANO_ID,
    homeClubAlias: 'club-hispano',
    awayName: 'Tiro Federal',
    awayClubId: TIRO_ID,
    awayClubAlias: 'tiro-federal',
    scheduledAt: '2026-12-05T21:00:00.000Z',
  },
  // The final of the same zone: a bracket's deepest round names the rounds before it.
  {
    matchId: '00000000-0000-7000-8000-000000000203',
    stageNumber: 2,
    matchNumber: 35,
    status: 'upcoming',
    round: 3,
    nodeKey: 'SE-R3-M1',
    zoneName: 'Copa Oro',
    scheduledAt: '2026-12-12T21:00:00.000Z',
  },
];

const groupStandings = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  columns: [
    { code: 'name', header: 'Team', format: 'text' },
    { code: 'pj', header: 'PJ', format: 'number' },
    { code: 'points', header: 'Pts', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  promotionBands: [{ label: 'Copa Oro' }, { label: 'Copa Plata' }],
  rows: [
    {
      actorId: HISPANO_ID,
      entrantId: HISPANO_ID,
      clubId: HISPANO_ID,
      clubAlias: 'club-hispano',
      rank: 1,
      sharedRank: false,
      promotionBandLabel: 'Copa Oro',
      promotionBandIndex: 0,
      promotionSeed: 2,
      cells: {
        name: { formatted: 'Club Hispano' },
        pj: { raw: 2, formatted: '2' },
        points: { raw: 6, formatted: '6' },
      },
    },
    {
      actorId: LOMAS_ID,
      entrantId: LOMAS_ID,
      clubId: LOMAS_ID,
      clubAlias: 'lomas-de-rivadavia',
      rank: 2,
      sharedRank: false,
      cells: {
        name: { formatted: 'Lomas de Rivadavia' },
        pj: { raw: 2, formatted: '2' },
        points: { raw: 3, formatted: '3' },
      },
    },
    {
      actorId: TIRO_ID,
      entrantId: TIRO_ID,
      clubId: TIRO_ID,
      clubAlias: 'tiro-federal',
      rank: 3,
      sharedRank: false,
      promotionBandLabel: 'Copa Plata',
      promotionBandIndex: 1,
      cells: {
        name: { formatted: 'Tiro Federal' },
        pj: { raw: 2, formatted: '2' },
        points: { raw: 0, formatted: '0' },
      },
    },
    {
      actorId: ATLETICO_ID,
      entrantId: ATLETICO_ID,
      clubId: ATLETICO_ID,
      clubAlias: 'atletico-bello',
      rank: 4,
      sharedRank: false,
      promotionBandLabel: 'Copa Oro',
      promotionBandIndex: 0,
      cells: {
        name: { formatted: 'Atlético Bello' },
        pj: { raw: 2, formatted: '2' },
        points: { raw: 0, formatted: '0' },
      },
    },
  ],
};

const squadRows = [
  {
    actorId: 'p-1',
    actorName: 'Aldo Cantoni',
    clubId: HISPANO_ID,
    clubAlias: 'club-hispano',
    shirtNumber: 9,
    publicProfileAvailable: true,
    cells: {
      name: { formatted: 'Aldo Cantoni' },
      pj: { raw: 2, formatted: '2' },
      goals: { raw: 3, formatted: '3' },
    },
  },
  {
    actorId: 'p-2',
    actorName: 'Jugador Oculto',
    clubId: HISPANO_ID,
    clubAlias: 'club-hispano',
    hiddenAtRequest: true,
    cells: {
      name: { formatted: 'Jugador Oculto' },
      pj: { raw: 1, formatted: '1' },
      goals: { raw: 0, formatted: '0' },
    },
  },
  {
    actorId: 'p-3',
    actorName: 'Otro Jugador',
    clubId: LOMAS_ID,
    clubAlias: 'lomas-de-rivadavia',
    publicProfileAvailable: true,
    cells: {
      name: { formatted: 'Otro Jugador' },
      pj: { raw: 2, formatted: '2' },
      goals: { raw: 1, formatted: '1' },
    },
  },
];

const squadLayout = {
  layoutCode: 'top-scorers',
  target: 'player-ranking',
  label: 'Top Scorers',
  columns: [
    { code: 'name', header: 'Player', format: 'text' },
    { code: 'pj', header: 'PJ', format: 'number' },
    { code: 'goals', header: 'Goals', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
  rows: squadRows,
};

const layouts = {
  layouts: [
    {
      code: 'group-standings-default',
      target: 'group-phase',
      label: 'Group Standings',
      entityGranularity: 'team',
    },
    {
      code: 'top-scorers',
      target: 'player-ranking',
      label: 'Top Scorers',
      entityGranularity: 'person',
    },
  ],
};

const knockoutSlot = (clubId: string | undefined, name: string, entrantId: string | undefined) => ({
  kind: 'entrant',
  name,
  ...(clubId ? { clubId } : {}),
  ...(entrantId ? { entrantId } : {}),
});

const bracket = {
  format: 'single-elimination',
  zones: [
    {
      zoneName: 'Copa Oro',
      matches: [
        {
          matchId: 'SE-R2-M1',
          nodeKey: 'SE-R2-M1',
          bracket: 'winners',
          round: 2,
          position: 1,
          status: 'scheduled',
          slots: [
            knockoutSlot(HISPANO_ID, 'Club Hispano', HISPANO_ID),
            knockoutSlot(TIRO_ID, 'Tiro Federal', TIRO_ID),
          ],
        },
      ],
    },
  ],
};

const organizationClubHistory = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  club: { clubId: HISPANO_ID, name: 'Club Hispano', abbreviation: 'HIS', alias: 'club-hispano' },
  tournaments: [
    {
      alias: TOURNAMENT_ALIAS,
      name: 'Apertura 2026',
      status: 'live',
      discipline: {
        descriptorId: 'rink-hockey',
        version: '1.0.0',
        name: 'Rink Hockey',
        localizedName: { en: 'Rink Hockey', es: 'Hockey sobre patines' },
      },
    },
    {
      alias: 'apertura-2025',
      name: 'Apertura 2025',
      status: 'finished',
      discipline: { descriptorId: 'rink-hockey', version: '1.0.0', name: 'Rink Hockey' },
      placements: [{ place: 'champion', zoneName: 'Copa Oro' }],
    },
    {
      alias: 'clausura-2024',
      name: 'Clausura 2024',
      status: 'finished',
      discipline: { descriptorId: 'rink-hockey', version: '1.0.0', name: 'Rink Hockey' },
      placements: [{ place: 'runner-up' }],
    },
  ],
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    if (path === `${API}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${API}/matches-view`) {
      res.end(JSON.stringify({ matches }));
      return;
    }
    if (path === `${API}/public/tables`) {
      res.end(JSON.stringify(layouts));
      return;
    }
    if (path === `${API}/stages/1/public/tables/group-standings-default`) {
      res.end(JSON.stringify(groupStandings));
      return;
    }
    if (path === `${API}/public/tables/top-scorers`) {
      const club = url.searchParams.get('club');
      const rows = club ? squadRows.filter((row) => row.clubAlias === club) : squadRows;
      res.end(JSON.stringify({ ...squadLayout, rows }));
      return;
    }
    if (path === '/api/organizations') {
      res.end(JSON.stringify([{ alias: ORGANIZATION, name: 'Liga Mendocina' }]));
      return;
    }
    if (path === `/api/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          organizationName: 'Liga Mendocina',
          tournaments: [],
          clubs: [
            { ...clubs[0], tournamentAlias: TOURNAMENT_ALIAS },
            { ...clubs[3], tournamentAlias: TOURNAMENT_ALIAS },
          ],
        }),
      );
      return;
    }
    if (path === `/api/organizations/${ORGANIZATION}/public/clubs/club-hispano`) {
      res.end(JSON.stringify(organizationClubHistory));
      return;
    }
    if (path === `${API}/stages/2/bracket`) {
      res.end(JSON.stringify(bracket));
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

test('the club index lists every aliased club and leaves the unaliased one as plain text', async ({
  page,
}) => {
  await page.goto(`${BASE}/clubs`);

  await expect(page.locator(`a[href="${BASE}/clubs/club-hispano"]`)).toHaveCount(1);
  await expect(page.locator(`a[href="${BASE}/clubs/lomas-de-rivadavia"]`)).toHaveCount(1);
  await expect(page.locator(`a[href="${BASE}/clubs/tiro-federal"]`)).toHaveCount(1);
  await expect(page.getByText('Club Sin Alias', { exact: true })).toBeVisible();
  // Grouped by the declared bands: Copa Oro first, its clubs alphabetical; the unassigned clubs last.
  const bandHeadings = page.locator('section[aria-labelledby^="club-band-"] h2');
  await expect(bandHeadings.nth(0)).toHaveText('Copa Oro');
  await expect(bandHeadings.nth(1)).toHaveText('Copa Plata');
  await expect(bandHeadings.nth(2)).toHaveText('Unassigned');
  const names = page.locator('.cl-club-identity__name');
  await expect(names.nth(0)).toHaveText('Atlético Bello');
  await expect(names.nth(1)).toHaveText('Club Hispano');
  await expect(names.nth(2)).toHaveText('Tiro Federal');
  await expect(page.locator('a', { hasText: 'Club Sin Alias' })).toHaveCount(0);
});

test('the club page shows identity, next match, standing, results, squad and the path link', async ({
  page,
}) => {
  await page.goto(`${BASE}/clubs/club-hispano`);

  await expect(page.getByRole('heading', { level: 1, name: 'Club Hispano' })).toBeVisible();
  // The band is said once, in its own row; the status beneath it keeps the round alone.
  await expect(page.locator('.cl-club-identity__badges [data-promotion-band-index]')).toHaveText(
    'Copa Oro',
  );
  await expect(page.locator('.cl-club-identity__status')).toHaveText('In competition: Semi-finals');
  // One H1 names the club; the standing heading is the only heading above its table.
  await expect(page.locator('h1')).toHaveText('Club Hispano');
  await expect(page.locator('section[aria-labelledby="club-standing-heading"] h2')).toHaveCount(1);
  await expect(page.locator('section[aria-labelledby="club-standing-heading"] h2')).toHaveText(
    'Standing',
  );
  await expect(page.locator('#club-next-match-heading')).toBeVisible();
  await expect(
    page.locator('section[aria-labelledby="club-results-heading"] .cl-match-card-grid > li'),
  ).toHaveCount(2);
  await expect(page.locator('#club-standing-heading')).toBeVisible();
  await expect(page.locator('#club-squad-heading')).toBeVisible();
  await expect(
    page.locator('section[aria-labelledby="club-squad-heading"] th', { hasText: 'PJ' }),
  ).toHaveCount(1);
  await expect(page.locator(`a[href="${BASE}/players/p-1?layout=top-scorers"]`)).toHaveCount(1);
  await expect(page.locator(`a[href*="/players/p-2"]`)).toHaveCount(0);
  await expect(page.getByText('Otro Jugador', { exact: true })).toHaveCount(0);
  await expect(page.locator('#club-path-heading')).toBeVisible();
});

test('the path link opens the stage page with the club pre-selected in its bracket', async ({
  page,
}) => {
  await page.goto(`${BASE}/clubs/club-hispano`);

  const pathLink = page.locator(`a[href^="${BASE}/stages/2?club=club-hispano"]`);
  await expect(pathLink).toHaveCount(1);
  await pathLink.click();

  await expect(page).toHaveURL(new RegExp(`${BASE}/stages/2\\?club=club-hispano`));
  await expect(page.locator('button[data-entrant-id][aria-pressed="true"]').first()).toBeVisible();
});

test('an unknown club alias answers with the page-not-found composition', async ({ page }) => {
  const response = await page.goto(`${BASE}/clubs/no-existe`);

  expect(response?.status()).toBe(404);
});

test('a club page under a former alias moves permanently to the current one', async ({ page }) => {
  const response = await page.request.get(`/es${BASE}/clubs/hispano-viejo?ref=afiche`, {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(301);
  expect(response.headers()['location']).toBe(`/es${BASE}/clubs/club-hispano?ref=afiche`);
});

test('a club filter naming a former alias moves permanently to the current one', async ({
  page,
}) => {
  const matchesResponse = await page.request.get(`${BASE}/matches?club=hispano-viejo&state=final`, {
    maxRedirects: 0,
  });
  expect(matchesResponse.status()).toBe(301);
  expect(matchesResponse.headers()['location']).toBe(
    `${BASE}/matches?club=club-hispano&state=final`,
  );

  const overviewResponse = await page.request.get(`${BASE}?club=hispano-viejo`, {
    maxRedirects: 0,
  });
  expect(overviewResponse.status()).toBe(301);
  expect(overviewResponse.headers()['location']).toBe(`${BASE}?club=club-hispano`);
});

test('a UUID in place of an alias is not a club page', async ({ page }) => {
  const response = await page.goto(`${BASE}/clubs/${HISPANO_ID}`);

  expect(response?.status()).toBe(404);
});

test('every club page section renders with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(`${BASE}/clubs/club-hispano`);

  await expect(page.getByRole('heading', { level: 1, name: 'Club Hispano' })).toBeVisible();
  await expect(page.locator('#club-next-match-heading')).toBeVisible();
  await expect(page.locator('#club-standing-heading')).toBeVisible();
  await expect(page.locator('#club-results-heading')).toBeVisible();
  await expect(page.locator('#club-squad-heading')).toBeVisible();
  await expect(page.locator('#club-path-heading')).toBeVisible();
  await expect(page.locator(`a[href="${BASE}/players/p-1?layout=top-scorers"]`)).toHaveCount(1);

  await context.close();
});

test('an organization club card links to its organization club page only when the club has an alias', async ({
  page,
}) => {
  await page.goto(`/${ORGANIZATION}`);

  await expect(page.locator(`a[href="/${ORGANIZATION}/clubs/club-hispano"]`)).toHaveCount(1);
  await expect(page.locator('a', { hasText: 'Club Sin Alias' })).toHaveCount(0);
});

test('the organization club page lists honours and tournaments, each linking to its club page', async ({
  page,
}) => {
  await page.goto(`/es/${ORGANIZATION}/clubs/club-hispano`);

  await expect(page.getByRole('heading', { level: 1, name: 'Club Hispano' })).toBeVisible();
  const honours = page.locator('section[aria-labelledby="organization-club-honours-heading"]');
  await expect(honours.locator('h2')).toHaveText(/Títulos y podios/);
  // Titles first, then runner-up places; the zone is named when the final stage had several.
  await expect(honours.locator('tbody tr').nth(0)).toContainText('Campeón · Copa Oro');
  await expect(honours.locator('tbody tr').nth(0)).toContainText('Apertura 2025');
  await expect(honours.locator('tbody tr').nth(1)).toContainText('Clausura 2024');
  await expect(
    honours.locator(`a[href="/es/${ORGANIZATION}/tournaments/apertura-2025/clubs/club-hispano"]`),
  ).toHaveCount(1);

  const tournaments = page.locator(
    'section[aria-labelledby="organization-club-tournaments-heading"]',
  );
  await expect(tournaments.locator('tbody tr')).toHaveCount(3);
  await expect(tournaments.locator('tbody tr').nth(0)).toContainText('Apertura 2026');
  await expect(tournaments.locator('tbody tr').nth(0)).toContainText('Hockey sobre patines');
  await expect(tournaments.locator(`a[href="/es${BASE}/clubs/club-hispano"]`)).toHaveCount(1);
  await expect(page.locator('nav a', { hasText: 'Liga Mendocina' }).first()).toHaveAttribute(
    'href',
    `/es/${ORGANIZATION}`,
  );
});

test('the organization club page renders with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(`/${ORGANIZATION}/clubs/club-hispano`);

  await expect(page.getByRole('heading', { level: 1, name: 'Club Hispano' })).toBeVisible();
  await expect(page.locator('#organization-club-honours-heading')).toBeVisible();
  await expect(page.locator('#organization-club-tournaments-heading')).toBeVisible();

  await context.close();
});

test('an unknown organization club answers with the page-not-found composition', async ({
  page,
}) => {
  const response = await page.goto(`/${ORGANIZATION}/clubs/no-existe`);

  expect(response?.status()).toBe(404);
});
