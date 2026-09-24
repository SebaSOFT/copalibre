import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const PAGE = `/${ORGANIZATION}/tournaments/${TOURNAMENT}/live`;

const organizations = [
  {
    organizationId: '01900000-0000-7000-8000-000000000001',
    alias: ORGANIZATION,
    name: 'Liga Mendocina',
    primaryLanguage: 'es',
    timezone: 'America/Argentina/Mendoza',
  },
];

const tournaments = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournaments: [
    {
      tournamentId: '01900000-0000-7000-8000-000000000010',
      alias: TOURNAMENT,
      name: 'Apertura 2026',
      status: 'live',
      discipline: {
        descriptorId: '01890000-0000-7000-8000-000000000001',
        version: '1.0.0',
        name: 'Football',
      },
    },
  ],
};

const scheduled = {
  stageNumber: 1,
  matchNumber: 2,
  homeName: 'Andes',
  awayName: 'Concepción',
  status: 'scheduled',
  scheduledAt: '2026-09-24T16:00:00.000Z',
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [scheduled],
  standingsPreview: [{ rank: 1, name: 'Andes', abbreviation: 'AND', statistics: { points: 3 } }],
  clubs: [],
  ruleset: {},
};

let liveResponse: { matches: unknown[] } = { matches: [] };
let apiServer: Server;
test.use({ javaScriptEnabled: false });

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === '/organizations') {
      res.end(JSON.stringify(organizations));
      return;
    }
    if (path === `/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(JSON.stringify(tournaments));
      return;
    }
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/live`) {
      res.end(JSON.stringify(liveResponse));
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

test.beforeEach(() => {
  liveResponse = { matches: [] };
});

test('0275: empty live view has a localized next kickoff and owned leaders table without JavaScript', async ({
  page,
}) => {
  const response = await page.goto(`/es${PAGE}`);
  expect(response?.status()).toBe(200);

  await expect(page.getByText('No hay partidos en vivo')).toBeVisible();
  await expect(page.getByText('Próximo partido programado:')).toBeVisible();
  const kickoff = page.locator('time[datetime="2026-09-24T16:00:00.000Z"]').first();
  await expect(kickoff).toBeVisible();
  expect(await kickoff.textContent()).not.toContain('2026-09-24T16:00:00.000Z');
  await expect(
    page.getByRole('navigation', { name: 'Ruta de navegación' }).getByRole('link'),
  ).toHaveAttribute('href', `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}`);
  await expect(page.locator('.cl-standings-section table.cl-table')).toBeVisible();
  await expect(page.locator('.cl-standings-section tbody tr.cl-row')).toHaveCount(1);
});

test('0275: each active match renders once in the live hero without JavaScript', async ({
  page,
}) => {
  liveResponse = {
    matches: [
      {
        matchId: '01936f4a-1001-7000-8000-000000000001',
        stageNumber: 1,
        matchNumber: 1,
        state: 'live',
        projectionVersion: 1,
        sides: [
          { entrantId: '01936f4a-0001-7000-8000-000000000001', name: 'Andes', score: 2 },
          { entrantId: '01936f4a-0002-7000-8000-000000000002', name: 'Concepción', score: 1 },
        ],
      },
    ],
  };
  await page.goto(PAGE);

  const hero = page.locator('.cl-match-card-grid').first();
  await expect(hero.locator('article')).toHaveCount(1);
  await expect(hero.getByText('Andes')).toBeVisible();
  await expect(hero.getByText('Concepción')).toBeVisible();
  await expect(page.getByText('No live matches in progress')).toHaveCount(0);
});
