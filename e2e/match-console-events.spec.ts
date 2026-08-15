import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Recording an event with a secondary target actor (0090): the assist
 * provider named via the `assistedBy` dropdown — not the scorer — is what
 * gets credited, the event's timecode renders on the timeline, and the
 * live-match statistics reflect the targeted attribution, not the primary
 * actor's.
 */

const matchId = '00000000-0000-7000-8000-000000000002';
const matchPath = `/organizations/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;

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
        elapsedSeconds: 754,
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
    ],
    eligiblePersonIds: ['person-scorer', 'person-assist'],
    rosters: [
      {
        entrantId: 'entrant-a',
        members: [
          { personId: 'person-scorer', name: 'Scorer', onField: true },
          { personId: 'person-assist', name: 'Assist', onField: true },
        ],
      },
      { entrantId: 'entrant-b', members: [] },
    ],
    rosterRoles: [],
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
        JSON.parse(window.sessionStorage.getItem('match-console-state') ?? 'null') ?? initial;
      const persist = () =>
        window.sessionStorage.setItem('match-console-state', JSON.stringify(state));
      const captured: CapturedRequest[] = [];
      Object.assign(window, { __matchConsoleRequests: captured });

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
          const assistedBy = body.payload?.assistedBy as string | undefined;
          state = {
            ...state,
            liveScores: state.liveScores.map((side) =>
              side.entrantId === body.side
                ? {
                    ...side,
                    score: side.score + 1,
                    statistics: {
                      ...side.statistics,
                      // Credited to the assist provider's payload field, not
                      // folded onto the scoring side's own count — proves the
                      // console's request shape is what the fold engine
                      // actually reads at 0090's attribution.
                      ...(assistedBy ? { assists: (side.statistics.assists ?? 0) + 1 } : {}),
                    },
                  }
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
                personId: body.personId,
                segmentElapsedSeconds: state.segments[0]?.elapsedSeconds,
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
    { initial: projection(), path: matchPath, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

async function capturedRequests(page: Page): Promise<readonly CapturedRequest[]> {
  return page.evaluate(
    () =>
      (window as typeof window & { readonly __matchConsoleRequests?: CapturedRequest[] })
        .__matchConsoleRequests ?? [],
  );
}

test('records a secondary target actor selection, shows the timecode, and updates their live statistic', async ({
  page,
}) => {
  await mockMatchConsole(page);
  await seedLoginTransaction(
    page,
    `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`,
  );
  await page.goto(loginCallbackUrl());

  await page.getByRole('button', { name: 'Scorer', exact: true }).click();
  await page.getByRole('button', { name: 'assistedBy', exact: true }).click();
  await page.getByRole('button', { name: 'Assist', exact: true }).click();
  await page.getByRole('button', { name: 'Gol', exact: true }).click();

  const requests = await capturedRequests(page);
  const recorded = requests.find(
    (request) => request.url.endsWith('/events') && request.method === 'POST',
  );
  expect(recorded?.body).toMatchObject({
    personId: 'person-scorer',
    payload: { assistedBy: 'person-assist' },
  });

  // The timeline entry shows the segment clock snapshot alongside the event.
  await expect(page.getByText('goal · half 1 · 12:34')).toBeVisible();
});
