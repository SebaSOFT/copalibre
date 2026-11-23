import { createServer, type Server } from 'node:http';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const MATCH_ID = '01936f4a-2001-7000-8000-000000000001';
const HOME_ID = '01936f4a-0001-7000-8000-000000000001';
const AWAY_ID = '01936f4a-0002-7000-8000-000000000002';
const AS_OF = '2026-09-24T16:10:00.000Z';
const CHANGED_AT = '2026-09-24T16:12:00.000Z';

const SEGMENTS = [
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
];

const CLOCK = {
  segmentNumber: 1,
  elapsedSeconds: 585,
  running: true,
  asOf: AS_OF,
};

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

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  organizationTimeZone: 'America/Argentina/Mendoza',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  status: 'live',
  matches: [
    {
      matchId: MATCH_ID,
      stageNumber: 1,
      stageOrdinal: 1,
      matchNumber: 1,
      round: 1,
      homeEntrantId: HOME_ID,
      homeName: 'Talleres',
      awayEntrantId: AWAY_ID,
      awayName: 'Andes',
      homeScore: 2,
      awayScore: 1,
      status: 'in-progress',
      scheduledAt: '2026-09-24T16:00:00.000Z',
    },
  ],
  clubs: [],
  ruleset: {},
};

const live = {
  matches: [
    {
      matchId: MATCH_ID,
      stageNumber: 1,
      stageOrdinal: 1,
      matchNumber: 1,
      state: 'live',
      projectionVersion: 1,
      segments: SEGMENTS,
      clock: CLOCK,
      sides: [
        { entrantId: HOME_ID, name: 'Talleres', score: 2 },
        { entrantId: AWAY_ID, name: 'Andes', score: 1 },
      ],
    },
  ],
};

const matchesView = {
  matches: [
    {
      matchId: MATCH_ID,
      stageNumber: 1,
      matchNumber: 1,
      round: 1,
      status: 'live',
      homeName: 'Talleres',
      homeScore: 2,
      awayName: 'Andes',
      awayScore: 1,
      segments: SEGMENTS,
      clock: CLOCK,
      clockSeconds: CLOCK.elapsedSeconds,
      scheduledAt: '2026-09-24T16:00:00.000Z',
    },
  ],
};

const matchReport = {
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
  homeEntrantId: HOME_ID,
  homeName: 'Talleres',
  homeScore: 2,
  awayEntrantId: AWAY_ID,
  awayName: 'Andes',
  awayScore: 1,
  segments: SEGMENTS,
  clock: CLOCK,
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
};

function pauseEventFrame(): string {
  const event = {
    eventId: 'clock-pause-1',
    organizationId: '01900000-0000-7000-8000-000000000001',
    stream: `match:${MATCH_ID}`,
    entityId: MATCH_ID,
    eventType: 'match.clock-changed',
    projectionVersion: 2,
    createdAt: CHANGED_AT,
    payload: {
      matchId: MATCH_ID,
      segmentNumber: 1,
      elapsedSeconds: 585,
      running: false,
      changedAt: CHANGED_AT,
    },
  };
  return `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function mockPublicSse(page: Page, mode: 'open' | 'pause' | 'fail'): Promise<void> {
  const frame = mode === 'pause' ? pauseEventFrame() : '';
  await page.addInitScript(
    ({ streamMode, sseFrame }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes('/events/public/')) return originalFetch(input, init);
        if (streamMode === 'fail') {
          return new Response('service unavailable', { status: 503 });
        }
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            if (streamMode === 'pause' && sseFrame) {
              setTimeout(() => controller.enqueue(encoder.encode(sseFrame)), 500);
            }
          },
        });
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      };
    },
    { streamMode: mode, sseFrame: frame },
  );
}

let apiServer: Server;

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
      res.end(JSON.stringify(live));
      return;
    }
    if (path === `${BASE}/matches-view`) {
      res.end(JSON.stringify(matchesView));
      return;
    }
    if (path === `${BASE}/stages/1/matches/1`) {
      res.end(JSON.stringify(matchReport));
      return;
    }
    if (path === `${BASE}/stages/1/bracket`) {
      res.end(JSON.stringify({ format: 'round-robin', zones: [] }));
      return;
    }
    if (path === `${BASE}/public/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
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

const PUBLIC_SURFACES = [
  {
    name: 'overview',
    path: `/${ORGANIZATION}/tournaments/${TOURNAMENT}`,
    container: '.cl-overview-now',
    scores: '.cl-overview-now .cl-stat-tile__value',
  },
  {
    name: 'live dashboard',
    path: `/${ORGANIZATION}/tournaments/${TOURNAMENT}/live`,
    container: '.cl-match-card-grid',
    scores: '.cl-match-card-grid .cl-stat-tile__value',
  },
  {
    name: 'matches list',
    path: `/${ORGANIZATION}/tournaments/${TOURNAMENT}/matches`,
    container: '.cl-featured-match',
    scores: '.cl-featured-match .cl-stat-tile__value',
  },
  {
    name: 'match report',
    path: `/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1/matches/1`,
    container: '.cl-match-hero',
    scores: '.cl-match-hero .cl-team-score',
  },
] as const;

test('shows the same score, segment label and running clock across all four public surfaces', async ({
  page,
}) => {
  await mockPublicSse(page, 'open');

  for (const surface of PUBLIC_SURFACES) {
    await page.goto(surface.path);
    const scope = page.locator(surface.container).first();
    await expect(scope).toContainText('Talleres');
    await expect(scope).toContainText('Andes');
    await expect(page.locator(surface.scores)).toHaveText(['2', '1']);

    const timer = scope.getByRole('timer').first();
    await expect(timer).toBeVisible();
    await expect(timer.locator('.cl-live-clock__segment')).toHaveText('1st Half');

    const readSeconds = async (): Promise<number> => {
      const text = (await timer.locator('.cl-live-clock__digits').innerText()).trim();
      const [mm = '0', ss = '0'] = text.split(':');
      return Number(mm) * 60 + Number(ss);
    };
    expect(await readSeconds()).toBeGreaterThanOrEqual(585);
    await expect.poll(readSeconds, { timeout: 6_000 }).toBeGreaterThan(586);
  }
});

test('a match.clock-changed pause event stops the clock and shows Stopped without reload', async ({
  page,
}) => {
  await mockPublicSse(page, 'pause');

  for (const surface of PUBLIC_SURFACES) {
    await page.goto(surface.path);
    const scope = page.locator(surface.container).first();
    const timer = scope.getByRole('timer').first();

    await expect(timer.locator('.cl-live-clock__stopped')).toHaveText('Stopped', {
      timeout: 5_000,
    });
    await expect(timer.locator('.cl-live-clock__digits')).toHaveText('09:45');
    await page.waitForTimeout(1_500);
    await expect(timer.locator('.cl-live-clock__digits')).toHaveText('09:45');
  }
});

test('shows the localized Updated at notice when SSE disconnects', async ({ page }) => {
  await mockPublicSse(page, 'fail');

  for (const surface of PUBLIC_SURFACES) {
    await page.goto(surface.path);
    const updated = page.locator(`${surface.container} .cl-live-scoreboard__updated`).first();
    await expect(updated).toBeVisible({ timeout: 5_000 });
    await expect(updated).toContainText(/^Updated at /);

    await page.goto(`/es${surface.path}`);
    const updatedEs = page.locator(`${surface.container} .cl-live-scoreboard__updated`).first();
    await expect(updatedEs).toBeVisible({ timeout: 5_000 });
    await expect(updatedEs).toContainText(/^Actualizado a las /);
  }
});
