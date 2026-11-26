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
  scheduledAt: '2099-09-24T16:00:00.000Z',
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
let overviewMode: 'default' | 'grouped-in-play' | 'group-stage-complete' | 'delayed-queue' =
  'default';
let apiServer: Server;
test.use({ javaScriptEnabled: false });

function buildDelayedQueueOverview() {
  const now = Date.now();
  return {
    ...overview,
    matches: [
      {
        matchId: '01936f4a-1001-7000-8000-000000000001',
        stageNumber: 1,
        stageOrdinal: 1,
        matchNumber: 1,
        homeName: 'Andes',
        awayName: 'Concepción',
        status: 'in-progress',
        homeScore: 2,
        awayScore: 1,
        scheduledAt: new Date(now - 35 * 60_000).toISOString(),
      },
      {
        matchId: '01936f4a-1002-7000-8000-000000000002',
        stageNumber: 1,
        stageOrdinal: 2,
        matchNumber: 2,
        homeName: 'Club Demorado',
        awayName: 'Visita Demorada',
        status: 'scheduled',
        scheduledAt: new Date(now - 20 * 60_000).toISOString(),
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        matchId: `01936f4a-1003-7000-8000-00000000000${index + 3}`,
        stageNumber: 1,
        stageOrdinal: index + 3,
        matchNumber: index + 3,
        homeName: `Futuro Local ${index + 1}`,
        awayName: `Futuro Visita ${index + 1}`,
        status: 'scheduled',
        scheduledAt: new Date(now + (index + 1) * 3_600_000).toISOString(),
      })),
    ],
  };
}

const groupedStandingsPreview = [
  {
    rank: 1,
    entrantId: 'ent-talleres',
    name: 'Talleres',
    abbreviation: 'TAL',
    zoneName: 'Grupos',
    groupName: 'Grupo A',
    statistics: { played: 2, points: 6 },
  },
  {
    rank: 2,
    entrantId: 'ent-andes',
    name: 'Andes',
    abbreviation: 'AND',
    zoneName: 'Grupos',
    groupName: 'Grupo A',
    statistics: { played: 2, points: 6 },
  },
  {
    rank: 1,
    entrantId: 'ent-san-martin',
    name: 'San Martín',
    abbreviation: 'SM',
    zoneName: 'Grupos',
    groupName: 'Grupo B',
    statistics: { played: 2, points: 4 },
  },
];

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
      const response =
        overviewMode === 'delayed-queue'
          ? buildDelayedQueueOverview()
          : overviewMode === 'grouped-in-play'
            ? {
                ...overview,
                standingsStageNumber: 1,
                matches: [
                  { ...scheduled, stageNumber: 1, matchNumber: 1, status: 'finalized' },
                  { ...scheduled, stageNumber: 1, matchNumber: 2, status: 'scheduled' },
                ],
                standingsPreview: groupedStandingsPreview,
              }
            : overviewMode === 'group-stage-complete'
              ? {
                  ...overview,
                  standingsStageNumber: 1,
                  matches: [
                    { ...scheduled, stageNumber: 1, matchNumber: 1, status: 'finalized' },
                    { ...scheduled, stageNumber: 2, matchNumber: 1, status: 'scheduled' },
                  ],
                  standingsPreview: groupedStandingsPreview,
                }
              : overview;
      res.end(JSON.stringify(response));
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
  overviewMode = 'default';
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
  const kickoff = page.locator('time[datetime="2099-09-24T16:00:00.000Z"]').first();
  await expect(kickoff).toBeVisible();
  expect(await kickoff.textContent()).not.toContain('2099-09-24T16:00:00.000Z');
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

