import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * The console's durable write queue. The primary flow uses Playwright's real
 * offline context; the reload-survival cases also gate mocked API calls so
 * the page itself can still reload in this environment.
 */

const matchId = '00000000-0000-7000-8000-000000000003';
const matchPath = `/organizations/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;

function projection() {
  return {
    matchId,
    status: 'in-progress',
    result: null,
    liveScores: [
      { entrantId: 'entrant-a', score: 0, statistics: {} },
      { entrantId: 'entrant-b', score: 0, statistics: {} },
    ],
    segments: [
      {
        segmentId: 'segment-1',
        type: 'half',
        number: 1,
        state: 'active',
        elapsedSeconds: 0,
        durationSeconds: 2700,
      },
    ],
    runningTimers: [],
    events: [],
    eventDefinitions: [
      {
        code: 'goal',
        label: 'Gol',
        category: 'positive',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'none',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
      {
        code: 'refuse-me',
        label: 'Refuse me',
        category: 'neutral',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'none',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
    ],
    eligiblePersonIds: [],
    rosters: [
      { entrantId: 'entrant-a', members: [] },
      { entrantId: 'entrant-b', members: [] },
    ],
    rosterRoles: [],
    eligibleStaffIds: [],
    entrants: [
      { entrantId: 'entrant-a', name: 'Club Atlético Norte', abbreviation: 'CAN' },
      { entrantId: 'entrant-b', name: 'Deportivo Cuyo', abbreviation: 'DCU' },
    ],
    capabilities: ['match.record-event', 'match.control-clock', 'match.finalize'],
    projectionVersion: 1,
  };
}

async function mockMatchConsole(page: Page): Promise<void> {
  await page.addInitScript(
    ({ initial, path, tokenEndpoint, matchId }) => {
      let state =
        JSON.parse(window.sessionStorage.getItem('match-console-state') ?? 'null') ?? initial;
      const persist = () =>
        window.sessionStorage.setItem('match-console-state', JSON.stringify(state));
      window.__offline = window.sessionStorage.getItem('match-console-offline') === '1';
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
      let latestProjectionFrame: Uint8Array | undefined;
      const emitProjectionFrame = () => {
        if (!streamController || !latestProjectionFrame) return;
        try {
          streamController.enqueue(latestProjectionFrame);
        } catch {
          streamController = undefined;
        }
      };
      window.__emitProjectionAck = emitProjectionFrame;

      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        // The page's own assets/navigation still work while "offline" —
        // only the mocked API surface below is gated by the flag.
        if (!url.startsWith(path) && !url.startsWith('/events/')) {
          return realFetch(input, init);
        }
        if (window.__offline || !navigator.onLine) throw new TypeError('Failed to fetch');
        if (url === `${path}/console`) return Response.json(state);
        if (url.startsWith('/events/control/liga-mendocina')) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
                emitProjectionFrame();
              },
              cancel() {
                streamController = undefined;
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }

        if (url === `${path}/events` && method === 'POST') {
          // The one event definition this refuses on replay, however many
          // are already queued ahead of it — the server-side "same
          // validation a live action goes through" is proven directly in
          // match-console.integration.test.ts's own idempotency coverage
          // This mock only needs to stand in for a refusal.
          // being possible at all, so the drain-continues-past-it behavior
          // is provable from the UI.
          if (body.definitionCode === 'refuse-me') {
            return new Response(
              JSON.stringify({ message: 'This event was refused for the e2e scenario' }),
              { status: 400 },
            );
          }
          state = {
            ...state,
            liveScores: state.liveScores.map((side) =>
              side.entrantId === body.side ? { ...side, score: side.score + 1 } : side,
            ),
            events: [
              ...state.events,
              {
                eventId: `event-${state.events.length + 1}`,
                definitionCode: body.definitionCode,
                segmentId: body.segmentId,
                sequence: state.events.length + 1,
                occurredAt: new Date(body.occurredAt).toISOString(),
                ...(body.side ? { side: body.side } : {}),
              },
            ],
            projectionVersion: state.projectionVersion + 1,
          };
          persist();
          latestProjectionFrame = new TextEncoder().encode(
            `data: ${JSON.stringify({
              eventId: `outbox-${state.projectionVersion}`,
              organizationId: 'organization-1',
              stream: 'control',
              entityId: matchId,
              eventType: 'match.console-projection',
              projectionVersion: state.projectionVersion,
              createdAt: new Date().toISOString(),
              payload: { matchId },
            })}\n\n`,
          );
          return Response.json({
            eventId: `event-${state.events.length}`,
            definitionCode: body.definitionCode,
            sequence: state.events.length,
            notifications: [],
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    { initial: projection(), path: matchPath, tokenEndpoint: TOKEN_ENDPOINT, matchId },
  );
}

async function setOffline(page: Page, offline: boolean): Promise<void> {
  await page.evaluate((value) => {
    window.__offline = value;
    window.sessionStorage.setItem('match-console-offline', value ? '1' : '0');
  }, offline);
}

/**
 * This control shell defaults to Spanish; select English by value (not by
 * its translated label) so every English assertion below holds regardless
 * of that default — the same fix the crop-modal e2e specs needed.
 */
async function selectEnglish(page: Page): Promise<void> {
  await page.getByRole('combobox').first().selectOption('en');
}

/**
 * Queue and sync details remain visible in the console header.
 */
async function openSyncDetail(page: Page): Promise<void> {
  await expect(page.locator('.cl-connection-status')).toBeVisible();
}

test('queues a recorded event while offline, then drains it once back online', async ({ page }) => {
  await mockMatchConsole(page);
  await seedLoginTransaction(
    page,
    `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`,
  );
  await page.goto(loginCallbackUrl());
  await selectEnglish(page);
  await page.getByRole('button', { name: 'Apply clock' }).waitFor();

  await page.context().setOffline(true);
  await setOffline(page, true);
  await page.getByRole('button', { name: 'Gol', exact: true }).click();

  await openSyncDetail(page);
  await expect(page.locator('.cl-connection-status')).toContainText('Offline');
  await expect(page.locator('.cl-connection-status')).toContainText('1 queued action');
  await expect(page.locator('.cl-event-sync-mark')).toHaveText('Queued');

  await setOffline(page, false);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await openSyncDetail(page);
  await expect(page.locator('.cl-connection-status')).not.toContainText('queued', {
    timeout: 12_000,
  });
  await expect(page.locator('.cl-event-sync-mark')).toHaveText('Sent');
  await page.evaluate(() => window.__emitProjectionAck?.());
  await expect(page.locator('.cl-event-sync-mark')).toHaveText('Confirmed');
  await expect(page.locator('.cl-connection-status')).toContainText('Last synced');
});

test('a queued action survives a refresh while offline, and drains once back online', async ({
  page,
}) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await selectEnglish(page);
  await page.getByRole('button', { name: 'Apply clock' }).waitFor();

  await setOffline(page, true);
  await page.getByRole('button', { name: 'Gol', exact: true }).click();
  await openSyncDetail(page);
  await expect(page.getByText('1 queued action')).toBeVisible();

  // Reload while still offline. Fetching the console's own authoritative
  // state also fails offline (an orthogonal, pre-existing read-side gap —
  // not what this proposal covers), so the console UI itself doesn't
  // render this round; what the "survives a hard refresh"
  // guarantee actually promises is durability, checked directly against
  // IndexedDB here rather than through UI text that can't paint yet.
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await selectEnglish(page);
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.locator('.cl-skeleton[aria-busy="true"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const request = indexedDB.open('copalibre-console-offline-queue');
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction('mutations', 'readonly');
              const countRequest = tx.objectStore('mutations').count();
              countRequest.onsuccess = () => resolve(countRequest.result);
            };
          }),
      ),
    )
    .toBe(1);

  // Now back online: reopening the console (another simulated refresh)
  // both loads the authoritative state and resumes draining the queue.
  await setOffline(page, false);
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await selectEnglish(page);
  await expect(page.getByRole('button', { name: 'Apply clock' })).toBeVisible();
  await openSyncDetail(page);
  await expect(page.getByText('goal', { exact: false })).toBeVisible();
});

test('a refused item does not block the rest of the queue from draining', async ({ page }) => {
  await mockMatchConsole(page);
  await seedLoginTransaction(
    page,
    `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`,
  );
  await page.goto(loginCallbackUrl());
  await selectEnglish(page);
  await page.getByRole('button', { name: 'Apply clock' }).waitFor();

  // Two queued items, in order: the first ("Gol") the mock always accepts;
  // the second ("Refuse me") the mock always refuses (400) — see the mock's
  // own `refuse-me` branch above.
  await setOffline(page, true);
  await page.getByRole('button', { name: 'Gol', exact: true }).click();
  await page.getByRole('button', { name: 'Refuse me', exact: true }).click();
  await openSyncDetail(page);
  await expect(page.locator('.cl-connection-status')).toContainText('2 queued actions');

  await setOffline(page, false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  // The first item drains through to zero-queued (sent, then removed); the
  // second stays queued — refused, not silently dropped — and is
  // distinguishable in its own list, with the server's own reason attached.
  // The refused item's reason surfaces in two places at once (the shared
  // status banner and its own list entry) — asserting the list entry's own
  // combined text is enough to prove it renders, without a strict-mode
  // ambiguity between the two.
  // The queued-actions count only counts items still waiting to sync — a
  // refused item isn't, it needs the operator's own attention — so it reads
  // zero once the first item (goal) has sent and the second has been
  // refused, not "stuck at 2." The refused item's own entry, separately
  // listed below with the server's reason, is what proves the drain
  // actually reached — and did not silently drop — the second item.
  await openSyncDetail(page);
  await expect(page.locator('.cl-connection-status')).toContainText('1 refused action', {
    timeout: 12_000,
  });
  await page.evaluate(() => window.__emitProjectionAck?.());
  await expect(page.locator('.cl-event-sync-mark[data-state="confirmed"]')).toHaveText('Confirmed');
  await expect(page.locator('.cl-event-sync-mark[data-state="refused"]')).toContainText(
    'This event was refused for the e2e scenario',
  );
  await expect(
    page.getByText('Refused (record-event): This event was refused for the e2e scenario'),
  ).toBeVisible();
});

test('the control shell has no unlabeled icon-only buttons', async ({ page }) => {
  await mockMatchConsole(page);
  await seedLoginTransaction(
    page,
    `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`,
  );
  await page.goto(loginCallbackUrl());
  await selectEnglish(page);
  await page.getByRole('button', { name: 'Apply clock' }).waitFor();

  const { violations } = await new AxeBuilder({ page }).withRules(['button-name']).analyze();
  expect(violations).toEqual([]);
  const statusAudit = await new AxeBuilder({ page }).include('.cl-connection-status').analyze();
  expect(statusAudit.violations).toEqual([]);
});

declare global {
  interface Window {
    __offline?: boolean;
    __emitProjectionAck?: () => void;
  }
}
