import { expect, test, type Page } from '@playwright/test';
import Papa from 'papaparse';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/** Mirrors `apps/web/src/control/lib/match-data-builder.ts`'s own column list. */
const MATCH_DATA_CSV_COLUMNS = [
  'type',
  'entrantId',
  'personName',
  'number',
  'roles',
  'onField',
  'segmentType',
  'elapsedSeconds',
  'definitionCode',
  'segmentNumber',
  'occurredAt',
  'side',
  'notes',
  'winnerEntrantId',
] as const;

/** Builds a CSV fixture from partial row objects, explicitly column-aligned (see match-data-builder.ts's own `buildMatchDataCsv`). */
function buildMatchDataCsv(
  rows: readonly Partial<Record<(typeof MATCH_DATA_CSV_COLUMNS)[number], string>>[],
): string {
  return Papa.unparse(
    {
      fields: [...MATCH_DATA_CSV_COLUMNS],
      data: rows.map((row) => MATCH_DATA_CSV_COLUMNS.map((column) => row[column] ?? '')),
    },
    { newline: '\n' },
  );
}

/**
 * A match played with no live console
 * present, entered as one batch (roster, segments, events, result) through
 * `/control/.../matches/:matchId/load` and the `POST .../bulk-load` route —
 * mocked the same way `match-console-roster-selection.spec.ts` mocks the
 * console projection and roster-candidate routes.
 */

const matchId = '00000000-0000-7000-8000-000000000005';
const orgPath = `/organizations/liga-mendocina/tournaments/apertura-2026/matches/${matchId}`;
const controlPath = `/control/liga-mendocina/tournaments/apertura-2026/matches/${matchId}/load`;

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: Record<string, unknown>;
}

function scheduledProjection() {
  return {
    matchId,
    status: 'scheduled',
    result: null,
    liveScores: [],
    segments: [],
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
    eligiblePersonIds: [],
    rosters: [],
    rosterRoles: [],
    eligibleStaffIds: [],
    entrantIds: ['entrant-a', 'entrant-b'],
    capabilities: ['match.select-roster', 'match.record-event', 'match.finalize'],
    projectionVersion: 1,
  };
}

const CANDIDATES: Record<string, unknown[]> = {
  'entrant-a': [{ personId: 'person-a1', name: 'Scorer' }],
  'entrant-b': [{ personId: 'person-b1', name: 'Defender' }],
};

async function mockLoadMatchData(page: Page): Promise<void> {
  await page.addInitScript(
    ({ initial, path, tokenEndpoint, candidates }) => {
      const captured: CapturedRequest[] = [];
      Object.assign(window, { __loadMatchDataRequests: captured });

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        captured.push({ url, method, ...(body === undefined ? {} : { body }) });

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${path}/console`) return Response.json(initial);
        if (url === `/events/control/liga-mendocina`) return new Response('', { status: 403 });

        const candidatesMatch = url.match(/\/rosters\/([^/]+)\/candidates$/);
        if (candidatesMatch && method === 'GET') {
          return Response.json(
            (candidates as Record<string, unknown[]>)[candidatesMatch[1] ?? ''] ?? [],
          );
        }

        if (url === `${path}/bulk-load` && method === 'POST') {
          return Response.json({
            matchId: (body as { matchId?: string })?.matchId ?? '',
            status: 'finalized',
            eventCount: (body?.events as unknown[] | undefined)?.length ?? 0,
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      initial: scheduledProjection(),
      path: orgPath,
      tokenEndpoint: TOKEN_ENDPOINT,
      candidates: CANDIDATES,
    },
  );
}

async function capturedRequests(page: Page): Promise<readonly CapturedRequest[]> {
  return page.evaluate(
    () =>
      (window as typeof window & { readonly __loadMatchDataRequests?: CapturedRequest[] })
        .__loadMatchDataRequests ?? [],
  );
}

test.beforeEach(async ({ page }) => {
  await mockLoadMatchData(page);
  await seedLoginTransaction(page, controlPath);
  await page.goto(loginCallbackUrl());
});

// The control panel defaults to Spanish in this environment — asserting the
// real default-locale strings, not English, is what actually exercises the
// shipped UI (see match-console-roster-selection.spec.ts's own note).

test('builds and submits a batch through the real bulk-load route', async ({ page }) => {
  await expect(page.getByText('Cargar datos del partido').first()).toBeVisible();
  await expect(page.getByText('Scorer')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Scorer' }).check();
  await page.getByRole('button', { name: 'Agregar segmento' }).click();
  await page.getByRole('button', { name: 'Agregar evento' }).click();

  await page.getByRole('button', { name: 'Enviar datos del partido' }).click();

  await expect
    .poll(async () => {
      const requests = await capturedRequests(page);
      return requests.some(
        (request) => request.url.endsWith('/bulk-load') && request.method === 'POST',
      );
    })
    .toBe(true);

  const requests = await capturedRequests(page);
  const post = requests.find(
    (request) => request.url.endsWith('/bulk-load') && request.method === 'POST',
  );
  expect(post?.body).toMatchObject({
    rosters: [
      { entrantId: 'entrant-a', members: [expect.objectContaining({ personId: 'person-a1' })] },
    ],
    segments: [{ type: '' }],
  });
  expect((post?.body?.events as unknown[] | undefined)?.length).toBe(1);

  await expect(page.getByText(/se registraron 1 evento\(s\)/)).toBeVisible();
});

test('imports a CSV into the builder and submits the resulting batch', async ({ page }) => {
  await expect(page.getByText('Scorer')).toBeVisible();

  const csv = buildMatchDataCsv([
    { type: 'roster', entrantId: 'entrant-a', personName: 'Scorer', number: '9', onField: 'true' },
    { type: 'segment', segmentType: 'half', elapsedSeconds: '2700' },
    {
      type: 'event',
      definitionCode: 'goal',
      segmentNumber: '1',
      occurredAt: '2025-03-15T15:32:00Z',
      side: 'entrant-a',
    },
    { type: 'result', winnerEntrantId: 'entrant-a' },
  ]);

  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'match.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await expect(page.locator('input[value="9"]')).toBeVisible();
  await expect(page.locator('input[value="half"]')).toBeVisible();

  await page.getByRole('button', { name: 'Enviar datos del partido' }).click();

  await expect
    .poll(async () => {
      const requests = await capturedRequests(page);
      return requests.some(
        (request) => request.url.endsWith('/bulk-load') && request.method === 'POST',
      );
    })
    .toBe(true);

  const requests = await capturedRequests(page);
  const post = requests.find(
    (request) => request.url.endsWith('/bulk-load') && request.method === 'POST',
  );
  expect(post?.body).toMatchObject({
    segments: [{ type: 'half', elapsedSeconds: 2700 }],
    result: { winnerEntrantId: 'entrant-a' },
  });
});
