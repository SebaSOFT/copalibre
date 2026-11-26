import { createServer, type Server } from 'node:http';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

/**
 * The public match page shows the discipline's match counters per side and,
 * while the match is live, the timed penalties in force with the time left,
 * counting down without a reload. A finished match keeps the match-scope totals.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const MATCH_PATH = `${BASE}/stages/1/matches/5`;
const HOME_ID = '00000000-0000-7000-8000-0000000000a1';
const AWAY_ID = '00000000-0000-7000-8000-0000000000a2';

const TEAM_FOULS = {
  code: 'team-fouls',
  label: { en: 'Team fouls', es: 'Faltas de equipo' },
  shortLabel: 'F',
  scope: 'match',
  events: ['team-foul'],
  warnAt: 3,
  values: [
    { entrantId: HOME_ID, value: 3 },
    { entrantId: AWAY_ID, value: 1 },
  ],
};

const TIMEOUTS = {
  code: 'timeouts',
  label: { en: 'Timeouts', es: 'Tiempos muertos' },
  shortLabel: 'TM',
  scope: 'segment',
  events: ['timeout'],
  allowance: 1,
  values: [
    { entrantId: HOME_ID, value: 1 },
    { entrantId: AWAY_ID, value: 0 },
  ],
};

const SUSPENSION = { timerId: 'timer-1', entrantId: AWAY_ID, remainingSeconds: 120 };

function report(
  status: 'upcoming' | 'live' | 'final',
  counters: unknown[],
  activePenalties: unknown[],
) {
  return {
    organizationAlias: ORGANIZATION,
    organizationName: 'Liga Mendocina',
    organizationTimeZone: 'America/Argentina/Buenos_Aires',
    tournamentAlias: TOURNAMENT_ALIAS,
    tournamentName: 'Apertura 2026',
    stageNumber: 1,
    stageFormat: 'round-robin',
    matchNumber: 5,
    round: 3,
    status,
    matchId: 'match-5',
    tracksLiveIndicators: true,
    homeEntrantId: HOME_ID,
    awayEntrantId: AWAY_ID,
    homeName: 'Club Andes',
    homeAbbreviation: 'AND',
    homeScore: 2,
    awayName: 'Deportivo Sur',
    awayAbbreviation: 'SUR',
    awayScore: 1,
    schedulePublished: true,
    officials: [],
    rosters: { home: [], away: [] },
    timeline: [],
    disciplineImages: {},
    counters,
    ...(activePenalties.length === 0 ? {} : { activePenalties }),
  };
}

const LIVE_MATCH = {
  matchId: 'match-5',
  stageNumber: 1,
  matchNumber: 5,
  state: 'live',
  projectionVersion: 1,
  sides: [
    { entrantId: HOME_ID, name: 'Club Andes', score: 2 },
    { entrantId: AWAY_ID, name: 'Deportivo Sur', score: 1 },
  ],
  counters: [TEAM_FOULS, TIMEOUTS],
  activePenalties: [SUSPENSION],
};

let reportBody: unknown = report('live', [TEAM_FOULS, TIMEOUTS], [SUSPENSION]);
let liveBody: unknown = { matches: [LIVE_MATCH] };
let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === MATCH_PATH) {
      res.end(JSON.stringify(reportBody));
    } else if (path === `${BASE}/live`) {
      res.end(JSON.stringify(liveBody));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.beforeEach(() => {
  reportBody = report('live', [TEAM_FOULS, TIMEOUTS], [SUSPENSION]);
  liveBody = { matches: [LIVE_MATCH] };
});

const MATCH_URL = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/stages/1/matches/5`;

test('a live match shows each counter per side and the penalty counting down', async ({ page }) => {
  await page.goto(MATCH_URL);

  const counters = page.locator('.cl-match-counters');
  await expect(counters).toContainText('Team fouls');
  await expect(counters).toContainText('Club Andes, Team fouls: 3, warning');
  await expect(counters).toContainText('Deportivo Sur, Team fouls: 1');
  await expect(counters).toContainText('Club Andes, Timeouts: 1 of 1, warning');
  await expect(counters).toContainText('Deportivo Sur, Timeouts: 0 of 1');

  const penalty = page.locator('.cl-match-penalty time');
  await expect(penalty).toContainText('Deportivo Sur:');
  await expect(penalty).toContainText('suspension');
  // The remaining time falls without a reload.
  await expect(penalty).toHaveText(/Deportivo Sur: 01:5\d suspension/, { timeout: 5000 });
});

test('a counter at its warning value is marked with a text cue, not colour alone', async ({
  page,
}) => {
  await page.goto(MATCH_URL);

  // Three team fouls against a warning value of three.
  const warning = page.locator('.cl-match-counter--warning').first();
  await expect(warning).toContainText('Club Andes, Team fouls: 3, warning');
  await expect(warning.locator('.cl-visually-hidden')).toHaveText(
    'Club Andes, Team fouls: 3, warning',
  );
});

test('a finished match keeps the match-scope totals and no penalty', async ({ page }) => {
  reportBody = report('final', [TEAM_FOULS], []);
  await page.goto(MATCH_URL);

  await expect(page.locator('.cl-match-counters')).toContainText('Team fouls');
  await expect(page.locator('.cl-match-counters')).toContainText(
    'Club Andes, Team fouls: 3, warning',
  );
  await expect(page.locator('.cl-match-counters')).not.toContainText('Timeouts');
  await expect(page.locator('.cl-match-penalty')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the counters wrap within the screen without horizontal scroll', async ({ page }) => {
    await page.goto(MATCH_URL);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.cl-match-counters')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/**
 * The public stream the match page opens, driven by the test: each frame pushed reaches the page at once,
 * after the test has changed the projection the refresh it triggers will read.
 */
