import { createServer, type Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * A5 (Control Web) and B2 (public tournament page) rendering declared table
 * layouts dynamically (0091) — the discipline's own columns (GF/GC/Dif), a
 * composite fraction cell ("4/5"), switching between declared layouts, and
 * exporting the active one as CSV.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `${TOURNAMENT}/stages/1`;

const layoutsFixture = {
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

const groupStandingsFixture = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  columns: [
    { code: 'name', header: 'Team', format: 'text' },
    { code: 'gf', header: 'GF', format: 'number' },
    { code: 'ga', header: 'GA', shortHeader: 'GC', format: 'number' },
    { code: 'gd', header: 'GD', shortHeader: 'Dif', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'gd', direction: 'desc' }],
  rows: [
    {
      actorId: 'Talleres',
      entrantId: 'Talleres',
      rank: 1,
      sharedRank: false,
      cells: {
        name: { formatted: 'Talleres' },
        gf: { raw: 12, formatted: '12' },
        ga: { raw: 3, formatted: '3' },
        gd: { raw: 9, formatted: '9' },
      },
    },
    {
      actorId: 'Independiente',
      entrantId: 'Independiente',
      rank: 2,
      sharedRank: false,
      cells: {
        name: { formatted: 'Independiente' },
        gf: { raw: 6, formatted: '6' },
        ga: { raw: 5, formatted: '5' },
        gd: { raw: 1, formatted: '1' },
      },
    },
  ],
  projectionVersion: 3,
};

const topScorersFixture = {
  layoutCode: 'top-scorers',
  target: 'player-ranking',
  label: 'Top Scorers',
  columns: [
    { code: 'player', header: 'Player', format: 'text' },
    { code: 'goals', header: 'Goals', format: 'number' },
    { code: 'cards', header: 'Y/R Cards', format: 'fraction' },
  ],
  defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
  rows: [
    {
      actorId: 'p-1',
      rank: 1,
      sharedRank: false,
      cells: {
        player: { formatted: 'Goleador Uno' },
        goals: { raw: 9, formatted: '9' },
        cards: { formatted: '4/5', numerator: 4, denominator: 5 },
      },
    },
  ],
  projectionVersion: 3,
};

async function mockControlApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tournament, stage, layouts, groupStandings, topScorers, tokenEndpoint }) => {
      window.fetch = async (input) => {
        const url = String(input);

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${tournament}/tables`) return Response.json(layouts);
        if (url === `${stage}/tables/group-standings-default`) return Response.json(groupStandings);
        if (url === `${tournament}/tables/top-scorers`) return Response.json(topScorers);
        if (url === `${stage}/tables/group-standings-default/csv`) {
          return new Response('name,gf,ga,gd\nTalleres,12,3,9\nIndependiente,6,5,1\n', {
            headers: { 'content-type': 'text/csv; charset=utf-8' },
          });
        }
        if (url === `${tournament}/tables/top-scorers/csv`) {
          return new Response('player,goals,cards\nGoleador Uno,9,4/5\n', {
            headers: { 'content-type': 'text/csv; charset=utf-8' },
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      tournament: TOURNAMENT,
      stage: STAGE,
      layouts: layoutsFixture,
      groupStandings: groupStandingsFixture,
      topScorers: topScorersFixture,
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

test('A5: renders the discipline’s own GF/GC/Dif columns, switches to a fraction-cell layout, and exports CSV', async ({
  page,
}) => {
  await mockControlApi(page);

  const target = `/control/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/standings`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // The discipline's own declared columns, not a hardcoded control-web list.
  await expect(page.getByRole('button', { name: 'GF' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GC' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dif' })).toBeVisible();
  // Table cells specifically — the distribution chart above repeats the
  // same leader's name and value as its own bar label.
  const table = page.locator('.cl-chamfer--control');
  await expect(table.getByText('Talleres')).toBeVisible();
  await expect(table.getByText('9', { exact: true })).toBeVisible();

  // Switching tabs reads a different declared layout, including a composite
  // fraction cell no group-standings column ever produces.
  await page.getByRole('tab', { name: 'Top Scorers' }).click();
  await expect(table.getByText('Goleador Uno')).toBeVisible();
  await expect(table.getByText('4/5')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${TOURNAMENT_ALIAS}-top-scorers.csv`);
  const csvPath = await download.path();
  expect(csvPath).toBeTruthy();
});

/**
 * The public tournament page (B2) is server-rendered — its data fetch runs
 * inside the Astro preview process, not the browser, so `window.fetch`
 * mocking cannot reach it. A tiny local HTTP server standing in for the API
 * at the same address `COPALIBRE_API_INTERNAL_URL` defaults to is the only
 * way to control what an SSR page like this one renders in this harness.
 */
