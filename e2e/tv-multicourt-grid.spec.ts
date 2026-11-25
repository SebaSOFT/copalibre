import { createServer, type Server } from 'node:http';
import { expect, gotoTv, test } from './support/tv-ready.js';
import type { Page } from '@playwright/test';
import { recordedFlashes, recordFlashes } from './support/flash-recorder.js';

/**
 * The `?layout=multicourt` grid mode on the `/tv/**` kiosk route — the same unattended-surface constraints as `broadcast-tv.spec.ts`
 * apply: nobody is present to click anything, so this checks the grid
 * actually mounts and reacts to a live SSE event, not just that the flag
 * parses.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const MATCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNTIMED_MATCH_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TV_PATH = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const COURT_CARD_VALUE = `[data-testid="tv-court-card-${MATCH_ID}"] .tv-court-card__value`;

let useClockFixtures = false;
/** One live court and four scheduled courts, for the rotation: the live court stays on every page. */
let courtRotation = false;
let apiServer: Server;

const ROTATION_LIVE_ID = MATCH_ID;
const scheduledCourt = (ordinal: number) => ({
  matchId: `dddddddd-dddd-4ddd-8ddd-ddddddddd${String(ordinal).padStart(3, '0')}`,
  stageNumber: 1,
  stageOrdinal: ordinal + 1,
  matchNumber: ordinal + 1,
  round: 1,
  status: 'scheduled',
  homeEntrantId: `sc-home-${ordinal}`,
  homeName: `Club Scheduled ${ordinal}`,
  homeAbbreviation: `CS${ordinal}`,
  awayEntrantId: `sc-away-${ordinal}`,
  awayName: `Visitante ${ordinal}`,
  awayAbbreviation: `VI${ordinal}`,
  scheduledAt: `2099-11-01T${String(10 + ordinal).padStart(2, '0')}:30:00Z`,
  venueName: `Cancha ${ordinal + 1}`,
});
const rotationOverview = {
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
      matchId: ROTATION_LIVE_ID,
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
    ...[1, 2, 3, 4].map(scheduledCourt),
  ],
};

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
    scores: [3, 2],
  },
  {
    number: 2,
    type: 'set',
    label: { en: 'Set', es: 'Set' },
    timed: false,
    state: 'pending',
  },
];

