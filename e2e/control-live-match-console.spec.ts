import { expect, test, type Page } from './csp-guard.js';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const matchId = '00000000-0000-7000-8000-000000000001';
const matchPath = `/api/organizations/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;

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
        secondaryActorFields: [],
      },
      {
        code: 'penalty',
        label: 'Penal',
        category: 'neutral',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
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
        secondaryActorFields: [],
      },
      {
        code: 'penalty-missed',
        label: 'Penal fallado',
        category: 'negative',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
      // Real football.json vocabulary, not an invented fixture: an
      // official presses "Falta", then picks its outcome — play on, a
      // restart, or a card, the last two reusing the discipline's existing
      // card events rather than declaring foul-scoped copies.
      {
        code: 'foul',
        label: 'Falta',
        category: 'neutral',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
        workflow: {
          kind: 'outcome-choice',
          options: [
            { definitionCode: 'foul-play-on', label: 'Ley de ventaja' },
            { definitionCode: 'free-kick-awarded', label: 'Tiro libre' },
            { definitionCode: 'penalty-awarded', label: 'Penal' },
            { definitionCode: 'yellow-card', label: 'Tarjeta amarilla' },
            { definitionCode: 'red-card', label: 'Tarjeta roja' },
          ],
        },
      },
      {
        code: 'foul-play-on',
        label: 'Falta (ley de ventaja)',
        category: 'neutral',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
      {
        code: 'free-kick-awarded',
        label: 'Tiro libre otorgado',
        category: 'neutral',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
      {
        code: 'penalty-awarded',
        label: 'Penal otorgado',
        category: 'neutral',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
      {
        code: 'yellow-card',
        label: 'Tarjeta amarilla',
        category: 'negative',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
      {
        code: 'red-card',
        label: 'Tarjeta roja',
        category: 'negative',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
    ],
    eligiblePersonIds: [],
    rosters: [],
    rosterRoles: [],
    eligibleStaffIds: [],
    segmentPlan: {
      regulation: { type: 'half', typeLabel: 'Tiempo', count: 2, maximum: 2 },
      addable: [
        { type: 'half', typeLabel: 'Tiempo', withinPlan: true },
        { type: 'extra-time', typeLabel: 'Tiempo extra', withinPlan: true },
      ],
    },
    entrants: [
      { entrantId: 'entrant-a', name: 'Club Atlético Norte', abbreviation: 'CAN' },
      { entrantId: 'entrant-b', name: 'Deportivo Cuyo', abbreviation: 'DCU' },
    ],
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
    readonly withoutSegments?: boolean;
    readonly status?: 'scheduled' | 'in-progress';
    readonly segmentPlan?: Record<string, unknown>;
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
          // A correction sets the time and keeps every segment's state.
          state = {
            ...state,
            segments: state.segments.map((segment) =>
              segment.segmentId === body.segmentId
                ? { ...segment, elapsedSeconds: body.elapsedSeconds }
                : segment,
            ),
            projectionVersion: state.projectionVersion + 1,
          };
          persist();
          return Response.json(state);
        }

        const reopenMatch = url.match(new RegExp(`^${path}/segments/([^/]+)/reopen$`));
        if (reopenMatch && method === 'POST') {
          state = {
            ...state,
            segments: state.segments.map((segment) =>
              segment.segmentId === reopenMatch[1] ? { ...segment, state: 'pending' } : segment,
            ),
            projectionVersion: state.projectionVersion + 1,
          };
          persist();
          return Response.json(state);
        }

        if (url === `${path}/segments` && method === 'POST') {
          const number = state.segments.length + 1;
          state = {
            ...state,
            segments: [
              ...state.segments,
              {
                segmentId: `segment-added-${number}`,
                type: body.type,
                number,
                state: 'pending',
                elapsedSeconds: 0,
              },
            ],
            projectionVersion: state.projectionVersion + 1,
          };
          persist();
          return Response.json({
            matchId: state.matchId,
            status: state.status,
            clockRunning: false,
            runningTimers: [],
          });
        }

        if (url === `${path}/timers/timer-1/resolve` && method === 'POST') {
          state = { ...state, runningTimers: [], projectionVersion: state.projectionVersion + 1 };
          persist();
          return Response.json(state);
        }

        const clockCommand = ['start', 'pause', 'resume', 'end'].find(
          (name) => url === `${path}/commands/${name}` && method === 'POST',
        );
        if (clockCommand) {
          if (!state.capabilities.includes('match.control-clock')) {
            return new Response('Forbidden', { status: 403 });
          }
          // A start with no segments creates the regulation, as the server does.
          if (clockCommand === 'start' && state.segments.length === 0) {
            state = {
              ...state,
              status: 'in-progress',
              segments: [1, 2].map((number) => ({
                segmentId: `segment-${number}`,
                type: 'half',
                number,
                state: 'pending',
                elapsedSeconds: 0,
              })),
            };
          }
          const target = body.segmentId || 'segment-1';
          const resulting =
            clockCommand === 'end' ? 'completed' : clockCommand === 'pause' ? 'pending' : 'active';
          state = {
            ...state,
            segments: state.segments.map((segment) =>
              segment.segmentId === target
                ? {
                    ...segment,
                    state: resulting,
                    // The clock ran for a minute before it was stopped.
                    ...(clockCommand === 'pause'
                      ? { elapsedSeconds: segment.elapsedSeconds + 60 }
                      : {}),
                  }
                : resulting === 'active' && segment.state === 'active'
                  ? { ...segment, state: 'pending' }
                  : segment,
            ),
            projectionVersion: state.projectionVersion + 1,
          };
          persist();
          return Response.json({
            matchId: state.matchId,
            status: state.status,
            clockRunning: resulting === 'active',
            runningTimers: [],
          });
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
      initial: {
        ...projection({ capabilities: options.capabilities }),
        ...(options.withoutSegments ? { segments: [] } : {}),
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(options.segmentPlan === undefined ? {} : { segmentPlan: options.segmentPlan }),
      },
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

test('records a foul, chooses a card outcome, and shows it in the ledger', async ({ page }) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('button', { name: 'Falta', exact: true }).click();
  await expect(page.getByLabel('Resultado del evento')).toBeVisible();
  await page.getByRole('button', { name: 'Tarjeta amarilla' }).last().click();

  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: `${matchPath}/events`,
        body: expect.objectContaining({ definitionCode: 'yellow-card' }),
      }),
    );
  // The chosen outcome is what lands in the timeline — the preliminary
  // "foul" trigger is never itself submitted.
  await expect(page.getByLabel('Ledger y estado')).toContainText('yellow-card');
});

test('renders clock and declared timer resolution from refreshed authoritative state', async ({
  page,
}) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Tiempo (mm:ss)').fill('04:05');
  await page.getByRole('button', { name: 'Corregir', exact: true }).click();
  await expect(page.getByLabel('Reloj 04:05')).toBeVisible();
  await page.getByRole('button', { name: 'Resolver' }).click();
  await expect(page.getByText('Sin timers activos.')).toBeVisible();
  await page.reload();
  if (page.url().includes('/control/login')) {
    await seedLoginTransaction(page, target);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${target}`);
  }
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
  // A lost response is a network-level failure, not a refusal — the
  // queue leaves it queued silently (no error banner); the retry below is
  // exactly that silent-requeue path, the same key reused, now getting
  // through.
  // The queued count is on-demand detail behind the connectivity icon now.
  await page.locator('.cl-connection-status').focus();
  await expect(page.getByText('1 acción en cola')).toBeVisible();
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

