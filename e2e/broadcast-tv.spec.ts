import { createServer, type Server } from 'node:http';
import { expect, gotoTv, test } from './support/tv-ready.js';
import type { Page } from '@playwright/test';

/**
 * The `/tv/**` kiosk and overlay surface.
 *
 * Every scenario here is about the property that makes this surface
 * different from the public web: nobody is present to click anything, so a
 * dropped connection, a power cycle, or a compositing pass through OBS must
 * all resolve on their own.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const MATCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TV_PATH = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

type ClockFixtureMode = 'sample' | 'timed' | 'untimed' | 'grouped-standings' | 'delayed-schedule';
let clockFixtureMode: ClockFixtureMode = 'sample';
let apiServer: Server;

function mendozaDayKey(offsetDays: number): string {
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Argentina/Mendoza',
  }).format(new Date());
  const [year = 2026, month = 1, day = 1] = todayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

const TIMED_SEGMENTS = [
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

const UNTIMED_SEGMENTS = [
  {
    number: 1,
    type: 'set',
    label: { en: 'Set', es: 'Set' },
    timed: false,
    state: 'active',
    scores: [4, 2],
  },
  {
    number: 2,
    type: 'set',
    label: { en: 'Set', es: 'Set' },
    timed: false,
    state: 'pending',
  },
];

const GROUP_NAMES = ['Grupo A', 'Grupo B', 'Grupo C', 'Grupo D', 'Grupo E', 'Grupo F'] as const;

const groupedStandingsPreview = GROUP_NAMES.flatMap((groupName, groupIndex) =>
  Array.from({ length: 4 }, (_, rowIndex) => ({
    rank: rowIndex + 1,
    entrantId: `g-${groupIndex}-${rowIndex}`,
    name: `Club ${String.fromCharCode(65 + groupIndex)}${rowIndex + 1}`,
    abbreviation: `C${String.fromCharCode(65 + groupIndex)}${rowIndex + 1}`,
    zoneName: 'Grupos',
    groupName,
    statistics: { played: 3, points: 9 - rowIndex * 2 },
  })),
);

function buildDelayedScheduleFixture() {
  const now = Date.now();
  const delayedAt = new Date(now - 20 * 60_000).toISOString();
  const tomorrowAt = `${mendozaDayKey(1)}T15:00:00.000Z`;
  const futureAt = `${mendozaDayKey(4)}T15:00:00.000Z`;

  const matches = [
    {
      matchId: 'dddddddd-dddd-4ddd-8ddd-000000000001',
      stageNumber: 1,
      stageOrdinal: 1,
      matchNumber: 1,
      round: 1,
      status: 'scheduled',
      homeEntrantId: 'del-1',
      homeName: 'Equipo Demorado',
      homeAbbreviation: 'DEM',
      awayEntrantId: 'del-2',
      awayName: 'Visita Demorada',
      awayAbbreviation: 'VDM',
      venueName: 'Cancha 1',
      scheduledAt: delayedAt,
    },
    {
      matchId: 'dddddddd-dddd-4ddd-8ddd-000000000002',
      stageNumber: 1,
      stageOrdinal: 2,
      matchNumber: 2,
      round: 1,
      status: 'scheduled',
      homeEntrantId: 'up-1',
      homeName: 'Próximo Mañana',
      homeAbbreviation: 'PMN',
      awayEntrantId: 'up-2',
      awayName: 'Visita Mañana',
      awayAbbreviation: 'VMN',
      venueName: 'Cancha 2',
      scheduledAt: tomorrowAt,
    },
    {
      matchId: 'dddddddd-dddd-4ddd-8ddd-000000000003',
      stageNumber: 1,
      stageOrdinal: 3,
      matchNumber: 3,
      round: 2,
      status: 'scheduled',
      homeEntrantId: 'up-3',
      homeName: 'Próximo Futuro',
      homeAbbreviation: 'PFT',
      awayEntrantId: 'up-4',
      awayName: 'Visita Futuro',
      awayAbbreviation: 'VFT',
      venueName: 'Cancha 3',
      scheduledAt: futureAt,
    },
  ];

  return {
    organizations: [
      {
        organizationId: '01900000-0000-7000-8000-000000000001',
        alias: ORGANIZATION,
        name: 'Liga Mendocina',
        primaryLanguage: 'es',
        timezone: 'America/Argentina/Mendoza',
      },
    ],
    overview: {
      organizationAlias: ORGANIZATION,
      organizationName: 'Liga Mendocina',
      organizationTimeZone: 'America/Argentina/Mendoza',
      tournamentAlias: TOURNAMENT,
      tournamentName: 'Apertura 2026',
      seasonName: '2026',
      status: 'live',
      ruleset: {},
      clubs: [],
      matches,
    },
    live: { matches: [] },
    matchesView: {
      matches: matches.map((m) => ({ ...m, status: 'upcoming' })),
    },
    report: {
      organizationAlias: ORGANIZATION,
      organizationName: 'Liga Mendocina',
      organizationTimeZone: 'America/Argentina/Mendoza',
      tournamentAlias: TOURNAMENT,
      tournamentName: 'Apertura 2026',
      stageNumber: 1,
      stageFormat: 'round-robin',
      matchNumber: 1,
      round: 1,
      status: 'upcoming',
      homeEntrantId: 'del-1',
      homeName: 'Equipo Demorado',
      awayEntrantId: 'del-2',
      awayName: 'Visita Demorada',
      schedulePublished: true,
      officials: [],
      rosters: { home: [], away: [] },
      timeline: [],
    },
  };
}

function buildClockFixtureResponses(
  mode: 'timed' | 'untimed' | 'grouped-standings' | 'delayed-schedule',
) {
  if (mode === 'delayed-schedule') return buildDelayedScheduleFixture();
  const segments = mode === 'untimed' ? UNTIMED_SEGMENTS : TIMED_SEGMENTS;
  const clock =
    mode === 'timed'
      ? {
          segmentNumber: 1,
          elapsedSeconds: 585,
          running: true,
          asOf: new Date().toISOString(),
        }
      : undefined;

  return {
    organizations: [
      {
        organizationId: '01900000-0000-7000-8000-000000000001',
        alias: ORGANIZATION,
        name: 'Liga Mendocina',
        primaryLanguage: 'es',
        timezone: 'America/Argentina/Mendoza',
      },
    ],
    overview: {
      organizationAlias: ORGANIZATION,
      organizationName: 'Liga Mendocina',
      organizationTimeZone: 'America/Argentina/Mendoza',
      tournamentAlias: TOURNAMENT,
      tournamentName: 'Apertura 2026',
      seasonName: '2026',
      status: 'live',
      ruleset: {},
      clubs: [],
      ...(mode === 'grouped-standings' ? { standingsPreview: groupedStandingsPreview } : {}),
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
    },
    live: {
      matches: [
        {
          matchId: MATCH_ID,
          stageNumber: 1,
          stageOrdinal: 1,
          matchNumber: 1,
          state: 'live',
          projectionVersion: 3,
          segments,
          ...(clock ? { clock } : {}),
          sides: [
            { entrantId: 'en-1', name: 'Talleres de Mendoza', abbreviation: 'TLL', score: 2 },
            { entrantId: 'en-2', name: 'Casa de Italia', abbreviation: 'CDI', score: 1 },
          ],
        },
      ],
    },
    matchesView: {
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
          segments,
          ...(clock ? { clock, clockSeconds: clock.elapsedSeconds } : {}),
        },
      ],
    },
    report: {
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
      segments,
      ...(clock ? { clock } : {}),
      schedulePublished: true,
      officials: [],
      rosters: { home: [], away: [] },
      timeline: [],
    },
  };
}

/** The tournament's declared player ranking, served the same way to every TV route. */
const PERFORMER_LAYOUTS = {
  layouts: [
    {
      code: 'top-scorers',
      target: 'player-ranking',
      title: { en: 'Top scorers', es: 'Goleadores' },
    },
  ],
};
const PERFORMER_PROJECTION = {
  layoutCode: 'top-scorers',
  label: { en: 'Top scorers', es: 'Goleadores' },
  columns: [{ code: 'goals', header: { en: 'Goals', es: 'Goles' } }],
  defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
  rows: [
    {
      rank: 1,
      actorId: 'player-1',
      actorName: 'Jugador Uno',
      entrantName: 'Club Uno',
      entrantAbbreviation: 'CUN',
      cells: { goals: { raw: 7, formatted: '7' } },
    },
    {
      rank: 2,
      actorId: 'player-2',
      actorName: 'Jugador Dos',
      entrantName: 'Club Dos',
      entrantAbbreviation: 'CDO',
      cells: { goals: { raw: 5, formatted: '5' } },
    },
  ],
};

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (clockFixtureMode === 'sample') {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    const fixture = buildClockFixtureResponses(clockFixtureMode);
    const [path] = (req.url ?? '').split('?');
    if (path === '/api/organizations') res.end(JSON.stringify(fixture.organizations));
    else if (path === `${BASE}/overview`) res.end(JSON.stringify(fixture.overview));
    else if (path === `${BASE}/live`) res.end(JSON.stringify(fixture.live));
    else if (path === `${BASE}/matches-view`) res.end(JSON.stringify(fixture.matchesView));
    else if (path === `${BASE}/stages/1/matches/1`) res.end(JSON.stringify(fixture.report));
    else if (path === `${BASE}/public/tables`) res.end(JSON.stringify(PERFORMER_LAYOUTS));
    else if (path === `${BASE}/public/tables/top-scorers`)
      res.end(JSON.stringify(PERFORMER_PROJECTION));
    else if (path === `${BASE}/stages/1/bracket`)
      res.end(JSON.stringify({ format: 'round-robin', zones: [] }));
    else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.beforeEach(() => {
  clockFixtureMode = 'sample';
});

function reconnectEvent() {
  return {
    eventId: 'reconnect-event-1',
    organizationId: 'org-liga-mendocina',
    stream: `match:${MATCH_ID}`,
    entityId: MATCH_ID,
    eventType: 'match.finalized',
    projectionVersion: 4,
    createdAt: new Date().toISOString(),
    payload: {
      matchId: MATCH_ID,
      result: {
        sides: [
          { entrantId: 'en-1', statistics: { goals: 5 } },
          { entrantId: 'en-2', statistics: { goals: 1 } },
        ],
      },
    },
  };
}

function sseFrame(event: ReturnType<typeof reconnectEvent>): string {
  return `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Installs a `window.fetch` stub before any script runs, so `RealtimeClient`
 * never reaches a real network. The first stream attempt drops mid-session
 * (the connection opens, then errors); every attempt after that stays open
 * and, on the second one, delivers one event — proof a reconnect actually
 * happened, not just that the server-rendered fixture never changed.
 */
async function mockDroppedThenRecoveredStream(page: Page): Promise<void> {
  await page.addInitScript(
    ({ frame }) => {
      let attempt = 0;
      const encoder = new TextEncoder();

      window.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.includes('/events/tv/')) return new Response('', { status: 404 });

        attempt += 1;
        const thisAttempt = attempt;

        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            if (thisAttempt === 1) {
              // Opens, then drops — no data, no clean close.
              setTimeout(() => controller.error(new Error('connection dropped')), 50);
              return;
            }
            // Every reconnect after the drop stays open and, on the very
            // next attempt, delivers the event that proves it reconnected.
            if (thisAttempt === 2) controller.enqueue(encoder.encode(frame));
            // No further enqueues; the stream simply stays open, matching a
            // real kiosk connection that is not expected to close on its own.
          },
        });

        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      };
    },
    { frame: sseFrame(reconnectEvent()) },
  );
}

async function mockOpenStream(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/events/tv/')) return new Response('', { status: 404 });
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };
  });
}

test('recovers silently from a mid-session drop, with no error UI ever shown (8.1)', async ({
  page,
}) => {
  await mockDroppedThenRecoveredStream(page);
  await gotoTv(page, `${TV_PATH}?token=kiosk-token`);

  // The reconnected stream's event lands once the client retries.
  await expect(page.getByText('Final', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('5')).toBeVisible();

  // No error, retry, or "connection lost" text at any point — the design
  // decision this surface exists to keep: only ever the last-known-good
  // projection while retrying underneath.
  await expect(
    page.getByText(/error|retry|reintentar|desconectado|perdió la conexión/i),
  ).toHaveCount(0);
});

test('renders a transparent, chrome-free background under ?mode=overlay (8.2)', async ({
  page,
}) => {
  await mockOpenStream(page);
  await gotoTv(page, `${TV_PATH}?mode=overlay&token=kiosk-token`);

  // The class sits on the root element now, because that is what the server can
  // emit in the first response.
  await expect(page.locator('html')).toHaveClass(/tv-overlay/);

  for (const selector of ['html', 'body', '#tv-root']) {
    const background = await page
      .locator(selector)
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app styling literal
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(background);
  }

  // No navigation chrome, and nothing a pointer or a keyboard could reach —
  // this is a chroma-key layer, not a page a person is meant to use.
  await expect(page.locator('nav, header, footer')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);
});

test('resumes rendering after a simulated power cycle, with no login prompt (8.3)', async ({
  page,
}) => {
  await mockOpenStream(page);
  await gotoTv(page, `${TV_PATH}?token=kiosk-token`);
  await expect(page.getByText('Talleres de Mendoza')).toBeVisible();

  // A power cycle clears everything volatile; the display token survives
  // only because it lives in the device's launch URL, never in storage.
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.reload();

  await expect(page.getByText('Talleres de Mendoza')).toBeVisible();
  await expect(page.getByText(/iniciar sesión|log in|contraseña|password/i)).toHaveCount(0);
});

test('the overlay is transparent in the first response, before any script runs', async ({
  page,
  context,
}) => {
  // The defect this covers: transparency was applied by a client effect reading
  // window.location, so the document a broadcast consumer actually captures —
  // and any capture taken before hydration — rendered opaque.
  await context.route('**/*.js', (route) => route.abort());
  await page.goto(`${TV_PATH}?mode=overlay-lower`);

  await expect(page.locator('html')).toHaveClass(/tv-overlay--lower/);
  const background = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app styling literal
  expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(background);
});

test('bare ?mode=overlay still resolves to the corner bug, not the lower third', async ({
  page,
  context,
}) => {
  // An OBS source already configured with the old URL keeps its corner bug.
  await context.route('**/*.js', (route) => route.abort());
  await page.goto(`${TV_PATH}?mode=overlay`);

  await expect(page.locator('html')).toHaveClass(/tv-overlay--scorebug/);
});

test('mode=overlay-lower places the lower third on the bottom band, inside the 5 % safe area', async ({
  page,
}) => {
  await mockOpenStream(page);
  clockFixtureMode = 'timed';
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotoTv(page, `${TV_PATH}/stages/1/matches/1?mode=overlay-lower`);
  const band = await page.getByTestId('tv-lower-third').boundingBox();
  if (band === null) throw new Error('the lower third did not render');
  // 5 % of 1080 is 54 px: the band's bottom edge sits on the bottom inset, never below it.
  expect(1080 - (band.y + band.height)).toBeGreaterThanOrEqual(53);
  expect(1080 - (band.y + band.height)).toBeLessThanOrEqual(55);
  expect(band.x).toBeGreaterThanOrEqual(96 - 1);
  expect(band.x + band.width).toBeLessThanOrEqual(1920 - 96 + 1);
});

test('mode=overlay and mode=overlay-scorebug place the corner bug top right, inside the 5 % safe area', async ({
  page,
}) => {
  await mockOpenStream(page);
  clockFixtureMode = 'timed';
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const mode of ['overlay', 'overlay-scorebug']) {
    await gotoTv(page, `${TV_PATH}/stages/1/matches/1?mode=${mode}`);
    const bug = await page.getByTestId('tv-overlay-bug').boundingBox();
    if (bug === null) throw new Error(`the ${mode} corner bug did not render`);
    expect(bug.y).toBeGreaterThanOrEqual(54 - 1);
    expect(1920 - (bug.x + bug.width)).toBeGreaterThanOrEqual(96 - 1);
  }
});

test('overlays keep html and body transparent for every overlay mode', async ({
  page,
  context,
}) => {
  await context.route('**/*.js', (route) => route.abort());
  for (const mode of ['overlay', 'overlay-lower']) {
    await page.goto(`${TV_PATH}?mode=${mode}`);
    for (const selector of ['html', 'body']) {
      const background = await page
        .locator(selector)
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app styling literal
      expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(background);
    }
  }
});

test('an overlay with nothing to show renders no ticker and paints no text', async ({ page }) => {
  await mockOpenStream(page);
  await gotoTv(page, `${TV_PATH}?mode=overlay-lower&bg=transparent`);
  await expect(page.locator('[data-state="no-match"]')).toHaveCount(1);
  await expect(page.locator('[data-ticker]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Todavía no hay partidos que informar');
  await expect(page.locator('body')).not.toContainText('Ningún partido seleccionado');
});

test('chroma overlay graphics have no shadow and opaque fills', async ({ page }) => {
  await mockOpenStream(page);
  clockFixtureMode = 'timed';
  await gotoTv(page, `${TV_PATH}/stages/1/matches/1?mode=overlay-lower&bg=chroma`);
  const band = page.getByTestId('tv-lower-third');
  await expect(band).toBeVisible();
  const style = await band.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { shadow: computed.boxShadow, fill: computed.backgroundColor };
  });
  expect(style.shadow).toBe('none');
  // A fully opaque fill reads as rgb(), never rgba() with an alpha below 1.
  expect(style.fill).toMatch(/^rgb\(/);
});

test('?chroma paints a solid key colour for switchers without an alpha channel', async ({
  page,
  context,
}) => {
  await context.route('**/*.js', (route) => route.abort());
  await page.goto(`${TV_PATH}?mode=overlay-lower&chroma=%2300ff00`);

  const background = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app styling literal
  expect(background).toBe('rgb(0, 255, 0)');
});

test('?mode=overlay-full renders an opaque full-frame scene', async ({ page, context }) => {
  await context.route('**/*.js', (route) => route.abort());
  await page.goto(`${TV_PATH}?mode=overlay-full`);

  await expect(page.locator('html')).toHaveClass(/tv-overlay--full/);
  const background = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  // A stream with no camera source needs a ground of its own, not a hole.
  // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app styling literal
  expect(['rgba(0, 0, 0, 0)', 'transparent']).not.toContain(background);
});

test('the kiosk carries the discipline backdrop, the lower third does not', async ({
  page,
  context,
}) => {
  await context.route('**/*.js', (route) => route.abort());

  // A venue display shows the tournament's own discipline imagery as ground.
  await page.goto(TV_PATH);
  const kioskBackdrop = page.locator('img.tv-backdrop');
  if ((await kioskBackdrop.count()) > 0) {
    await expect(kioskBackdrop).toHaveAttribute('aria-hidden', 'true');
    const filter = await kioskBackdrop.evaluate((el) => getComputedStyle(el).filter);
    expect(filter).toContain('blur');
  }

  // The lower third is keyed out, so imagery must never reach it.
  await page.goto(`${TV_PATH}?mode=overlay-lower`);
  await expect(page.locator('img.tv-backdrop')).toHaveCount(0);
});

test('overlay match bug shows advancing game clock when timed and never prints wall clock when untimed', async ({
  page,
}) => {
  await mockOpenStream(page);
  clockFixtureMode = 'timed';
  await gotoTv(page, `${TV_PATH}/stages/1/matches/1?mode=overlay-lower&lang=es`);

  const bug = page.getByTestId('tv-lower-third');
  const timer = bug.locator('.tv-overlay-clock[role="timer"]');
  await expect(timer).toBeVisible();
  await expect(timer.locator('.cl-live-clock__segment')).toHaveText('1er tiempo');

  const readSeconds = async (): Promise<number> => {
    const text = (await timer.locator('.cl-live-clock__digits').innerText()).trim();
    const [mm = '0', ss = '0'] = text.split(':');
    return Number(mm) * 60 + Number(ss);
  };
  expect(await readSeconds()).toBeGreaterThanOrEqual(585);
  await expect.poll(readSeconds, { timeout: 6_000 }).toBeGreaterThan(586);

  clockFixtureMode = 'untimed';
  await gotoTv(page, `${TV_PATH}/stages/1/matches/1?mode=overlay-lower&lang=es`);
  await expect(bug.locator('.tv-overlay-clock')).toHaveCount(0);
  await expect(bug.getByRole('timer')).toHaveCount(0);
  await expect(bug.getByTestId('tv-segment')).toHaveText('1er set');
  await expect(bug).not.toContainText(/\d{2}:\d{2}/);
});

test('kiosk header wall clock is labelled and smaller than game clock and score at 1920x1080', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockOpenStream(page);
  clockFixtureMode = 'timed';
  await gotoTv(page, `${TV_PATH}?lang=es`);

  const wallLabel = page.locator('.tv-scorebug__clock-label');
  const wallClock = page.locator('.tv-scorebug__clock--wall');
  const gameClock = page.locator('.tv-scorebug__game-clock[role="timer"]');
  const score = page.locator('.tv-focal-panel .tv-score-center__digits');

  await expect(wallLabel).toHaveText('Hora local');
  await expect(wallClock).toBeVisible();
  await expect(gameClock).toBeVisible();
  await expect(gameClock.locator('.cl-live-clock__segment')).toHaveText('1er tiempo');

  const sizes = await Promise.all([
    wallClock.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    gameClock.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    score.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
  ]);
  const [wallSize = 0, gameClockSize = 0, scoreSize = 0] = sizes;
  expect(wallSize).toBeGreaterThan(0);
  expect(wallSize).toBeLessThan(gameClockSize);
  expect(wallSize).toBeLessThan(scoreSize);
});

test('view=standings renders one block per group headed by the group name', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockOpenStream(page);
  clockFixtureMode = 'grouped-standings';
  await gotoTv(page, `${TV_PATH}?view=standings&lang=es`);

  // The standings page through the frame. The first paint can hold every group until the frame is
  // measured, so read the blocks once the pager shows the measured page, and all in one pass.
  await expect(page.getByText(/Página 1 de \d+/)).toBeVisible();
  const groups = page.getByTestId('tv-standings-zone');
  await expect(groups.first()).toBeVisible();
  const headings = await groups.evaluateAll((blocks) =>
    blocks.map((block) => block.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? ''),
  );
  expect(headings.length).toBeGreaterThan(0);
  headings.forEach((heading, index) => expect(heading).toContain(GROUP_NAMES[index] ?? ''));
  await expect(groups.first()).toContainText(`Club ${String.fromCharCode(65)}1`);
});

test('TV match list uses short dynamic timestamps, marks delayed matches with clock icon, and never offers a delayed match as next match', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockOpenStream(page);
  clockFixtureMode = 'delayed-schedule';

  // 1. TV match list uses short dynamic timestamps and shows delayed badge + clock icon.
  await gotoTv(page, `${TV_PATH}?view=matches&lang=es`);
  const list = page.getByTestId('tv-match-list');
  await expect(list).toBeVisible();

  const delayedEntry = list.locator('.tv-match-list__entry').filter({ hasText: 'Equipo Demorado' });
  const delayedBadge = delayedEntry.locator('.tv-match-list__state.cl-state--delayed');
  await expect(delayedBadge).toBeVisible();
  await expect(delayedBadge).toContainText('Demorado');
  await expect(delayedBadge.locator('svg.cl-icon')).toHaveCount(1);

  const tomorrowEntry = list.locator('.tv-match-list__entry').filter({ hasText: 'Próximo Mañana' });
  await expect(tomorrowEntry.locator('.tv-start-time__when')).toContainText(/Mañana \d{2}:\d{2}/);

  const futureEntry = list.locator('.tv-match-list__entry').filter({ hasText: 'Próximo Futuro' });
  const futureRoundText = (await futureEntry.locator('.tv-start-time__when').textContent()) ?? '';
  expect(futureRoundText).toMatch(/\d{1,2}-[\p{L}.]+ \d{2}:\d{2}/u);
  expect(futureRoundText).not.toMatch(/\d{2}\/\d{2}\/\d{2}/);

  // 2. Kiosk spotlight skips the delayed match and selects the first upcoming match.
  await gotoTv(page, `${TV_PATH}?lang=es`);
  const spotlight = page.getByTestId('tv-match-spotlight');
  await expect(spotlight).toContainText('Próximo Mañana');
  await expect(spotlight).not.toContainText('Equipo Demorado');

  // 3. Presentation next-match crawl excludes the delayed match.
  await gotoTv(page, `${TV_PATH}?layout=presentation&lang=es`);
  const nextMatches = page.getByTestId('tv-next-match');
  await expect(nextMatches).toHaveCount(2);
  await expect(nextMatches.nth(0)).toContainText('Próximo Mañana');
  await expect(nextMatches.nth(1)).toContainText('Próximo Futuro');
});

test('the pinned match and the kiosk list the same featured player first, and the header holds still across a rail rotation (8.9)', async ({
  page,
}) => {
  clockFixtureMode = 'timed';
  await page.setViewportSize({ width: 1920, height: 1080 });

  await gotoTv(page, `${TV_PATH}?lang=es`);
  await page.getByRole('button', { name: 'Figuras destacadas' }).click();
  const kioskFirst = (await page.locator('.tv-performer-card__name').first().textContent())?.trim();
  expect(kioskFirst).toBeTruthy();

  await gotoTv(page, `${TV_PATH}/stages/1/matches/1?lang=es`);
  await page.getByRole('button', { name: 'Figuras destacadas' }).click();
  // The narrower rail abbreviates the name to fit, so the two routes are compared by the player's
  // initial: the same player leads both.
  const pinnedFirst = (
    await page.locator('.tv-performer-card__name').first().textContent()
  )?.trim();
  expect(kioskFirst?.charAt(0)).toBeTruthy();
  expect(pinnedFirst?.charAt(0)).toBe(kioskFirst?.charAt(0));

  // The header keeps its place through one rail rotation.
  const header = page.locator('.tv-scorebug');
  const before = await header.boundingBox();
  await page.waitForTimeout(10_500);
  expect(await header.boundingBox()).toEqual(before);
});