test.describe('B2: public tournament page', () => {
  let apiServer: Server;

  test.beforeAll(async () => {
    const overview = {
      organizationAlias: ORGANIZATION,
      organizationName: 'Liga Mendocina',
      tournamentAlias: TOURNAMENT_ALIAS,
      tournamentName: 'Apertura 2026',
      seasonName: 'Apertura 2026',
      matches: [
        {
          matchId: 'm-1',
          stageNumber: 1,
          round: 1,
          status: 'finalized',
          homeEntrantId: 'Talleres',
          homeName: 'Talleres',
          homeAbbreviation: 'TAL',
          awayEntrantId: 'Independiente',
          awayName: 'Independiente',
          awayAbbreviation: 'IND',
          homeScore: 2,
          awayScore: 1,
          scheduledAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      ruleset: {},
    };
    const finishedReport = {
      organizationAlias: ORGANIZATION,
      organizationName: 'Liga Mendocina',
      tournamentAlias: TOURNAMENT_ALIAS,
      tournamentName: 'Apertura 2026',
      stageNumber: 1,
      round: 1,
      matchNumber: 1,
      status: 'final',
      homeEntrantId: 'Talleres',
      homeName: 'Talleres',
      homeAbbreviation: 'TAL',
      homeScore: 2,
      awayEntrantId: 'Independiente',
      awayName: 'Independiente',
      awayAbbreviation: 'IND',
      awayScore: 1,
      scheduledAt: '2026-01-01T00:00:00.000Z',
      venueName: 'Estadio Central',
      schedulePublished: true,
      officials: [{ name: 'Marta Referee', roles: ['referee'] }],
      rosters: {
        home: [
          {
            personId: 'person-home',
            number: 9,
            name: 'Sofía Gómez',
            roles: ['forward'],
            onField: true,
          },
        ],
        away: [],
      },
      timeline: [
        {
          eventId: 'event-goal',
          definitionCode: 'goal',
          label: 'Goal',
          occurredAt: '2026-01-01T00:10:00.000Z',
          side: 'home',
          personId: 'person-home',
          payload: {},
        },
      ],
    };
    const upcomingReport = {
      ...finishedReport,
      matchNumber: 2,
      status: 'upcoming',
      scheduledAt: '2026-01-02T18:00:00.000Z',
      officials: [],
      rosters: { home: [], away: [] },
      timeline: [],
    };

    apiServer = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === `${TOURNAMENT}/overview`) {
        res.end(JSON.stringify(overview));
        return;
      }
      if (req.url === `${TOURNAMENT}/public/tables`) {
        res.end(JSON.stringify(layoutsFixture));
        return;
      }
      if (req.url === `${STAGE}/public/tables/group-standings-default`) {
        res.end(JSON.stringify(groupStandingsFixture));
        return;
      }
      if (req.url === `${STAGE}/matches/1`) {
        res.end(JSON.stringify(finishedReport));
        return;
      }
      if (req.url === `${STAGE}/matches/2`) {
        res.end(JSON.stringify(upcomingReport));
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

  test('renders the discipline’s own GF/GC/Dif columns for a spectator', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    await expect(page.getByRole('heading', { name: 'Group Standings' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'GF' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'GC' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Dif' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Talleres' })).toBeVisible();
  });

  test('switches a constrained entrant name to its persisted abbreviation with a tooltip', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const entrantName = page.getByTestId('entrant-name').first();
    await expect(entrantName).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('astro-island').filter({ has: entrantName }).first(),
    ).not.toHaveAttribute('ssr', '', { timeout: 15_000 });
    await entrantName.evaluate((element) => {
      element.setAttribute('style', 'display: block; min-width: 0; width: 1px');
    });

    await expect(entrantName.getByTitle('Talleres')).toHaveText('TAL');
  });

  test('renders finished match report header, officials, roster, and timeline', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/1`);

    await expect(page.getByRole('heading', { name: /TAL.*2.*1.*IND/ })).toBeVisible();
    await expect(page.getByText('Marta Referee — referee')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Sofía Gómez' })).toBeVisible();
    await expect(page.getByText('Goal')).toBeVisible();
  });

  test('renders upcoming match report empty roster and timeline states', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/2`);

    await expect(page.getByText('No officials assigned.')).toBeVisible();
    await expect(page.getByText('Rosters are not yet available.')).toBeVisible();
    await expect(page.getByText('Events are not yet available.')).toBeVisible();
  });
});
