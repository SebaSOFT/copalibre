import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const matchId = '00000000-0000-7000-8000-000000000001';
const matchPath = `/organizations/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: Record<string, unknown>;
  readonly idempotencyKey?: string;
}

function projection(input: { readonly capabilities?: readonly string[] } = {}) {
  return {
    matchId,
    status: 'in-progress',
    result: null,
    liveScores: [
      { entrantId: 'entrant-a', score: 1, statistics: { goals: 1 } },
      { entrantId: 'entrant-b', score: 0, statistics: {} },
    ],
    segments: [
      {
        segmentId: 'segment-1',
        type: 'half',
        number: 1,
        state: 'active',
        elapsedSeconds: 120,
        durationSeconds: 2700,
      },
    ],
    runningTimers: [
      {
        timerId: 'timer-1',
        side: 'entrant-a',
        startedAt: Date.now(),
        durationSeconds: 120,
        remainingSeconds: 120,
      },
    ],
    events: [],
    eventDefinitions: [
      {
        code: 'goal',
        label: 'Gol',
        category: 'positive',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
      },
      {
        code: 'penalty',
        label: 'Penal',
        category: 'neutral',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        workflow: {
          kind: 'outcome-choice',
          options: [
            { definitionCode: 'penalty-goal', label: 'Gol de penal' },
            { definitionCode: 'penalty-missed', label: 'Fallado' },
          ],
        },
      },
      {
        code: 'penalty-goal',
        label: 'Gol de penal',
        category: 'positive',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
      },
      {
        code: 'penalty-missed',
        label: 'Penal fallado',
        category: 'negative',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
      },
    ],
    eligiblePersonIds: [],
    eligibleStaffIds: [],
    entrantIds: ['entrant-a', 'entrant-b'],
    capabilities: input.capabilities ?? [
      'match.record-event',
      'match.control-clock',
      'match.resolve-timer',
      'match.finalize',
    ],
    projectionVersion: 1,
  };
}

async function mockMatchConsole(
  page: Page,
  options: {
    readonly capabilities?: readonly string[];
    readonly loseFirstFinalize?: boolean;
    readonly keepAuthoritativeScore?: boolean;
  } = {},
): Promise<void> {
  await page.addInitScript(
    ({ initial, path, loseFirstFinalize, keepAuthoritativeScore, tokenEndpoint }) => {
      let state =
        JSON.parse(window.sessionStorage.getItem('match-console-state') ?? 'null') ?? initial;
      const persist = () =>
        window.sessionStorage.setItem('match-console-state', JSON.stringify(state));
      let finalizeAttempts = 0;
      const captured: CapturedRequest[] = [];
      Object.assign(window, { __matchConsoleRequests: captured });

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        const idempotencyKey = new Headers(init?.headers).get('idempotency-key') ?? undefined;
        captured.push({
          url,
          method,
          ...(body === undefined ? {} : { body }),
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        });

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        if (url === `${path}/console`) return Response.json(state);
        if (url === `/events/control/liga-mendocina`) return new Response('', { status: 403 });

        if (url === `${path}/events` && method === 'POST') {
          state = {
            ...state,
            liveScores: state.liveScores.map((side) =>
              side.entrantId === body.side && !keepAuthoritativeScore
                ? { ...side, score: side.score + 1 }
                : side,
            ),
            events: [
              ...state.events,
              {
                eventId: `event-${state.events.length + 1}`,
                definitionCode: body.definitionCode,
                segmentId: body.segmentId,
                sequence: state.events.length + 1,
                occurredAt: new Date(body.occurredAt).toISOString(),
                side: body.side,
              },
            ],
            projectionVersion: state.projectionVersion + 1,
          };
          persist();
          return Response.json({
            eventId: `event-${state.events.length}`,
            definitionCode: body.definitionCode,
            sequence: state.events.length,
            notifications: [],
          });
        }

        if (url === `${path}/clock` && method === 'POST') {
          state = {
            ...state,
            segments: state.segments.map((segment) => ({
              ...segment,
              state: segment.segmentId === body.segmentId ? 'active' : 'pending',
              elapsedSeconds:
                segment.segmentId === body.segmentId ? body.elapsedSeconds : segment.elapsedSeconds,
            })),
            projectionVersion: state.projectionVersion + 1,
          };
          persist();
          return Response.json(state);
        }

        if (url === `${path}/timers/timer-1/resolve` && method === 'POST') {
          state = { ...state, runningTimers: [], projectionVersion: state.projectionVersion + 1 };
          persist();
          return Response.json(state);
        }

        if (url === `${path}/commands/finalize` && method === 'POST') {
          finalizeAttempts += 1;
          if (loseFirstFinalize && finalizeAttempts === 1) throw new Error('network lost');
          state = { ...state, status: 'finalized', projectionVersion: state.projectionVersion + 1 };
          persist();
          return Response.json({
            matchId: state.matchId,
            status: 'finalized',
            clockRunning: false,
            runningTimers: [],
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      initial: projection({ capabilities: options.capabilities }),
      path: matchPath,
      loseFirstFinalize: options.loseFirstFinalize ?? false,
      keepAuthoritativeScore: options.keepAuthoritativeScore ?? false,
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

async function capturedRequests(page: Page): Promise<readonly CapturedRequest[]> {
  return page.evaluate(
    () =>
      (window as typeof window & { readonly __matchConsoleRequests?: CapturedRequest[] })
        .__matchConsoleRequests ?? [],
  );
}

test('records events and reconciles scoreboard, timer, and ledger from the projection', async ({
  page,
}) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByLabel('Marcador actual')).toContainText('1');
  await page.getByRole('button', { name: 'Gol', exact: true }).click();
  await expect(page.getByLabel('Marcador actual')).toContainText('2');
  await expect(page.getByLabel('Ledger y estado')).toContainText('goal');
  await expect(page.getByLabel('Ledger y estado').getByText('02:00')).toBeVisible();
});

test('branches a penalty into its descriptor-declared final outcome', async ({ page }) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('button', { name: 'Penal', exact: true }).click();
  await expect(page.getByLabel('Resultado del evento')).toBeVisible();
  await page.getByRole('button', { name: 'Gol de penal' }).last().click();
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: `${matchPath}/events`,
        body: expect.objectContaining({ definitionCode: 'penalty-goal' }),
      }),
    );
});

test('renders clock and declared timer resolution from refreshed authoritative state', async ({
  page,
}) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Segundos transcurridos').fill('245');
  await page.getByRole('button', { name: 'Aplicar reloj' }).click();
  await expect(page.getByLabel('Reloj 04:05')).toBeVisible();
  await page.getByRole('button', { name: 'Resolver' }).click();
  await expect(page.getByText('Sin timers activos.')).toBeVisible();
  await page.reload();
  await page.waitForURL('**/control/?returnTo=**');
  // The session is in-memory only (0062) and a reload discards it, same as a
  // real browser refresh — log back in to return to this screen so the
  // assertion below is about the persisted match state, not the session.
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByLabel('Reloj 04:05')).toBeVisible();
});

test('guards duplicate finalization and retries a lost response with the same key', async ({
  page,
}) => {
  await mockMatchConsole(page, { loseFirstFinalize: true });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('button', { name: 'Finalizar partido' }).click();
  await page.getByRole('button', { name: 'Confirmar finalización' }).dblclick();
  await expect(page.getByText('network lost')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar finalización' }).click();
  await expect(page.getByText('FINALIZED')).toBeVisible();

  const finalizations = (await capturedRequests(page)).filter(
    (request) => request.url === `${matchPath}/commands/finalize`,
  );
  expect(finalizations).toHaveLength(2);
  expect(finalizations[0]?.idempotencyKey).toBe(finalizations[1]?.idempotencyKey);
});

test('recovers the server projection after an optimistic event differs', async ({ page }) => {
  await mockMatchConsole(page, { keepAuthoritativeScore: true });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('button', { name: 'Gol', exact: true }).click();
  await expect(page.getByLabel('Marcador actual')).toContainText('1');
  await expect(page.getByLabel('Ledger y estado')).toContainText('goal');
});

test('does not expose finalization to a referee without its match capability', async ({ page }) => {
  await mockMatchConsole(page, { capabilities: ['match.record-event'] });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByRole('button', { name: 'Finalizar partido' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gol', exact: true })).toBeEnabled();
});

test('does not grant event recording from the roster-selection capability alone', async ({
  page,
}) => {
  await mockMatchConsole(page, { capabilities: ['match.select-roster'] });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByRole('button', { name: 'Gol', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Finalizar partido' })).toBeDisabled();
});

test('labels every unavailable telemetry signal without fabricated figures', async ({ page }) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('Unavailable')).toHaveCount(4);
  await expect(page.getByText('0 ms')).toHaveCount(0);
});