const rotationLive = {
  matchId: ROTATION_LIVE_ID,
  stageNumber: 1,
  stageOrdinal: 1,
  matchNumber: 1,
  state: 'live',
  projectionVersion: 3,
  venueName: 'Cancha 1',
  segments: TIMED_SEGMENTS,
  clock: { segmentNumber: 1, elapsedSeconds: 585, running: true, asOf: new Date().toISOString() },
  sides: [
    { entrantId: 'en-1', name: 'Talleres de Mendoza', abbreviation: 'TLL', score: 2 },
    { entrantId: 'en-2', name: 'Casa de Italia', abbreviation: 'CDI', score: 1 },
  ],
};

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (!useClockFixtures) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
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
    } else if (courtRotation && path === `${BASE}/overview`) {
      res.end(JSON.stringify(rotationOverview));
    } else if (courtRotation && path === `${BASE}/live`) {
      res.end(JSON.stringify({ matches: [rotationLive] }));
    } else if (path === `${BASE}/overview`) {
      res.end(
        JSON.stringify({
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
            {
              matchId: UNTIMED_MATCH_ID,
              stageNumber: 1,
              stageOrdinal: 2,
              matchNumber: 2,
              round: 1,
              status: 'in-progress',
              homeEntrantId: 'en-3',
              homeName: 'Andes',
              homeAbbreviation: 'AND',
              homeScore: 1,
              awayEntrantId: 'en-4',
              awayName: 'Palmira',
              awayAbbreviation: 'PAL',
              awayScore: 0,
              venueName: 'Cancha 2',
            },
          ],
        }),
      );
    } else if (path === `${BASE}/live`) {
      res.end(
        JSON.stringify({
          matches: [
            {
              matchId: MATCH_ID,
              stageNumber: 1,
              stageOrdinal: 1,
              matchNumber: 1,
              state: 'live',
              projectionVersion: 3,
              venueName: 'Cancha 1',
              segments: TIMED_SEGMENTS,
              clock: {
                segmentNumber: 1,
                elapsedSeconds: 585,
                running: true,
                asOf: new Date().toISOString(),
              },
              sides: [
                { entrantId: 'en-1', name: 'Talleres de Mendoza', abbreviation: 'TLL', score: 2 },
                { entrantId: 'en-2', name: 'Casa de Italia', abbreviation: 'CDI', score: 1 },
              ],
            },
            {
              matchId: UNTIMED_MATCH_ID,
              stageNumber: 1,
              stageOrdinal: 2,
              matchNumber: 2,
              state: 'live',
              projectionVersion: 3,
              venueName: 'Cancha 2',
              segments: UNTIMED_SEGMENTS,
              sides: [
                { entrantId: 'en-3', name: 'Andes', abbreviation: 'AND', score: 1 },
                { entrantId: 'en-4', name: 'Palmira', abbreviation: 'PAL', score: 0 },
              ],
            },
          ],
        }),
      );
    } else if (path === `${BASE}/matches-view`) {
      res.end(
        JSON.stringify({
          matches: [
            {
              matchId: MATCH_ID,
              stageNumber: 1,
              matchNumber: 1,
              round: 1,
              status: 'live',
              venueName: 'Cancha 1',
            },
            {
              matchId: UNTIMED_MATCH_ID,
              stageNumber: 1,
              matchNumber: 2,
              round: 1,
              status: 'live',
              venueName: 'Cancha 2',
            },
          ],
        }),
      );
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

test.beforeEach(() => {
  useClockFixtures = false;
  courtRotation = false;
});

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

function scoreEvent() {
  return {
    eventId: 'multicourt-event-1',
    organizationId: 'org-liga-mendocina',
    stream: `match:${MATCH_ID}`,
    entityId: MATCH_ID,
    eventType: 'match.event-recorded',
    projectionVersion: 5,
    createdAt: new Date().toISOString(),
    payload: {
      matchId: MATCH_ID,
      definitionCode: 'goal',
      scores: { 'en-1': 9 },
      occurredAt: new Date().toISOString(),
    },
  };
}

function sseFrame(event: ReturnType<typeof scoreEvent>): string {
  return `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function mockStreamDeliveringOneScoreEvent(page: Page): Promise<void> {
  await page.addInitScript(
    ({ frame }) => {
      window.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.includes('/events/tv/')) return new Response('', { status: 404 });
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            setTimeout(() => controller.enqueue(encoder.encode(frame)), 150);
          },
        });
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      };
    },
    { frame: sseFrame(scoreEvent()) },
  );
}

test('renders the multi-court grid, with the live match on its own court card (9.1)', async ({
  page,
}) => {
  useClockFixtures = true;
  await mockOpenStream(page);
  await gotoTv(page, `${TV_PATH}?layout=multicourt&token=kiosk-token`);

  await expect(page.getByTestId('tv-multicourt-grid')).toBeVisible();
  const card = page.getByTestId(`tv-court-card-${MATCH_ID}`);
  await expect(card).toBeVisible();
  // The card shows the team's abbreviation, with the full name as its title —
  // matches on the title rather than the visible text either way.
  await expect(card.locator('[title="Talleres de Mendoza"]')).toBeVisible();

  // Unattended venue screen: nothing a pointer or keyboard could reach.
  // The grid itself offers nothing to reach; the shared score ticker's pause control sits outside it.
  await expect(page.locator('.tv-multicourt').getByRole('button')).toHaveCount(0);
});

test('a live SSE event updates its own court card without navigating away (9.2)', async ({
  page,
}) => {
  useClockFixtures = true;
  await recordFlashes(page, COURT_CARD_VALUE);
  await mockStreamDeliveringOneScoreEvent(page);
  await gotoTv(page, `${TV_PATH}?layout=multicourt&token=kiosk-token`);

  const card = page.getByTestId(`tv-court-card-${MATCH_ID}`);
  await expect(card).toBeVisible();
  const score = card.locator('.tv-court-card__value').filter({ hasText: '9' });
  await expect
    .poll(() => recordedFlashes(page), { timeout: 10_000 })
    .toContainEqual(expect.objectContaining({ text: '9' }));
  await expect(score).not.toHaveClass(/cl-flash-on-change/, { timeout: 2_000 });

  // Still the same kiosk route — a live event never triggers a navigation.
  expect(page.url()).toContain('layout=multicourt');
});

test('holds a static flash under reduced motion', async ({ page }) => {
  useClockFixtures = true;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordFlashes(page, COURT_CARD_VALUE);
  await mockStreamDeliveringOneScoreEvent(page);
  await gotoTv(page, `${TV_PATH}?layout=multicourt&token=kiosk-token`);

  await expect
    .poll(() => recordedFlashes(page), { timeout: 10_000 })
    .toContainEqual(expect.objectContaining({ text: '9' }));
  const flashes = await recordedFlashes(page);
  const style = flashes.find((flash) => flash.text === '9');
  expect(style?.animationDuration).toBe('0s');
  expect(style?.transitionDuration).toBe('0s');
  expect(style?.backgroundColor).toBe(style?.expectedFlashColor);
});

test('the default single-spotlight kiosk view is unaffected when no layout param is present (9.3)', async ({
  page,
}) => {
  useClockFixtures = true;
  await mockOpenStream(page);
  await gotoTv(page, `${TV_PATH}?token=kiosk-token`);

  await expect(page.getByTestId('tv-multicourt-grid')).toHaveCount(0);
});

test('each live court tile shows its advancing game clock when timed and never prints wall clock when untimed', async ({
  page,
}) => {
  useClockFixtures = true;
  await mockOpenStream(page);
  await gotoTv(page, `${TV_PATH}?layout=multicourt&lang=en&token=kiosk-token`);

  const timedCard = page.getByTestId(`tv-court-card-${MATCH_ID}`);
  const timedClock = timedCard.locator('.tv-court-card__clock[role="timer"]');
  await expect(timedClock).toBeVisible();
  await expect(timedClock.locator('.cl-live-clock__segment')).toHaveText('1st Half');

  const readSeconds = async (): Promise<number> => {
    const text = (await timedClock.locator('.cl-live-clock__digits').innerText()).trim();
    const [mm = '0', ss = '0'] = text.split(':');
    return Number(mm) * 60 + Number(ss);
  };
  expect(await readSeconds()).toBeGreaterThanOrEqual(585);
  await expect.poll(readSeconds, { timeout: 6_000 }).toBeGreaterThan(586);

  const untimedCard = page.getByTestId(`tv-court-card-${UNTIMED_MATCH_ID}`);
  await expect(untimedCard).toBeVisible();
  await expect(untimedCard.getByRole('timer')).toHaveCount(0);
  await expect(untimedCard.locator('.cl-live-clock__segment')).toHaveText('1st Set');
  await expect(untimedCard).not.toContainText(/\d{2}:\d{2}/);
});

test('one tile per court, a scheduled tile shows its start time, and the live court stays on every page (9.4)', async ({
  page,
}) => {
  useClockFixtures = true;
  courtRotation = true;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockOpenStream(page);
  // Four free slots beside the live court and four scheduled courts: two pages.
  await gotoTv(page, `${TV_PATH}?layout=multicourt&grid=4&lang=en&token=kiosk-token`);

  await expect(page.locator('.tv-multicourt__header')).toBeVisible();
  const liveTile = page.getByTestId(`tv-court-card-${ROTATION_LIVE_ID}`);
  await expect(liveTile).toBeVisible();
  await expect(page.locator('.tv-court-card')).toHaveCount(4);
  await expect(page.locator('.tv-multicourt__pager')).toContainText('1 of 2');

  const scheduled = page.locator('.tv-court-card').filter({ hasText: 'Club Scheduled 1' });
  await expect(scheduled.locator('.tv-start-time')).toBeVisible();
  await expect(scheduled.locator('.tv-court-card__value')).toHaveCount(0);
  await expect(page.getByText('0 : 0')).toHaveCount(0);

  await page.waitForTimeout(20_500);
  await expect(page.locator('.tv-multicourt__pager')).toContainText('2 of 2');
  await expect(liveTile).toBeVisible();
  await expect(
    page.locator('.tv-court-card').filter({ hasText: 'Club Scheduled 4' }),
  ).toBeVisible();
});