test('leaders follow public table order and group rows per group while group stage has unplayed matches', async ({
  page,
}) => {
  overviewMode = 'grouped-in-play';
  await page.goto(`/es${PAGE}`);

  const section = page.locator('.cl-standings-section');
  await expect(section.getByRole('heading', { name: 'Líderes' })).toBeVisible();
  const groupHeadings = section.locator('h3.cl-standings-group-heading');
  await expect(groupHeadings).toHaveText(['Grupo A', 'Grupo B']);

  const groups = section.locator('.cl-standings-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0).locator('tbody tr')).toHaveCount(2);
  await expect(groups.nth(0).locator('tbody tr').nth(0)).toContainText('Talleres');
  await expect(groups.nth(0).locator('tbody tr').nth(1)).toContainText('Andes');
  await expect(groups.nth(1).locator('tbody tr').nth(0)).toContainText('San Martín');
});

test('leaders section is omitted once every match of standingsStageNumber is final', async ({
  page,
}) => {
  overviewMode = 'group-stage-complete';
  await page.goto(`/es${PAGE}`);

  await expect(page.locator('.cl-standings-section')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Líderes' })).toHaveCount(0);
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

test('marks a match 20 minutes past kickoff as delayed and keeps it out of the upcoming list', async ({
  page,
}) => {
  overviewMode = 'delayed-queue';
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

  await page.goto(`/es${PAGE}`);

  const liveHero = page.locator('.cl-match-card-grid').first();
  const delayedSection = page.locator('section[aria-labelledby="live-delayed-heading"]');
  const upcomingHeading = page.getByRole('heading', { name: 'Próximos', level: 2 });
  const timeZoneNote = page.locator('.cl-time-zone-note');

  await expect(liveHero).toContainText('Andes');
  await expect(delayedSection).toBeVisible();
  await expect(delayedSection.getByRole('heading', { name: 'Demorado', level: 2 })).toBeVisible();
  await expect(delayedSection).toContainText('Club Demorado');
  const delayedBadge = delayedSection.locator('.cl-state--delayed');
  await expect(delayedBadge).toContainText('Demorado');
  await expect(delayedBadge.locator('svg.cl-icon')).toHaveCount(1);

  await expect(timeZoneNote).toHaveCount(1);
  await expect(timeZoneNote).toContainText('Horarios:');
  await expect(upcomingHeading).toBeVisible();

  // Order: live hero -> delayed section -> time-zone note -> Upcoming heading.
  const order = await page.evaluate(() => {
    const heroEl = document.querySelector('.cl-match-card-grid');
    const delayedEl = document.querySelector('section[aria-labelledby="live-delayed-heading"]');
    const tzEl = document.querySelector('.cl-time-zone-note');
    const upcomingEl = Array.from(document.querySelectorAll('h2')).find(
      (h) => h.textContent?.trim() === 'Próximos',
    );
    if (!heroEl || !delayedEl || !tzEl || !upcomingEl) return null;
    const after = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return after(heroEl, delayedEl) && after(delayedEl, tzEl) && after(tzEl, upcomingEl);
  });
  expect(order).toBe(true);

  const upcomingGrid = page.locator('.cl-match-card-grid').nth(2);
  await expect(upcomingGrid.locator('article')).toHaveCount(5);
  await expect(upcomingGrid).not.toContainText('Club Demorado');
  await expect(upcomingGrid).toContainText('Futuro Local 1');
  await expect(upcomingGrid).toContainText('Futuro Local 5');
  await expect(upcomingGrid).not.toContainText('Futuro Local 6');

  // With no live match, the delayed match is never offered as the next kickoff.
  liveResponse = { matches: [] };
  await page.goto(`/es${PAGE}`);
  await expect(page.getByText('Próximo partido programado:')).toBeVisible();
  const nextKickoffTime = page
    .locator('.cl-live-hero, .cl-interaction-empty-state, main')
    .getByText(/Próximo partido programado:/)
    .locator('..')
    .locator('time')
    .first();
  const delayedMatchTime = await delayedSection.locator('time').first().getAttribute('datetime');
  expect(await nextKickoffTime.getAttribute('datetime')).not.toBe(delayedMatchTime);
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
