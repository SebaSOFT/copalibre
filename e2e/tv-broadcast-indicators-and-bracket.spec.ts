import { createServer, type Server } from 'node:http';
import { expect, gotoTv, test } from './support/tv-ready.js';
import type { Page } from '@playwright/test';

/**
 * The TV scorebug's possession/timed-penalty indicators and the
 * full-frame bracket rail, rendered from the real public projections (never
 * sample data) — present on the kiosk and full-overlay presentations, the
 * indicator alone (no bracket) on the lower third, and neither indicator nor
 * bracket tab when the projection has no such fact or the featured stage
 * isn't an elimination bracket.
 */

const ORGANIZATION = 'liga-transmision';
const TOURNAMENT = 'playoffs-emision';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TV_PATH = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

const HOME_ID = 'entrant-home';
const AWAY_ID = 'entrant-away';

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Transmisión',
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Playoffs Emisión',
  seasonName: 'Playoffs Emisión',
  matches: [],
  clubs: [],
  ruleset: {},
};

function liveMatchWithFacts(stageNumber: number) {
  return {
    matches: [
      {
        matchId: 'live-match-1',
        stageNumber,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'in-progress',
        projectionVersion: 1,
        possessionEntrantId: HOME_ID,
        activePenalties: [{ timerId: 'timer-1', entrantId: AWAY_ID, remainingSeconds: 125 }],
        sides: [
          { entrantId: HOME_ID, name: 'Cóndores del Sur', abbreviation: 'CDS', score: 1 },
          { entrantId: AWAY_ID, name: 'Halcones Rojos', abbreviation: 'HRO', score: 0 },
        ],
      },
    ],
  };
}

function liveMatchWithoutFacts(stageNumber: number) {
  return {
    matches: [
      {
        matchId: 'live-match-1',
        stageNumber,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'in-progress',
        projectionVersion: 1,
        sides: [
          { entrantId: HOME_ID, name: 'Cóndores del Sur', abbreviation: 'CDS', score: 1 },
          { entrantId: AWAY_ID, name: 'Halcones Rojos', abbreviation: 'HRO', score: 0 },
        ],
      },
    ],
  };
}

const eliminationBracket = {
  format: 'single-elimination',
  zones: [
    {
      zoneId: 'zone-a',
      zoneName: 'Zona A',
      matches: [
        {
          matchId: 'bracket-final',
          matchNumber: 1,
          bracket: 'winners',
          round: 1,
          position: 1,
          status: 'finalized',
          slots: [
            { kind: 'entrant', entrantId: HOME_ID, name: 'Cóndores del Sur', score: 3 },
            { kind: 'entrant', entrantId: AWAY_ID, name: 'Halcones Rojos', score: 1 },
          ],
        },
        {
          matchId: 'bracket-next',
          matchNumber: 2,
          bracket: 'winners',
          round: 2,
          position: 1,
          status: 'scheduled',
          slots: [{ kind: 'winner-of', matchId: 'bracket-final' }],
        },
      ],
    },
  ],
};

const roundRobinBracket = { format: 'round-robin', zones: [{ matches: [] }] };

let live: unknown = liveMatchWithFacts(1);
let bracket: unknown = eliminationBracket;
let server: Server;

test.beforeAll(async ({ workerPort }) => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
    } else if (path === `${BASE}/live`) {
      res.end(JSON.stringify(live));
    } else if (path === `${BASE}/stages/1/bracket`) {
      res.end(JSON.stringify(bracket));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'not found' }));
    }
  });
  await new Promise<void>((resolve) => server.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  live = liveMatchWithFacts(1);
  bracket = eliminationBracket;
});

test('kiosk shows possession and timed-penalty indicators, and the published bracket', async ({
  page,
}) => {
  await gotoTv(page, TV_PATH);

  const indicators = page.locator('.tv-match-indicators').first();
  await expect(indicators.getByText('Possession')).toBeVisible();
  await expect(indicators.getByText('CDS')).toBeVisible();
  await expect(indicators.getByText('Penalty')).toBeVisible();
  await expect(indicators.getByText('HRO')).toBeVisible();
  await expect(indicators).not.toContainText('%');

  await page.getByRole('button', { name: 'Bracket' }).click();
  const card = page.locator('.tv-bracket-card').first();
  await expect(card).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Zona A', exact: true })).toBeVisible();
  await expect(page.getByTitle('Winner of Round 1, match 1', { exact: true })).toBeVisible();
  const cardClasses = await card.getAttribute('class');
  expect(cardClasses).toContain('cl-chamfer');
  expect(cardClasses).toContain('cl-chamfer--control');
});