test('carries no broadcast-stream telemetry panel', async ({ page }) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByRole('button', { name: 'Gol', exact: true })).toBeVisible();

  for (const label of ['Señal operativa', 'Latencia', 'Packet loss', 'Espectadores', 'Uptime']) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Unavailable')).toHaveCount(0);
});

test('names both sides in the score header before any roster exists', async ({ page }) => {
  // This projection carries no rosters at all — the entrants name themselves,
  // so the header never falls back to an identifier while waiting for one.
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const scoreboard = page.getByLabel('Marcador actual');
  await expect(scoreboard.getByText('Club Atlético Norte')).toBeVisible();
  await expect(scoreboard.getByText('Deportivo Cuyo')).toBeVisible();
  await expect(scoreboard).not.toContainText('entrant-a');
  await expect(scoreboard).not.toContainText('entrant-b');
});

test('keeps connection and sync state visible in the console header', async ({ page }) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const indicator = page.locator('.cl-connection-status');
  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText('En línea');
  await expect(indicator).toContainText('Última sincronización');
  await expect(page.getByText('Sin acciones en cola')).toHaveCount(0);
});

test('starts a match, pauses its half, corrects the time, ends it and reopens it with a reason', async ({
  page,
}) => {
  await mockMatchConsole(page, {
    withoutSegments: true,
    status: 'scheduled',
    segmentPlan: {
      regulation: { type: 'half', typeLabel: 'Tiempo', count: 2, maximum: 2 },
      addable: [{ type: 'half', typeLabel: 'Tiempo', withinPlan: true }],
    },
  });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('button', { name: 'Iniciar partido' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();

  // A stopped half with time on it is paused, and offers Resume.
  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.locator('#console-segment')).toContainText('pausado');
  await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible();

  // Correcting the time keeps the half paused.
  await page.locator('input#console-clock-time').fill('20:50');
  await page.getByRole('button', { name: 'Corregir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pausar' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Terminar período' }).click();
  await expect(page.getByRole('button', { name: 'Reanudar' })).toHaveCount(0);

  // The console follows the match to the next unplayed half, so the ended one is picked again.
  await page.getByLabel('Segmento activo').selectOption('segment-1');

  // Reopening asks for a reason, and returns the half to paused with its time kept.
  await page.getByRole('button', { name: 'Reabrir período…' }).click();
  const confirm = page.getByRole('button', { name: 'Reabrir período', exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Motivo').fill('Terminado por error');
  await confirm.click();
  await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible();

  await expect
    .poll(async () =>
      (await capturedRequests(page))
        .filter(
          (request) =>
            request.url.includes('/commands/') ||
            request.url.endsWith('/clock') ||
            request.url.includes('/reopen'),
        )
        .map((request) => [request.url.split(matchPath)[1], request.body]),
    )
    .toEqual([
      ['/commands/start', { segmentId: '' }],
      ['/commands/pause', { segmentId: 'segment-1' }],
      ['/clock', { segmentId: 'segment-1', elapsedSeconds: 1250 }],
      ['/commands/end', { segmentId: 'segment-1' }],
      ['/segments/segment-1/reopen', { reason: 'Terminado por error' }],
    ]);
});

test('shows the running time in the time field, and corrects only a value typed into it', async ({
  page,
}) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // The running segment reads 02:00. Correct is unavailable until the operator types a time, and
  // nothing reaches the server in the meantime.
  const time = page.locator('input#console-clock-time');
  const correct = page.getByRole('button', { name: 'Corregir', exact: true });
  await expect(time).toHaveValue('02:00');
  await expect(correct).toBeDisabled();
  await expect
    .poll(async () =>
      (await capturedRequests(page)).filter((request) => request.url.endsWith('/clock')),
    )
    .toEqual([]);

  await time.fill('20:50');
  await expect(correct).toBeEnabled();
  await correct.click();

  await expect
    .poll(async () =>
      (await capturedRequests(page))
        .filter((request) => request.url.endsWith('/clock'))
        .map((request) => request.body),
    )
    .toEqual([{ segmentId: 'segment-1', elapsedSeconds: 1250 }]);
  await expect(time).toHaveValue('20:50');
  await expect(correct).toBeDisabled();
  // The running half keeps running.
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
});

test('a scheduled match with no segments says what Start creates, and sends Start', async ({
  page,
}) => {
  await mockMatchConsole(page, {
    withoutSegments: true,
    status: 'scheduled',
    segmentPlan: {
      regulation: { type: 'half', typeLabel: 'Tiempo', count: 2, maximum: 2 },
      addable: [{ type: 'half', typeLabel: 'Tiempo', withinPlan: true }],
    },
  });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('Iniciar crea 2 segmentos de tipo Tiempo')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar partido', exact: true }).click();
  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({ url: `${matchPath}/commands/start`, method: 'POST' }),
    );
});

test('an in-progress match adds extra time from Add segment', async ({ page }) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('combobox', { name: 'Segmento a agregar' }).selectOption('extra-time');
  await page.getByRole('button', { name: 'Agregar segmento', exact: true }).click();

  await expect
    .poll(() => capturedRequests(page))
    .toContainEqual(
      expect.objectContaining({
        url: `${matchPath}/segments`,
        method: 'POST',
        body: { type: 'extra-time' },
      }),
    );
});

test('an addition beyond the plan is labelled as outside it', async ({ page }) => {
  await mockMatchConsole(page, {
    segmentPlan: {
      regulation: { type: 'half', typeLabel: 'Tiempo', count: 2, maximum: 2 },
      addable: [{ type: 'half', typeLabel: 'Tiempo', withinPlan: false }],
    },
  });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByRole('combobox', { name: 'Segmento a agregar' })).toContainText(
    'Tiempo (fuera del plan)',
  );
});

test('a match in progress with no segments offers Add segment beside Finalize', async ({
  page,
}) => {
  await mockMatchConsole(page, { withoutSegments: true });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByRole('button', { name: 'Agregar segmento', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalizar partido' })).toBeVisible();
});

test('a match with no segments offers no clock, and says why', async ({ page }) => {
  await mockMatchConsole(page, { withoutSegments: true });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('Este partido todavía no tiene segmentos.')).toBeVisible();
  for (const name of ['Iniciar partido', 'Iniciar período', 'Pausar', 'Reanudar', 'Corregir']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: 'Finalizar partido' })).toBeVisible();
});

