import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * The tactile Dual Jersey Grid (0092): operators record every event by
 * tapping jerseys rather than picking from `<select>` dropdowns — scoring a
 * goal, crediting an assist via the `assistedBy` field chip, sanctioning an
 * opponent, swapping on-field status with a substitution (which needs two
 * jersey taps for `playerOutId`/`playerInId`, a declarative
 * `personPayloadFields` field with no behavioral effect of its own — see
 * design.md's 1.6a addendum), and logging an own goal through the same
 * generic event palette a first-class `own-goal` definition already
 * populates, with no dedicated own-goal UI.
 */

const matchId = '00000000-0000-7000-8000-000000000003';
const orgPath = `/organizations/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
const controlPath = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: Record<string, unknown>;
}

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
        elapsedSeconds: 60,
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
        actorRequirement: 'person',
        payloadSchema: { type: 'object', properties: { assistedBy: { type: 'string' } } },
        display: {},
        secondaryActorFields: ['assistedBy'],
      },
      {
        code: 'own-goal',
        label: 'Gol en contra',
        category: 'negative',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'person',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
      {
        code: 'yellow-card',
        label: 'Tarjeta amarilla',
        category: 'negative',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'person',
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
      {
        code: 'substitution',
        label: 'Cambio',
        category: 'neutral',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'side',
        payloadSchema: {
          type: 'object',
          properties: { playerOutId: { type: 'string' }, playerInId: { type: 'string' } },
        },
        display: {},
        secondaryActorFields: ['playerOutId', 'playerInId'],
      },
    ],
    eligiblePersonIds: ['person-a1', 'person-a2', 'person-a-bench', 'person-b1'],
    rosters: [
      {
        entrantId: 'entrant-a',
        members: [
          {
            personId: 'person-a1',
            number: 9,
            name: 'Scorer',
            roles: ['goalkeeper'],
            onField: true,
          },
          { personId: 'person-a2', number: 10, name: 'Playmaker', onField: true },
          { personId: 'person-a-bench', number: 12, name: 'Bench Sub', onField: false },
        ],
      },
      {
        entrantId: 'entrant-b',
        members: [{ personId: 'person-b1', number: 4, name: 'Defender', onField: true }],
      },
    ],
    rosterRoles: [
      { code: 'goalkeeper', label: 'Goalkeeper', badge: 'GK' },
      { code: 'captain', label: 'Captain', badge: 'C' },
    ],
    eligibleStaffIds: [],
    entrantIds: ['entrant-a', 'entrant-b'],
    capabilities: ['match.record-event', 'match.control-clock', 'match.finalize'],
    projectionVersion: 1,
  };
}

async function mockMatchConsole(page: Page): Promise<void> {
  await page.addInitScript(
    ({ initial, path, tokenEndpoint }) => {
      let state =
        JSON.parse(window.sessionStorage.getItem('jersey-grid-state') ?? 'null') ?? initial;
      const persist = () =>
        window.sessionStorage.setItem('jersey-grid-state', JSON.stringify(state));
      const captured: CapturedRequest[] = [];
      Object.assign(window, { __jerseyGridRequests: captured });

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        captured.push({ url, method, ...(body === undefined ? {} : { body }) });

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${path}/console`) return Response.json(state);
        if (url === `/events/control/liga-mendocina`) return new Response('', { status: 403 });

        if (url === `${path}/events` && method === 'POST') {
          state = {
            ...state,
            events: [
              ...state.events,
              {
                eventId: `event-${state.events.length + 1}`,
                definitionCode: body.definitionCode,
                segmentId: body.segmentId,
                sequence: state.events.length + 1,
                occurredAt: new Date(body.occurredAt).toISOString(),
                side: body.side,
                personId: body.personId,
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

        return new Response('Not found', { status: 404 });
      };
    },
    { initial: projection(), path: orgPath, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

async function capturedRequests(page: Page): Promise<readonly CapturedRequest[]> {
  return page.evaluate(
    () =>
      (window as typeof window & { readonly __jerseyGridRequests?: CapturedRequest[] })
        .__jerseyGridRequests ?? [],
  );
}

async function lastRecordedEvent(page: Page): Promise<CapturedRequest | undefined> {
  const requests = await capturedRequests(page);
  return [...requests]
    .reverse()
    .find((request) => request.url.endsWith('/events') && request.method === 'POST');
}

test.beforeEach(async ({ page }) => {
  await mockMatchConsole(page);
  await seedLoginTransaction(page, controlPath);
  await page.goto(loginCallbackUrl());
});

test('scores a goal and credits an assist via the jersey grid', async ({ page }) => {
  await page.getByRole('button', { name: 'Scorer', exact: true }).click();
  await page.getByRole('button', { name: 'assistedBy', exact: true }).click();
  await page.getByRole('button', { name: 'Playmaker', exact: true }).click();
  await page.getByRole('button', { name: 'Gol', exact: true }).click();

  expect((await lastRecordedEvent(page))?.body).toMatchObject({
    definitionCode: 'goal',
    personId: 'person-a1',
    payload: { assistedBy: 'person-a2' },
  });
});

test('sanctions an opposing player selected from the opponent grid', async ({ page }) => {
  await page.getByRole('button', { name: 'Defender', exact: true }).click();
  await page.getByRole('button', { name: 'Tarjeta amarilla', exact: true }).click();

  expect((await lastRecordedEvent(page))?.body).toMatchObject({
    definitionCode: 'yellow-card',
    personId: 'person-b1',
    side: 'entrant-b',
  });
});

test('records a substitution by tapping the outgoing and incoming jerseys', async ({ page }) => {
  // Primary tap sets the side the substitution belongs to.
  await page.getByRole('button', { name: 'Playmaker', exact: true }).click();
  await page.getByRole('button', { name: 'playerOutId', exact: true }).click();
  await page.getByRole('button', { name: 'Playmaker', exact: true }).click();
  await page.getByRole('button', { name: 'playerInId', exact: true }).click();
  await page.getByRole('button', { name: 'Bench Sub', exact: true }).click();
  await page.getByRole('button', { name: 'Cambio', exact: true }).click();

  expect((await lastRecordedEvent(page))?.body).toMatchObject({
    definitionCode: 'substitution',
    side: 'entrant-a',
    payload: { playerOutId: 'person-a2', playerInId: 'person-a-bench' },
  });
});

test('logs an own goal through the same generic event palette, no dedicated workflow', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Defender', exact: true }).click();
  await page.getByRole('button', { name: 'Gol en contra', exact: true }).click();

  expect((await lastRecordedEvent(page))?.body).toMatchObject({
    definitionCode: 'own-goal',
    personId: 'person-b1',
  });
});
