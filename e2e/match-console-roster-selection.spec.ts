import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * `0107-match-roster-selection`: before this change, no route existed to
 * select a match roster at all — `match_rosters` had readers and no writer,
 * so no person-attributed event could ever be recorded. This drives the new
 * roster-selection screen the console gained, mocking the new
 * `GET .../rosters/:entrantId/candidates` and `PUT .../rosters/:entrantId`
 * routes the same way `match-console-jersey-grid.spec.ts` mocks `/events`.
 */

const matchId = '00000000-0000-7000-8000-000000000004';
const orgPath = `/organizations/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
const controlPath = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: Record<string, unknown>;
}

function projection(rosters: readonly unknown[] = []) {
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
        payloadSchema: { type: 'object' },
        display: {},
        secondaryActorFields: [],
      },
    ],
    eligiblePersonIds: rosters.length > 0 ? ['person-a1'] : [],
    rosters,
    rosterRoles: [{ code: 'captain', label: 'Captain', badge: 'C' }],
    eligibleStaffIds: [],
    entrantIds: ['entrant-a', 'entrant-b'],
    capabilities: [
      'match.select-roster',
      'match.record-event',
      'match.control-clock',
      'match.finalize',
    ],
    projectionVersion: 1,
  };
}

const CANDIDATES: Record<string, unknown[]> = {
  'entrant-a': [
    { personId: 'person-a1', name: 'Scorer' },
    { personId: 'person-a2', name: 'Playmaker' },
  ],
  'entrant-b': [{ personId: 'person-b1', name: 'Defender' }],
};

async function mockMatchConsole(page: Page): Promise<void> {
  await page.addInitScript(
    ({ initial, path, tokenEndpoint, candidates }) => {
      let state = initial;
      const captured: CapturedRequest[] = [];
      Object.assign(window, { __rosterSelectionRequests: captured });

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

        const candidatesMatch = url.match(/\/rosters\/([^/]+)\/candidates$/);
        if (candidatesMatch && method === 'GET') {
          return Response.json(
            (candidates as Record<string, unknown[]>)[candidatesMatch[1] ?? ''] ?? [],
          );
        }

        const rosterMatch = url.match(/\/rosters\/([^/]+)$/);
        if (rosterMatch && method === 'PUT') {
          const entrantId = rosterMatch[1];
          const members = (body.members as { personId: string }[]).map((member) => ({
            ...member,
            name:
              (candidates as Record<string, { personId: string; name: string }[]>)[
                entrantId ?? ''
              ]?.find((candidate) => candidate.personId === member.personId)?.name ?? '',
          }));
          state = {
            ...state,
            rosters: [
              ...state.rosters.filter((r: { entrantId: string }) => r.entrantId !== entrantId),
              { entrantId, members },
            ],
            eligiblePersonIds: [
              ...new Set([
                ...state.eligiblePersonIds,
                ...members.map((m: { personId: string }) => m.personId),
              ]),
            ],
            projectionVersion: state.projectionVersion + 1,
          };
          return Response.json(state);
        }

        return new Response('Not found', { status: 404 });
      };
    },
    { initial: projection(), path: orgPath, tokenEndpoint: TOKEN_ENDPOINT, candidates: CANDIDATES },
  );
}

async function capturedRequests(page: Page): Promise<readonly CapturedRequest[]> {
  return page.evaluate(
    () =>
      (window as typeof window & { readonly __rosterSelectionRequests?: CapturedRequest[] })
        .__rosterSelectionRequests ?? [],
  );
}

test.beforeEach(async ({ page }) => {
  await mockMatchConsole(page);
  await seedLoginTransaction(page, controlPath);
  await page.goto(loginCallbackUrl());
});

// The control panel defaults to Spanish in this environment (`ControlIntl`'s
// placeholder-organization default) — asserting the real default-locale
// strings, not English, is what actually exercises the shipped UI.

test('shows an explicit no-roster state and opens the selection step from it', async ({ page }) => {
  await expect(page.getByText('Sin plantel seleccionado para este partido todavía.')).toBeVisible();
  await page.getByRole('button', { name: 'Seleccionar plantel', exact: true }).first().click();
  await expect(page.getByText('Scorer')).toBeVisible();
  await expect(page.getByText('Playmaker')).toBeVisible();
});

test('selects a roster and submits it through the real write path', async ({ page }) => {
  await page.getByRole('button', { name: 'Seleccionar plantel', exact: true }).first().click();
  await expect(page.getByText('Scorer')).toBeVisible();

  const scorerRow = page.locator('li', { hasText: 'Scorer' });
  await scorerRow.getByRole('checkbox').first().check();
  await scorerRow.getByPlaceholder('N.º').fill('9');

  // entrant-a's editor renders first, matching `entrantIds`' declared order.
  await page.getByRole('button', { name: 'Guardar plantel', exact: true }).first().click();

  await expect
    .poll(async () => {
      const requests = await capturedRequests(page);
      return requests.some(
        (request) => request.url.endsWith('/rosters/entrant-a') && request.method === 'PUT',
      );
    })
    .toBe(true);

  const requests = await capturedRequests(page);
  const put = requests.find(
    (request) => request.url.endsWith('/rosters/entrant-a') && request.method === 'PUT',
  );
  expect(put?.body).toMatchObject({
    members: [expect.objectContaining({ personId: 'person-a1', number: '9' })],
  });

  // The jersey grid now renders the newly selected player.
  await expect(page.getByRole('button', { name: 'Scorer', exact: true })).toBeVisible();
});