test('does not offer clock commands without the clock-control capability', async ({ page }) => {
  await mockMatchConsole(page, { capabilities: ['match.record-event'] });
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // The running segment offers Pause and End; without the capability they are disabled.
  for (const name of ['Pausar', 'Terminar período']) {
    await expect(page.getByRole('button', { name })).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: 'Iniciar período' })).toHaveCount(0);
});

test('shows the running segment and one primary action while the match is in progress', async ({
  page,
}) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // The segment select names the half in play, not an empty box.
  await expect(page.locator('#console-segment')).toContainText('en juego');
  await expect(page.getByRole('button', { name: 'Iniciar período' })).toHaveCount(0);

  // One primary action for the state: the clock is running, so it is Pausar.
  const primary = page.locator('main button.cl-btn--primary:visible');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveText('Pausar');

  // Nothing recorded yet: the ledger says so instead of drawing an empty bordered list.
  await expect(page.getByText('No hay eventos para mostrar.')).toBeVisible();
  await expect(page.locator('ol.cl-platform-update-list')).toHaveCount(0);
});

test('collapses the ledger to a peek strip that still shows what was just recorded', async ({
  page,
}) => {
  await mockMatchConsole(page);
  const target = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const ledger = page.locator('ol.cl-platform-update-list');
  const recorded = await ledger.getByRole('listitem').count();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: 'Gol', exact: true }).click();
    await expect(ledger.getByRole('listitem')).toHaveCount(Math.min(recorded + index + 1, 3));
  }

  // Collapsed: only the most recent three, the last one recorded among them.
  await expect(ledger.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Ver historial completo' }).click();
  await expect(ledger.getByRole('listitem')).toHaveCount(recorded + 4);
  await page.getByRole('button', { name: 'Ver menos' }).click();
  await expect(ledger.getByRole('listitem')).toHaveCount(3);
});
