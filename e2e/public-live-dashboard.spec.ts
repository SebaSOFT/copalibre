import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';
import { expectNoVisibleIdentifiers, FIXTURE_ALIASES } from './support/visible-identifiers.js';
import { expectCenteredPageContainer } from './support/public-layout-widths.js';

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
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
  organizationTimeZone: 'America/Argentina/Mendoza',
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
    if (path === '/api/organizations') {
      res.end(JSON.stringify(organizations));
      return;
    }
    if (path === `/api/organizations/${ORGANIZATION}/public/tournaments`) {
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
    if (path === `${BASE}/stages/1/matches/1`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          organizationName: 'Liga Mendocina',
          organizationTimeZone: 'America/Argentina/Mendoza',
          tournamentAlias: TOURNAMENT,
          tournamentName: 'Apertura 2026',
          stageNumber: 1,
          stageFormat: 'round-robin',
          matchNumber: 1,
          round: 1,
          status: 'live',
          homeEntrantId: '01936f4a-0001-7000-8000-000000000001',
          homeName: 'Andes',
          homeScore: 2,
          awayEntrantId: '01936f4a-0002-7000-8000-000000000002',
          awayName: 'Concepción',
          awayScore: 1,
          schedulePublished: true,
          officials: [],
          rosters: { home: [], away: [] },
          timeline: [],
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

test.beforeEach(() => {
  liveResponse = { matches: [] };
});

test('uses the centered public container at reference widths', async ({ page }) => {
  await expectCenteredPageContainer(page, PAGE, 'public');
});

test('empty live view has a localized next kickoff and owned leaders table without JavaScript @visible-identifier-lint', async ({
  page,
}) => {
  const response = await page.goto(`/es${PAGE}`);
  expect(response?.status()).toBe(200);
  await expectNoVisibleIdentifiers(page, FIXTURE_ALIASES);

  await expect(page.getByText('No hay partidos en vivo')).toBeVisible();
  await expect(page.getByText('Próximo partido programado:')).toBeVisible();
  const kickoff = page.locator('time[datetime="2026-09-24T16:00:00.000Z"]').first();
  await expect(kickoff).toBeVisible();
  expect(await kickoff.textContent()).not.toContain('2026-09-24T16:00:00.000Z');
  const trail = page.getByRole('navigation', { name: 'Ruta de navegación' });
  await expect(trail.getByRole('link')).toHaveCount(2);
  await expect(trail.getByRole('link').nth(1)).toHaveAttribute(
    'href',
    `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}`,
  );
  await expect(trail.locator('[aria-current="page"]')).toHaveText('En vivo');
  await expect(page.locator('.cl-standings-section table.cl-table')).toBeVisible();
  await expect(page.locator('.cl-standings-section tbody tr.cl-row')).toHaveCount(1);
});

test('each active match renders once in the live hero without JavaScript', async ({ page }) => {
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
  await expect(hero.getByRole('article', { name: 'Andes vs Concepción' })).toBeVisible();
  await expect(hero.getByText('Andes')).toBeVisible();
  await expect(hero.getByText('Concepción')).toBeVisible();
  await expect(page.getByText('No live matches in progress')).toHaveCount(0);
});

test.describe('live dashboard clock and match navigation', () => {
  test.use({ javaScriptEnabled: true });

  test('running clock advances without reload and activating the card opens its match report', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/events/public/')) {
          return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return originalFetch(input, init);
      };
    });

    liveResponse = {
      matches: [
        {
          matchId: '01936f4a-1001-7000-8000-000000000001',
          stageNumber: 1,
          matchNumber: 1,
          stageOrdinal: 1,
          state: 'live',
          projectionVersion: 1,
          segments: [
            {
              number: 1,
              type: 'half',
              label: { en: 'Half', es: 'Tiempo' },
              timed: true,
              state: 'active',
            },
            {
              number: 2,
              type: 'half',
              label: { en: 'Half', es: 'Tiempo' },
              timed: true,
              state: 'pending',
            },
          ],
          clock: {
            segmentNumber: 1,
            elapsedSeconds: 585,
            running: true,
            asOf: new Date().toISOString(),
          },
          sides: [
            { entrantId: '01936f4a-0001-7000-8000-000000000001', name: 'Andes', score: 2 },
            { entrantId: '01936f4a-0002-7000-8000-000000000002', name: 'Concepción', score: 1 },
          ],
        },
      ],
    };

    await page.goto(PAGE);

    const hero = page.locator('.cl-match-card-grid').first();
    const timer = hero.getByRole('timer');
    await expect(timer).toBeVisible();
    await expect(timer.locator('.cl-live-clock__segment')).toHaveText('1st Half');

    const readSeconds = async (): Promise<number> => {
      const text = (await timer.locator('.cl-live-clock__digits').innerText()).trim();
      const [mm = '0', ss = '0'] = text.split(':');
      return Number(mm) * 60 + Number(ss);
    };

    expect(await readSeconds()).toBeGreaterThanOrEqual(585);
    await expect.poll(readSeconds, { timeout: 6_000 }).toBeGreaterThan(586);

    await hero.getByRole('link', { name: /Open the match Andes against Concepción/i }).click();
    await page.waitForURL(`**/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/matches/1`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Andes vs Concepción');
  });
});