async function mockControllablePublicStream(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const encoder = new TextEncoder();
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('/events/public/')) return original(input, init);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          (window as unknown as { __pushSse: (text: string) => void }).__pushSse = (text: string) =>
            controller.enqueue(encoder.encode(text));
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };
  });
}

async function pushPublicEvent(
  page: Page,
  eventType: string,
  payload: object,
  projectionVersion: number,
): Promise<void> {
  const frame = `event: ${eventType}\ndata: ${JSON.stringify({
    eventId: `public-${projectionVersion}`,
    organizationId: 'org-liga-mendocina',
    stream: 'match:match-5',
    entityId: 'match-5',
    eventType,
    projectionVersion,
    createdAt: new Date().toISOString(),
    payload,
  })}\n\n`;
  await page.evaluate(
    (text) => (window as unknown as { __pushSse: (text: string) => void }).__pushSse(text),
    frame,
  );
}

test.describe('live updates on the match page', () => {
  test('a counted recording updates the counter without a reload', async ({ page }) => {
    test.setTimeout(30_000);
    await mockControllablePublicStream(page);
    await page.goto(MATCH_URL);
    await expect(page.locator('.cl-match-counters')).toContainText(
      'Club Andes, Team fouls: 3, warning',
    );

    liveBody = {
      matches: [
        {
          ...LIVE_MATCH,
          counters: [
            {
              ...TEAM_FOULS,
              values: [
                { entrantId: HOME_ID, value: 4 },
                { entrantId: AWAY_ID, value: 1 },
              ],
            },
            TIMEOUTS,
          ],
          activePenalties: [SUSPENSION],
        },
      ],
    };
    await pushPublicEvent(
      page,
      'match.event-recorded',
      { matchId: 'match-5', definitionCode: 'team-foul', side: HOME_ID },
      2,
    );
    await expect(page.locator('.cl-match-counters')).toContainText(
      'Club Andes, Team fouls: 4, warning',
      {
        timeout: 3000,
      },
    );
  });

  test('a timed-penalty recording makes the penalty appear, counting down', async ({ page }) => {
    test.setTimeout(30_000);
    await mockControllablePublicStream(page);
    await page.goto(MATCH_URL);
    await expect(page.locator('.cl-match-penalty')).toHaveCount(1);

    liveBody = {
      matches: [
        {
          ...LIVE_MATCH,
          activePenalties: [
            SUSPENSION,
            { timerId: 'timer-2', entrantId: HOME_ID, remainingSeconds: 180 },
          ],
        },
      ],
    };
    await pushPublicEvent(
      page,
      'match.event-recorded',
      { matchId: 'match-5', definitionCode: 'sin-bin', side: HOME_ID },
      2,
    );
    await expect(
      page.locator('.cl-match-penalty', { hasText: /Club Andes: 0[23]:\d\d suspension/ }),
    ).toHaveCount(1, { timeout: 3000 });
    await expect(page.locator('.cl-match-penalty')).toHaveCount(2);
  });

  test('match.finalized removes the segment counters and the penalties', async ({ page }) => {
    test.setTimeout(30_000);
    await mockControllablePublicStream(page);
    await page.goto(MATCH_URL);
    await expect(page.locator('.cl-match-counters')).toContainText('Timeouts');
    await expect(page.locator('.cl-match-penalty')).toHaveCount(1);

    await pushPublicEvent(page, 'match.finalized', { matchId: 'match-5', result: {} }, 3);
    await expect(page.locator('.cl-match-counters')).not.toContainText('Timeouts', {
      timeout: 3000,
    });
    await expect(page.locator('.cl-match-penalty')).toHaveCount(0);
    // The match-scope total stays as the final tally.
    await expect(page.locator('.cl-match-counters')).toContainText('Team fouls');
  });
});

test('an upcoming page follows its stream: match.started, then a counted event, and the counters appear without a reload', async ({
  page,
}) => {
  test.setTimeout(30_000);
  await mockControllablePublicStream(page);
  reportBody = report('upcoming', [], []);
  liveBody = { matches: [] };
  await page.goto(MATCH_URL);
  await expect(page.locator('.cl-match-counters')).toHaveCount(0);

  // The match starts: the page turns live, and the counters are on the projection from now on.
  liveBody = {
    matches: [
      {
        ...LIVE_MATCH,
        counters: [
          {
            ...TEAM_FOULS,
            values: [
              { entrantId: HOME_ID, value: 0 },
              { entrantId: AWAY_ID, value: 0 },
            ],
          },
          TIMEOUTS,
        ],
        activePenalties: [],
      },
    ],
  };
  await pushPublicEvent(
    page,
    'match.started',
    { matchId: 'match-5', startedAt: new Date().toISOString() },
    2,
  );
  await expect(page.locator('.cl-match-counters')).toContainText('Club Andes, Team fouls: 0', {
    timeout: 3000,
  });

  liveBody = {
    matches: [
      {
        ...LIVE_MATCH,
        counters: [
          {
            ...TEAM_FOULS,
            values: [
              { entrantId: HOME_ID, value: 1 },
              { entrantId: AWAY_ID, value: 0 },
            ],
          },
          TIMEOUTS,
        ],
        activePenalties: [],
      },
    ],
  };
  await pushPublicEvent(
    page,
    'match.event-recorded',
    { matchId: 'match-5', definitionCode: 'team-foul', side: HOME_ID },
    3,
  );
  await expect(page.locator('.cl-match-counters')).toContainText('Club Andes, Team fouls: 1', {
    timeout: 3000,
  });
});
