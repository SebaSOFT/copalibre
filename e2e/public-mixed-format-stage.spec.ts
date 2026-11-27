import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * A stage whose zones play different formats — two knockout zones and one
 * round-robin league for the remaining clubs — is drawn zone by zone. Knockout zones show their
 * bracket; the league zone shows its matches and its own standings table.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
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

const cupZoneMatches = (
  prefix: string,
  offset: number,
  options: { readonly finalized?: boolean; readonly drawnThird?: boolean } = {},
) => {
  const status = options.finalized ? 'finalized' : 'scheduled';
  const side = (name: string, score?: number) => ({
    kind: 'entrant',
    entrantId: `${prefix}-${name}`,
    name: `${prefix} ${name}`,
    ...(options.finalized && score !== undefined ? { score } : {}),
  });
  return [
    {
      matchId: `${prefix}-SF1`,
      nodeKey: 'SE-R1-M1',
      bracket: 'winners',
      round: 1,
      position: 1,
      matchNumber: offset + 1,
      status,
      slots: [side('E1', 3), side('E4', 1)],
    },
    {
      matchId: `${prefix}-SF2`,
      nodeKey: 'SE-R1-M2',
      bracket: 'winners',
      round: 1,
      position: 2,
      matchNumber: offset + 2,
      status,
      slots: [side('E2', 2), side('E3', 0)],
    },
    {
      matchId: `${prefix}-F`,
      nodeKey: 'SE-R2-M1',
      bracket: 'winners',
      round: 2,
      position: 1,
      matchNumber: offset + 3,
      status,
      slots: [side('E1', 4), side('E2', 2)],
    },
    {
      matchId: `${prefix}-P3`,
      nodeKey: 'placement-3',
      bracket: 'placement',
      round: 2,
      position: 1,
      matchNumber: offset + 4,
      role: 'place-3',
      status,
      slots: [side('E3', 2), side('E4', options.drawnThird ? 2 : 1)],
    },
    {
      matchId: `${prefix}-P5`,
      nodeKey: 'placement-5',
      bracket: 'placement',
      round: 2,
      position: 2,
      matchNumber: offset + 5,
      role: 'place-5',
      status,
      slots: [side('E5', 3), side('E6', 1)],
    },
  ];
};

const cupsBracket = (options: { readonly finalized?: boolean } = {}) => ({
  format: 'single-elimination',
  zones: [
    {
      zoneId: 'cup-oro',
      zoneName: 'Copa Oro',
      format: 'single-elimination',
      overallPlaceOffset: 0,
      matches: cupZoneMatches('Oro', 0, {
        finalized: options.finalized,
        drawnThird: options.finalized,
      }),
    },
    {
      zoneId: 'cup-plata',
      zoneName: 'Copa Plata',
      format: 'single-elimination',
      overallPlaceOffset: 8,
      matches: cupZoneMatches('Plata', 10, { finalized: options.finalized }),
    },
    {
      zoneId: 'cup-bronce',
      zoneName: 'Copa Bronce',
      format: 'single-elimination',
      overallPlaceOffset: 16,
      matches: cupZoneMatches('Bronce', 20, { finalized: options.finalized }),
    },
  ],
});

const FINISHED_CUPS_ALIAS = 'copas-finalizadas';
const FINISHED_CUPS = `/api/organizations/${ORGANIZATION}/tournaments/${FINISHED_CUPS_ALIAS}`;

