import { createServer, type Server } from 'node:http';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

/**
 * The live-patched score ticker on the public tournament overview page —
 * B1's own philosophy is that the SSE stream is an
 * enhancement, never a requirement, so this checks both: the ticker reacts to
 * a live event, and the page is still fully correct with JavaScript off.
 *
 * B1 is server-rendered — its overview fetch runs inside the Astro preview
 * process, not the browser — so a local stub API stands in for it, the same
 * pattern `standings-and-rankings.spec.ts`'s "B2: public tournament page"
 * describe block already established.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const OVERVIEW_PATH = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const MATCH_ID = 'match-live-1';
const HOME_ENTRANT_ID = 'entrant-home';
const AWAY_ENTRANT_ID = 'entrant-away';

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [
    {
      matchId: MATCH_ID,
      stageNumber: 1,
      round: 1,
      matchNumber: 1,
      status: 'live',
      homeEntrantId: HOME_ENTRANT_ID,
      homeName: 'Talleres',
      homeAbbreviation: 'TAL',
      awayEntrantId: AWAY_ENTRANT_ID,
      awayName: 'Independiente',
      awayAbbreviation: 'IND',
      homeScore: 1,
      awayScore: 1,
      scheduledAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  clubs: [],
  ruleset: {},
};

function scoreEvent() {
  return {
    eventId: 'ticker-live-event-1',
    organizationId: 'org-liga-mendocina',
    stream: `match:${MATCH_ID}`,
    entityId: MATCH_ID,
    eventType: 'match.event-recorded',
    projectionVersion: 5,
    createdAt: new Date().toISOString(),
    payload: {
      matchId: MATCH_ID,
      definitionCode: 'goal',
      scores: { [HOME_ENTRANT_ID]: 2, [AWAY_ENTRANT_ID]: 1 },
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
        if (!url.includes('/events/public/')) return new Response('', { status: 404 });
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(frame));
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

test.describe('public score ticker live reactivity', () => {
  let apiServer: Server;

  test.beforeAll(async ({ workerPort }) => {
    apiServer = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === `${TOURNAMENT}/overview`) {
        res.end(JSON.stringify(overview));
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

  test('a live SSE event updates the ticker score without navigating away', async ({ page }) => {
    await mockStreamDeliveringOneScoreEvent(page);
    await page.goto(OVERVIEW_PATH);

    const item = page.locator(`.cl-ticker__item[data-match-id="${MATCH_ID}"]`).first();
    await expect(item).toBeVisible();
    // The mock stream delivers its one frame as soon as the client connects,
    // so the only reliably observable state is the post-patch score.
    await expect(item.locator('.cl-ticker__figure')).toHaveText('2 : 1', { timeout: 10_000 });

    // Still the same overview page — a live event never triggers a navigation.
    expect(page.url()).toContain(OVERVIEW_PATH);
  });

  test('the ticker is fully present and correct with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(OVERVIEW_PATH);

    await expect(page.locator('[data-ticker]')).toBeVisible();
    const item = page.locator(`.cl-ticker__item[data-match-id="${MATCH_ID}"]`).first();
    await expect(item).toBeVisible();
    await expect(item.locator('.cl-ticker__figure')).toHaveText('1 : 1');

    await context.close();
  });
});
