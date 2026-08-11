import { expect, test, type Page } from '@playwright/test';

/**
 * The `/tv/**` kiosk and overlay surface (0031, tasks 8.1-8.3).
 *
 * Every scenario here is about the property that makes this surface
 * different from the public web: nobody is present to click anything, so a
 * dropped connection, a power cycle, or a compositing pass through OBS must
 * all resolve on their own.
 */

const MATCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TV_PATH = '/tv/liga-mendocina/tournaments/apertura-2026';

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
  await page.goto(`${TV_PATH}?token=kiosk-token`);

  // The reconnected stream's event lands once the client retries.
  await expect(page.getByText('FINAL', { exact: true })).toBeVisible({ timeout: 10_000 });
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
  await page.goto(`${TV_PATH}?mode=overlay&token=kiosk-token`);

  await expect(page.locator('body')).toHaveClass(/tv-overlay/);

  const background = await page
    .locator('#tv-root')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  // eslint-disable-next-line no-restricted-syntax -- asserting a computed browser style value, not an app styling literal
  expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(background);

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
  await page.goto(`${TV_PATH}?token=kiosk-token`);
  await expect(page.getByText('TLL A')).toBeVisible();

  // A power cycle clears everything volatile; the display token survives
  // only because it lives in the device's launch URL, never in storage.
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.reload();

  await expect(page.getByText('TLL A')).toBeVisible();
  await expect(page.getByText(/iniciar sesión|log in|contraseña|password/i)).toHaveCount(0);
});