const finishedCupsOverview = {
  ...overview,
  tournamentAlias: FINISHED_CUPS_ALIAS,
  tournamentName: 'Copas Finalizadas 2026',
  status: 'finished',
  stages: [
    { stageNumber: 1, stageName: 'Grupos', format: 'round-robin', zones: [] },
    {
      stageNumber: 2,
      stageName: 'Copas',
      format: 'single-elimination',
      zones: [
        { zoneName: 'Copa Oro', format: 'single-elimination' },
        { zoneName: 'Copa Plata', format: 'single-elimination' },
        { zoneName: 'Copa Bronce', format: 'single-elimination' },
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
      [`${TOURNAMENT}/stages/2/bracket`]: cupsBracket(),
      [`${TOURNAMENT}/matches-view`]: { matches: [leagueMatch] },
      [`${TOURNAMENT}/public/tables`]: layouts,
      [`${TOURNAMENT}/stages/1/public/tables/group-standings-default`]: standings,
      [`${TOURNAMENT}/stages/2/public/tables/group-standings-default`]: standings,
      [`${FINISHED_CUPS}/overview`]: finishedCupsOverview,
      [`${FINISHED_CUPS}/stages/2/bracket`]: cupsBracket({ finalized: true }),
      [`${FINISHED_CUPS}/public/tables`]: { layouts: [] },
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

  await expect(
    page.getByRole('heading', { level: 1, name: /Apertura 2026.*Stage 1/ }),
  ).toBeVisible();
  for (const zone of ['Zona 1', 'Zona 2', 'Zona 3']) {
    await expect(page.getByRole('heading', { level: 2, name: zone })).toBeVisible();
  }

  const first = page.locator('section', { has: page.getByRole('heading', { name: 'Zona 1' }) });
  await expect(first.locator('.cl-bracket-stage')).toHaveCount(1);
  await expect(first.getByText('Talleres').filter({ visible: true }).first()).toBeVisible();
  await expect(first.locator('table')).toHaveCount(0);

  const league = page.locator('section', { has: page.getByRole('heading', { name: 'Zona 3' }) });
  await expect(league.locator('.cl-bracket-stage')).toHaveCount(0);
  await expect(league.getByText('Andes').filter({ visible: true }).first()).toBeVisible();
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

test('a bracket-layout stage page renders the cups as brackets and no group-phase standings table', async ({
  page,
}) => {
  await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/2`);

  await expect(page.locator('.cl-bracket-stage')).toHaveCount(3);
  await expect(page.getByRole('heading', { level: 2, name: 'Copa Oro' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Copa Plata' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Copa Bronce' })).toBeVisible();
  await expect(page.locator('.cl-standings-section')).toHaveCount(0);
  await expect(page.locator('table')).toHaveCount(0);
});

test('banded knockout stage shows overall place suffixes on placement headers and Clasificación general on finished overview', async ({
  page,
}) => {
  await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/2`);

  const placementLists = page.locator('.cl-placement-games');
  await expect(placementLists).toHaveCount(3);
  await expect(placementLists.nth(0).locator('.cl-placement-games__role')).toContainText([
    '3º puesto · 3.º general',
    '5º puesto · 5.º general',
  ]);
  await expect(placementLists.nth(2).locator('.cl-placement-games__role')).toContainText([
    '3º puesto · 19.º general',
    '5º puesto · 21.º general',
  ]);

  await page.goto(`/es/${ORGANIZATION}/tournaments/${FINISHED_CUPS_ALIAS}`);

  const overallSection = page.locator('.cl-overview-overall-standings');
  await expect(overallSection).toBeVisible();
  await expect(
    overallSection.getByRole('heading', { name: 'Clasificación general' }),
  ).toBeVisible();
  const rows = overallSection.locator('tbody tr');
  await expect(rows).toHaveCount(18);

  await expect(rows.nth(0)).toContainText('1.°');
  await expect(rows.nth(0)).toContainText('Oro E1');
  await expect(rows.nth(1)).toContainText('2.°');
  await expect(rows.nth(1)).toContainText('Oro E2');
  await expect(rows.nth(2)).toContainText('3.°–4.°');
  await expect(rows.nth(3)).toContainText('3.°–4.°');
  await expect(rows.nth(16)).toContainText('21.°');
  await expect(rows.nth(16)).toContainText('Bronce E5');
});
