import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';

/**
 * The public standings preview and the live page's leaders table state the
 * accounting grain (0160 tasks 7.3, 7.4).
 *
 * Both pages are server-rendered — `[tournament].astro` and `live.astro`
 * both declare `prerender = false` and fetch every figure in frontmatter, so
 * the browser never issues the request this suite's stub server answers.
 * Swapping what the stub returns is the only way to change what a run sees,
 * which is itself the proof the statement survives with JavaScript disabled:
 * one test below goes further and disables it outright.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `${TOURNAMENT}/stages/1`;
const overviewPath = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const livePath = `${overviewPath}/live`;

const oneMatch = [
  {
    stageNumber: 1,
    homeName: 'Talleres',
    homeAbbreviation: 'TLL',
    homeScore: 2,
    awayName: 'Independiente',
    awayAbbreviation: 'IND',
    awayScore: 1,
    status: 'completed',
    scheduledAt: '2026-03-01T20:00:00.000Z',
  },
];

const groupPhaseLayout = {
  code: 'group-standings-default',
  target: 'group-phase',
  label: 'Standings',
  entityGranularity: 'team',
};

const projectionColumns = [
  { code: 'name', header: 'Team', format: 'text' },
  { code: 'played', header: 'Played', shortHeader: 'PJ', format: 'number' },
  { code: 'points', header: 'Points', shortHeader: 'Pts', format: 'number' },
];

const projectionRows = [
  {
    actorId: 'tll',
    entrantId: 'tll',
    entrantName: 'Talleres',
    rank: 1,
    sharedRank: false,
    cells: {
      name: { formatted: 'Talleres' },
      played: { raw: 1, formatted: '1' },
      points: { raw: 3, formatted: '3' },
    },
  },
];

let overview: Record<string, unknown> = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: oneMatch,
  clubs: [],
  ruleset: {},
  standingsPreview: [{ rank: 1, name: 'Talleres', abbreviation: 'TLL', statistics: { points: 3 } }],
};

let projection: Record<string, unknown> = {
  layoutCode: groupPhaseLayout.code,
  target: groupPhaseLayout.target,
  label: groupPhaseLayout.label,
  columns: projectionColumns,
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  rows: projectionRows,
  projectionVersion: 1,
  grain: 'series',
  countColumnCode: 'played',
};

let apiServer: Server;

test.beforeAll(async () => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === `${TOURNAMENT}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (req.url === `${TOURNAMENT}/live`) {
      res.end(JSON.stringify({ matches: [] }));
      return;
    }
    if (req.url === `${TOURNAMENT}/public/tables`) {
      res.end(JSON.stringify({ layouts: [groupPhaseLayout] }));
      return;
    }
    if (req.url?.startsWith(`${STAGE}/public/tables/${groupPhaseLayout.code}`)) {
      res.end(JSON.stringify(projection));
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

const DEFAULT_OVERVIEW = overview;
const DEFAULT_PROJECTION = projection;
test.beforeEach(() => {
  overview = DEFAULT_OVERVIEW;
  projection = DEFAULT_PROJECTION;
});

test('7.3: the public standings preview names the grain, with JavaScript disabled', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(overviewPath);

  await expect(page.getByText('This table counts one result per series.')).toBeVisible();
  // The counted column reads its declared unit, not the discipline's own
  // match-shaped wording — 'PJ' (Partidos/Played) never appears once relabelled.
  await expect(page.getByRole('columnheader', { name: 'S', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'PJ', exact: true })).toHaveCount(0);

  await context.close();
});

test('7.3: a single-match tournament’s preview carries no such statement, unchanged from before this change', async ({
  page,
}) => {
  const { grain: _grain, countColumnCode: _countColumnCode, ...withoutGrain } = DEFAULT_PROJECTION;
  projection = withoutGrain;

  await page.goto(overviewPath);

  await expect(page.getByText('This table counts one result per series.')).toHaveCount(0);
  await expect(page.getByText('This table counts one result per played match.')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'PJ' })).toBeVisible();
});

test('7.3: the live page’s leaders table names the grain, with JavaScript disabled', async ({
  browser,
}) => {
  overview = { ...DEFAULT_OVERVIEW, standingsGrain: 'match' };
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(livePath);

  await expect(page.getByText('This table counts one result per played match.')).toBeVisible();

  await context.close();
});

test('7.4: the grain statement is legible with color disabled', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(overviewPath);

  // Plain text throughout, unlike the series bar's icon-plus-text marks —
  // there is no color channel here to strip in the first place, so the
  // statement is attached and readable exactly as forced-colors leaves it.
  await expect(page.getByText('This table counts one result per series.')).toBeVisible();
});
