import { createServer, type Server } from 'node:http';
import { expect, gotoTv, HYDRATION_ERROR, test } from './support/tv-ready.js';

/**
 * Every TV island hydrates the markup the server sent, whatever the browser
 * prefers. The server cannot know the viewer's motion preference, so a value
 * read from the browser during the first client render would differ from the
 * server's and React would throw away the markup, along with any click made
 * meanwhile. The guard in `support/tv-ready.ts` fails on such an error; this
 * spec also lists what each page raised, so a failure names the page.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TV_PATH = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const MATCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
  asOf: new Date().toISOString(),
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  organizationTimeZone: 'America/Argentina/Mendoza',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Apertura 2026',
  seasonName: '2026',
  status: 'live',
  ruleset: {},
  clubs: [],
  matches: [
    {
      matchId: MATCH_ID,
      stageNumber: 1,
      stageOrdinal: 1,
      matchNumber: 1,
      round: 1,
      status: 'in-progress',
      homeEntrantId: 'en-1',
      homeName: 'Talleres de Mendoza',
      homeAbbreviation: 'TLL',
      homeScore: 2,
      awayEntrantId: 'en-2',
      awayName: 'Casa de Italia',
      awayAbbreviation: 'CDI',
      awayScore: 1,
      venueName: 'Cancha 1',
    },
  ],
};

const live = {
  matches: [
    {
      matchId: MATCH_ID,
      stageNumber: 1,
      stageOrdinal: 1,
      matchNumber: 1,
      state: 'live',
      projectionVersion: 3,
      venueName: 'Cancha 1',
      segments: SEGMENTS,
      clock: CLOCK,
      sides: [
        { entrantId: 'en-1', name: 'Talleres de Mendoza', abbreviation: 'TLL', score: 2 },
        { entrantId: 'en-2', name: 'Casa de Italia', abbreviation: 'CDI', score: 1 },
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
      homeName: 'Talleres de Mendoza',
      homeAbbreviation: 'TLL',
      homeScore: 2,
      awayName: 'Casa de Italia',
      awayAbbreviation: 'CDI',
      awayScore: 1,
      venueName: 'Cancha 1',
      segments: SEGMENTS,
      clock: CLOCK,
      clockSeconds: CLOCK.elapsedSeconds,
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
  homeEntrantId: 'en-1',
  homeName: 'Talleres de Mendoza',
  homeScore: 2,
  awayEntrantId: 'en-2',
  awayName: 'Casa de Italia',
  awayScore: 1,
  segments: SEGMENTS,
  clock: CLOCK,
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === '/api/organizations') {
      res.end(
        JSON.stringify([
          {
            organizationId: '01900000-0000-7000-8000-000000000001',
            alias: ORGANIZATION,
            name: 'Liga Mendocina',
            primaryLanguage: 'en',
            timezone: 'America/Argentina/Mendoza',
          },
        ]),
      );
    } else if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
    } else if (path === `${BASE}/live`) {
      res.end(JSON.stringify(live));
    } else if (path === `${BASE}/matches-view`) {
      res.end(JSON.stringify(matchesView));
    } else if (path === `${BASE}/stages/1/matches/1`) {
      res.end(JSON.stringify(matchReport));
    } else if (path === `${BASE}/stages/1/bracket`) {
      res.end(JSON.stringify({ format: 'round-robin', zones: [] }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

const ROUTES = [
  { name: 'kiosk', path: TV_PATH },
  { name: 'lower third', path: `${TV_PATH}/stages/1/matches/1?mode=overlay-lower` },
  { name: 'full overlay', path: `${TV_PATH}/stages/1/matches/1?mode=overlay-full` },
  { name: 'multi-court grid', path: `${TV_PATH}?layout=multicourt` },
] as const;

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  for (const route of ROUTES) {
    test(`the ${route.name} hydrates without mismatch (motion: ${reducedMotion})`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        if (HYDRATION_ERROR.test(error.message)) errors.push(error.message);
      });
      await page.emulateMedia({ reducedMotion });
      await page.setViewportSize({ width: 1920, height: 1080 });

      await gotoTv(page, route.path);

      await expect(page.getByRole('timer').first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

test('a rail tab clicked once the kiosk has hydrated shows its section and keeps it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotoTv(page, TV_PATH);

  const tab = page.getByRole('button', { name: 'Top performers' });
  await tab.click();

  await expect(tab).toHaveClass(/tv-rail-tab--active/);
  await expect(page.getByTestId('tv-rail-content')).toBeVisible();
});