test('full overlay carries the same indicators and bracket as the kiosk', async ({ page }) => {
  // An overlay shows the match it is given, so it is pinned to the live one.
  await gotoTv(page, `${TV_PATH}/stages/1/matches/1?mode=overlay-full`);

  const indicators = page.locator('.tv-match-indicators').first();
  await expect(indicators.getByText('Possession')).toBeVisible();
  await expect(indicators.getByText('Penalty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bracket' })).toBeVisible();
});

test('lower third keeps the indicator but never shows a bracket section', async ({ page }) => {
  await gotoTv(page, `${TV_PATH}/stages/1/matches/1?mode=overlay-lower`);

  const indicators = page.locator('.tv-match-indicators').first();
  await expect(indicators.getByText('Possession')).toBeVisible();
  await expect(indicators.getByText('Penalty')).toBeVisible();
  await expect(page.locator('.tv-bracket')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bracket' })).toHaveCount(0);
});

test('omits both indicators when the live projection supplies neither fact', async ({ page }) => {
  live = liveMatchWithoutFacts(1);
  await gotoTv(page, TV_PATH);

  await expect(page.getByText('CDS').first()).toBeVisible();
  await expect(page.locator('.tv-match-indicators')).toHaveCount(0);
});

test('shows no bracket tab or section for a non-elimination (grid) stage', async ({ page }) => {
  bracket = roundRobinBracket;
  await gotoTv(page, TV_PATH);

  // The scorebug's own indicators are unaffected by the bracket's absence.
  const indicators = page.locator('.tv-match-indicators').first();
  await expect(indicators.getByText('Possession')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Bracket' })).toHaveCount(0);
  await expect(page.locator('.tv-bracket')).toHaveCount(0);
  // The rail's other sections still render — a missing bracket costs only its own tab.
  await expect(page.getByRole('button', { name: 'Standings' })).toBeVisible();
});

/**
 * Declared match counters: the discipline's own tallies per side, on the kiosk
 * scorebug and the lower third. Each counter is served by the live projection,
 * and a counter at its warning value carries the tone and a text cue.
 */
function liveMatchWithCounters(stageNumber: number, teamFouls: number) {
  return {
    matches: [
      {
        matchId: 'live-match-1',
        stageNumber,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'live',
        projectionVersion: 1,
        sides: [
          { entrantId: HOME_ID, name: 'Cóndores del Sur', abbreviation: 'CDS', score: 1 },
          { entrantId: AWAY_ID, name: 'Halcones Rojos', abbreviation: 'HRO', score: 0 },
        ],
        counters: [
          {
            code: 'team-fouls',
            label: { en: 'Team fouls', es: 'Faltas de equipo' },
            shortLabel: 'F',
            scope: 'match',
            events: ['team-foul'],
            warnAt: 3,
            values: [
              { entrantId: HOME_ID, value: teamFouls },
              { entrantId: AWAY_ID, value: 1 },
            ],
          },
          {
            code: 'timeouts',
            label: 'Timeouts',
            shortLabel: 'TM',
            scope: 'segment',
            events: ['timeout'],
            allowance: 1,
            values: [
              { entrantId: HOME_ID, value: 1 },
              { entrantId: AWAY_ID, value: 0 },
            ],
          },
        ],
      },
    ],
  };
}

test('kiosk shows each counter per side, and a counter at its warning value carries a cue', async ({
  page,
}) => {
  live = liveMatchWithCounters(1, 4);
  await gotoTv(page, TV_PATH);

  const counters = page.locator('.tv-match-counters').first();
  await expect(counters).toContainText('F 4');
  await expect(counters).toContainText('F 1');
  await expect(counters).toContainText('TM 1/1');
  // Four fouls against a warning value of three: the home counter is in warning.
  const warning = page.locator('.tv-match-counter--warning').first();
  await expect(warning).toContainText('!');
  await expect(warning).toContainText('Team fouls: 4, warning');
});

test("lower third shows each side's counters under its name", async ({ page }) => {
  live = liveMatchWithCounters(1, 1);
  await gotoTv(page, `${TV_PATH}/stages/1/matches/1?mode=overlay-lower`);

  const lowerThird = page.locator('.tv-lower-third').first();
  const [home, away] = [
    lowerThird.locator('.tv-match-counters').first(),
    lowerThird.locator('.tv-match-counters').last(),
  ];
  await expect(home).toContainText('F 1');
  await expect(away).toContainText('F 1');
  // One timeout against an allowance of one is at its warning value; the fouls are not.
  await expect(page.locator('.tv-match-counter--warning')).toHaveCount(1);
  await expect(page.locator('.tv-match-counter--warning')).toContainText('TM 1/1!');
});

test('a counter takes a newly recorded event on the next projection, without a reload', async ({
  page,
}) => {
  test.setTimeout(45_000);
  live = liveMatchWithCounters(1, 1);
  await gotoTv(page, TV_PATH);
  await expect(page.locator('.tv-match-counters').first()).toContainText('F 1');

  // A foul recorded on the console reaches the projection; the overlay reconciles on its poll.
  live = liveMatchWithCounters(1, 2);
  await expect(page.locator('.tv-match-counters').first()).toContainText('F 2', {
    timeout: 30_000,
  });
});

/**
 * A stream the test drives: the TV's event stream stays open, and each frame the test pushes reaches the
 * page at once. The live projection is changed first, so the refresh a counted event triggers returns the
 * new tally.
 */
async function mockControllableTvStream(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const encoder = new TextEncoder();
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('/events/tv/')) return original(input, init);
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

async function pushTvEvent(
  page: Page,
  eventType: string,
  payload: object,
  projectionVersion: number,
) {
  const frame = `event: ${eventType}\ndata: ${JSON.stringify({
    eventId: `tv-counter-${projectionVersion}`,
    organizationId: 'org-liga-transmision',
    stream: `match:live-match-1`,
    entityId: 'live-match-1',
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

test('a counted recording updates the scorebug counter well before the poll', async ({ page }) => {
  test.setTimeout(30_000);
  await mockControllableTvStream(page);
  live = liveMatchWithCounters(1, 1);
  await gotoTv(page, `${TV_PATH}?token=kiosk-token`);
  const counters = page.locator('.tv-match-counters').first();
  await expect(counters).toContainText('F 1');

  // The foul is on the projection, then reaches the page on the stream: no reload and no 15 s poll.
  live = liveMatchWithCounters(1, 2);
  await pushTvEvent(
    page,
    'match.event-recorded',
    {
      matchId: 'live-match-1',
      definitionCode: 'team-foul',
      side: HOME_ID,
      occurredAt: new Date().toISOString(),
    },
    2,
  );
  await expect(counters).toContainText('F 2', { timeout: 3000 });
});

test('a burst of counted events makes at most about two projection refreshes a second, and the final tally arrives', async ({
  page,
}) => {
  test.setTimeout(30_000);
  await mockControllableTvStream(page);
  live = liveMatchWithCounters(1, 1);
  const liveRequests: number[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/live')) liveRequests.push(Date.now());
  });
  await gotoTv(page, `${TV_PATH}?token=kiosk-token`);
  const counters = page.locator('.tv-match-counters').first();
  await expect(counters).toContainText('F 1');

  const before = liveRequests.length;
  live = liveMatchWithCounters(1, 10);
  for (let version = 2; version <= 11; version += 1) {
    await pushTvEvent(
      page,
      'match.event-recorded',
      {
        matchId: 'live-match-1',
        definitionCode: 'team-foul',
        side: HOME_ID,
        occurredAt: new Date().toISOString(),
      },
      version,
    );
  }
  await expect(counters).toContainText('F 10', { timeout: 3000 });
  await page.waitForTimeout(1200);
  expect(liveRequests.length - before).toBeLessThanOrEqual(3);
});
