import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * openspec 0338: a stage whose zones play different formats — two knockout zones and one
 * round-robin league for the remaining clubs — is drawn zone by zone. Knockout zones show their
 * bracket; the league zone shows its matches and its own standings table.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const route = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1`;

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  matches: [],
  clubs: [],
  ruleset: {},
};

const knockout = (prefix: string, home: string, away: string) => [
  {
    matchId: `${prefix}-R1-M1`,
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', name: home },
      { kind: 'entrant', name: away },
    ],
  },
];

const bracket = {
  format: 'single-elimination',
  zones: [
    {
      zoneId: 'zone-1',
      zoneName: 'Zona 1',
      format: 'single-elimination',
      matches: knockout('A', 'Talleres', 'Independiente'),
    },
    {
      zoneId: 'zone-2',
      zoneName: 'Zona 2',
      format: 'single-elimination',
      matches: knockout('B', 'Gimnasia', 'Maipú'),
    },
    {
      zoneId: 'zone-3',
      zoneName: 'Zona 3',
      format: 'round-robin',
      matches: [],
    },
  ],
};

const leagueMatch = {
  matchId: '00000000-0000-7000-8000-000000000031',
  stageNumber: 1,
  matchNumber: 7,
  status: 'upcoming',
  round: 1,
  homeName: 'Andes',
  awayName: 'Pocito',
  zoneName: 'Zona 3',
};

const layouts = {
  layouts: [
    {
      code: 'group-standings-default',
      target: 'group-phase',
      label: 'Group Standings',
      entityGranularity: 'team',
    },
  ],
};

const standings = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  columns: [
    { code: 'name', header: 'Team', format: 'text' },
    { code: 'pts', header: 'Points', shortHeader: 'Pts', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'pts', direction: 'desc' }],
  rows: [
    {
      actorId: 'Andes',
      entrantId: 'Andes',
      rank: 1,
      sharedRank: false,
      cells: { name: { formatted: 'Andes' }, pts: { raw: 3, formatted: '3' } },
    },
  ],
  projectionVersion: 1,
  segments: [
    {
      groupId: 'group-3',
      groupName: 'Zona 3',
      zoneName: 'Zona 3',
      rows: [
        {
          actorId: 'Andes',
          entrantId: 'Andes',
          rank: 1,
          sharedRank: false,
          cells: { name: { formatted: 'Andes' }, pts: { raw: 3, formatted: '3' } },
        },
      ],
    },
  ],
};

let server: Server;

test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    const body: Record<string, unknown> = {
      [`${TOURNAMENT}/overview`]: overview,
      [`${TOURNAMENT}/stages/1/bracket`]: bracket,
      [`${TOURNAMENT}/matches-view`]: { matches: [leagueMatch] },
      [`${TOURNAMENT}/public/tables`]: layouts,
      [`${TOURNAMENT}/stages/1/public/tables/group-standings-default`]: standings,
    };
    if (path !== undefined && path in body) {
      res.end(JSON.stringify(body[path]));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('draws knockout zones as brackets and the league zone as matches with its table', async ({
  page,
}) => {
  await page.goto(route);

  await expect(page.getByRole('heading', { level: 1, name: /^Stage/ })).toBeVisible();
  for (const zone of ['Zona 1', 'Zona 2', 'Zona 3']) {
    await expect(page.getByRole('heading', { level: 2, name: zone })).toBeVisible();
  }

  const first = page.locator('section', { has: page.getByRole('heading', { name: 'Zona 1' }) });
  await expect(first.locator('.cl-bracket-stage')).toHaveCount(1);
  await expect(first.getByText('Talleres').first()).toBeVisible();
  await expect(first.locator('table')).toHaveCount(0);

  const league = page.locator('section', { has: page.getByRole('heading', { name: 'Zona 3' }) });
  await expect(league.locator('.cl-bracket-stage')).toHaveCount(0);
  await expect(league.getByText('Andes').first()).toBeVisible();
  await expect(league.locator('table')).toHaveCount(1);
});

test('lets a spectator jump between the zones of the stage', async ({ page }) => {
  await page.goto(route);

  const jump = page.getByRole('navigation', { name: /zone/i });
  await expect(jump.getByRole('link')).toHaveCount(3);
  await jump.getByRole('link', { name: 'Zona 3' }).click();
  await expect(page).toHaveURL(/#cl-bracket-zone-2$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Zona 3' })).toBeInViewport();
});
