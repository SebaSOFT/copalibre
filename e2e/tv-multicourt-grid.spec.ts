import { expect, test, type Page } from '@playwright/test';

/**
 * The `?layout=multicourt` grid mode on the `/tv/**` kiosk route — the same unattended-surface constraints as `broadcast-tv.spec.ts`
 * apply: nobody is present to click anything, so this checks the grid
 * actually mounts and reacts to a live SSE event, not just that the flag
 * parses.
 */

const MATCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TV_PATH = '/tv/liga-mendocina/tournaments/apertura-2026';

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
  await mockOpenStream(page);
  await page.goto(`${TV_PATH}?layout=multicourt&token=kiosk-token`);

  await expect(page.getByTestId('tv-multicourt-grid')).toBeVisible();
  const card = page.getByTestId(`tv-court-card-${MATCH_ID}`);
  await expect(card).toBeVisible();
  // The card shows the team's abbreviation, with the full name as its title —
  // matches on the title rather than the visible text either way.
  await expect(card.locator('[title="Talleres de Mendoza"]')).toBeVisible();

  // Unattended venue screen: nothing a pointer or keyboard could reach.
  await expect(page.getByRole('button')).toHaveCount(0);
});

test('a live SSE event updates its own court card without navigating away (9.2)', async ({
  page,
}) => {
  await mockStreamDeliveringOneScoreEvent(page);
  await page.goto(`${TV_PATH}?layout=multicourt&token=kiosk-token`);

  const card = page.getByTestId(`tv-court-card-${MATCH_ID}`);
  await expect(card).toBeVisible();
  const score = card.locator('.tv-court-card__value').filter({ hasText: '9' });
  await expect(score).toHaveClass(/cl-flash-on-change/, { timeout: 10_000 });
  await expect(score).not.toHaveClass(/cl-flash-on-change/, { timeout: 2_000 });

  // Still the same kiosk route — a live event never triggers a navigation.
  expect(page.url()).toContain('layout=multicourt');
});

test('holds a static flash under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockStreamDeliveringOneScoreEvent(page);
  await page.goto(`${TV_PATH}?layout=multicourt&token=kiosk-token`);

  const score = page
    .getByTestId(`tv-court-card-${MATCH_ID}`)
    .locator('.tv-court-card__value')
    .filter({ hasText: '9' });
  await expect(score).toHaveClass(/cl-flash-on-change/, { timeout: 10_000 });
  const style = await score.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      animationDuration: computed.animationDuration,
      backgroundColor: computed.backgroundColor,
      expectedFlashColor: (() => {
        const probe = element.ownerDocument.createElement('span');
        probe.style.color = 'var(--cl-color-cyan-950)';
        element.ownerDocument.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      })(),
      transitionDuration: computed.transitionDuration,
    };
  });
  expect(style.animationDuration).toBe('0s');
  expect(style.transitionDuration).toBe('0s');
  expect(style.backgroundColor).toBe(style.expectedFlashColor);
});

test('the default single-spotlight kiosk view is unaffected when no layout param is present (9.3)', async ({
  page,
}) => {
  await mockOpenStream(page);
  await page.goto(`${TV_PATH}?token=kiosk-token`);

  await expect(page.getByTestId('tv-multicourt-grid')).toHaveCount(0);
});
