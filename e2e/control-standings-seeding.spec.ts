import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * A5 and A6 in a real browser.
 *
 * The API is stubbed at `window.fetch`, as the other control-panel e2e specs do: what these
 * assert is the screen — that a tied row opens its engine trace, that a locked
 * seed survives a randomize, that both halves of a double-elimination bracket
 * render with named placeholders, and that a refused reseed says so in the
 * server's own words.
 */

const TOURNAMENT = '/organizations/liga-mendocina/tournaments/apertura-2026';
const STAGE = `${TOURNAMENT}/stages/1`;

/** The declared layouts a tab bar reads (0091) — one 'group-phase' layout is enough for this spec. */
const tableLayoutsFixture = {
  layouts: [
    {
      code: 'group-standings-default',
      target: 'group-phase',
      label: 'Group Standings',
      entityGranularity: 'team',
    },
  ],
};

const groupStandingsProjectionFixture = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  columns: [
    { code: 'name', header: 'Team', format: 'text' },
    { code: 'points', header: 'Points', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  rows: [
    {
      actorId: 'Deportivo Norte',
      entrantId: 'Deportivo Norte',
      rank: 1,
      sharedRank: true,
      cells: {
        name: { raw: 'Deportivo Norte', formatted: 'Deportivo Norte' },
        points: { raw: 13, formatted: '13' },
      },
    },
    {
      actorId: 'Atlético Sur',
      entrantId: 'Atlético Sur',
      rank: 1,
      sharedRank: true,
      cells: {
        name: { raw: 'Atlético Sur', formatted: 'Atlético Sur' },
        points: { raw: 13, formatted: '13' },
      },
    },
    {
      actorId: 'Club Cometa',
      entrantId: 'Club Cometa',
      rank: 3,
      sharedRank: false,
      cells: {
        name: { raw: 'Club Cometa', formatted: 'Club Cometa' },
        points: { raw: 4, formatted: '4' },
      },
    },
  ],
  projectionVersion: 12,
};

/**
 * Per-entrant trace, keyed the way the server actually answers each row's
 * lazy fetch — 'Club Cometa' isn't tied with anyone, so its own real answer
 * is an empty comparator chain, not the leaders' trace repeated.
 */
const traceByEntrant: Record<
  string,
  { readonly entrantId: string; readonly lines: readonly string[] }
> = {
  'Deportivo Norte': {
    entrantId: 'Deportivo Norte',
    lines: [
      'Rule 1 (Puntos): Deportivo Norte=13, Atlético Sur=13 → Tie not fully resolved by Puntos; proceed to next comparator',
      'Rule 2 (A favor): Deportivo Norte=28, Atlético Sur=24 → A favor resolved the tie',
    ],
  },
  'Club Cometa': { entrantId: 'Club Cometa', lines: [] },
};

/** A double-elimination stage: winners, losers and a grand final. */
const seedingFixture = {
  stageId: 'stage-001',
  format: 'double-elimination',
  seeds: [
    { seed: 1, entrantId: 'Deportivo Norte' },
    { seed: 2, entrantId: 'Atlético Sur' },
    { seed: 3, entrantId: 'Club Cometa' },
    { seed: 4, entrantId: 'Unión Andina' },
  ],
  matches: [
    {
      matchId: 'WB-R1-M1',
      bracket: 'winners',
      round: 1,
      position: 1,
      status: 'finalized',
      format: 'BO3',
      slots: [
        { kind: 'entrant', entrantId: 'Deportivo Norte', score: 2 },
        { kind: 'entrant', entrantId: 'Unión Andina', score: 0 },
      ],
    },
    {
      matchId: 'WB-R1-M2',
      bracket: 'winners',
      round: 1,
      position: 2,
      status: 'scheduled',
      format: 'BO3',
      slots: [
        { kind: 'entrant', entrantId: 'Atlético Sur' },
        { kind: 'entrant', entrantId: 'Club Cometa' },
      ],
    },
    {
      matchId: 'WB-R2-M1',
      bracket: 'winners',
      round: 2,
      position: 1,
      status: 'scheduled',
      format: 'BO5',
      slots: [
        { kind: 'winner-of', matchId: 'WB-R1-M1' },
        { kind: 'winner-of', matchId: 'WB-R1-M2' },
      ],
    },
    {
      matchId: 'LB-R1-M1',
      bracket: 'losers',
      round: 1,
      position: 1,
      status: 'scheduled',
      format: 'BO3',
      slots: [
        { kind: 'loser-of', matchId: 'WB-R1-M1' },
        { kind: 'loser-of', matchId: 'WB-R1-M2' },
      ],
    },
    {
      matchId: 'GF-R1-M1',
      bracket: 'grand-final',
      round: 1,
      position: 1,
      status: 'scheduled',
      format: 'BO5',
      slots: [
        { kind: 'winner-of', matchId: 'WB-R2-M1' },
        { kind: 'winner-of', matchId: 'LB-R1-M1' },
      ],
    },
  ],
  hasRecordedResults: false,
};

async function mockControlApi(
  page: Page,
  options: { readonly reseedBlocked?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ({ tournament, stage, layouts, projection, trace, seeding, reseedBlocked, tokenEndpoint }) => {
      // `addInitScript` re-runs on every navigation, including a reload, so a
      // plain closure variable would not survive one — sessionStorage does,
      // letting a GET after a reload reflect what the server would have
      // actually persisted rather than resetting to the page's
      // starting fixture.
      const STORAGE_KEY = 'e2e-current-seeding';
      const readCurrent = (): typeof seeding => {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        return stored ? (JSON.parse(stored) as typeof seeding) : seeding;
      };
      const writeCurrent = (next: typeof seeding): void => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      };

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        if (url === `${tournament}/tables`) return Response.json(layouts);
        if (url === `${stage}/tables/group-standings-default`) return Response.json(projection);
        if (url.startsWith(`${stage}/standings/entrants/`) && url.endsWith('/trace')) {
          const withoutTrace = url.slice(0, -'/trace'.length);
          const entrantId = decodeURIComponent(
            withoutTrace.slice(withoutTrace.lastIndexOf('/') + 1),
          );
          return Response.json(trace[entrantId] ?? { entrantId, lines: [] });
        }
        if (url === `${stage}/seeding` && method === 'GET') return Response.json(readCurrent());
        if (url === `${stage}/seeding` && method === 'POST') {
          if (reseedBlocked) {
            return Response.json(
              { message: 'Seeding cannot change once a result exists' },
              { status: 409 },
            );
          }
          const body = JSON.parse(String(init?.body)) as {
            readonly seeds: readonly { readonly seed: number; readonly entrantId: string }[];
          };
          writeCurrent({ ...readCurrent(), seeds: body.seeds });
          return Response.json({
            mutationClass: 'requires_rebuild',
            reason: 'Reseeding regenerates the fixture graph',
            invalidates: ['WB-R1-M1'],
            persisted: true,
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      tournament: TOURNAMENT,
      stage: STAGE,
      layouts: tableLayoutsFixture,
      projection: groupStandingsProjectionFixture,
      trace: traceByEntrant,
      seeding: seedingFixture,
      reseedBlocked: options.reseedBlocked ?? false,
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

test('expands a tied standings row and shows the engine’s trace', async ({ page }) => {
  await mockControlApi(page);

  const target = '/control/liga-mendocina/tournaments/apertura-2026/stages/1/standings';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('Proyección v12')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Deportivo Norte' }).click();

  const trace = page.getByLabel('Traza de desempate');
  await expect(trace).toBeVisible();
  for (const line of traceByEntrant['Deportivo Norte'].lines) {
    await expect(trace.getByText(line, { exact: true })).toBeVisible();
  }

  // The row nobody had to break a tie for fetches its own real (empty) trace
  // — every row is a candidate to expand now, not only the ones a
  // precomputed flag marked in advance.
  await page.locator('summary').filter({ hasText: 'Club Cometa' }).click();
  await expect(page.getByText('El motor no registró comparadores.')).toBeVisible();
});

test('keeps locked seeds through a randomize', async ({ page }) => {
  await mockControlApi(page);

  const target = '/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const seedList = page.getByRole('list', { name: 'Orden de siembra' });
  await page.getByRole('button', { name: 'Fijar siembra 1' }).click();
  await page.getByRole('button', { name: 'Fijar siembra 2' }).click();
  await page.getByRole('button', { name: 'Sortear no fijados' }).click();

  await expect(seedList.getByRole('listitem').nth(0)).toContainText('Deportivo Norte');
  await expect(seedList.getByRole('listitem').nth(1)).toContainText('Atlético Sur');
});

test('renders both halves of a double-elimination bracket with named placeholders', async ({
  page,
}) => {
  await mockControlApi(page);

  const target = '/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const canvas = page.getByLabel('Llave');
  await expect(canvas.locator('[data-bracket="winners"]')).toHaveCount(3);
  await expect(canvas.locator('[data-bracket="losers"]')).toHaveCount(1);
  await expect(canvas.locator('[data-bracket="grand-final"]')).toHaveCount(1);

  // A slot nobody has qualified for names what has to happen first.
  await expect(canvas.getByText('TBD · Perdedor del WB-R1-M1')).toBeVisible();
  await expect(canvas.getByText('TBD · Ganador del LB-R1-M1')).toBeVisible();
  await expect(canvas.getByText('BO5').first()).toBeVisible();
});

test('a published seed order survives a page reload', async ({ page }) => {
  await mockControlApi(page);

  const target = '/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const seedList = page.getByRole('list', { name: 'Orden de siembra' });
  await expect(async () => {
    await page.getByRole('button', { name: 'Sortear no fijados' }).click();
    await expect(page.getByRole('button', { name: 'Publicar sembrado' })).toBeEnabled({
      timeout: 500,
    });
  }).toPass();

  const shuffled = await seedList.getByRole('listitem').allTextContents();

  await page.getByRole('button', { name: 'Publicar sembrado' }).click();
  await expect(page.getByRole('alert')).toContainText('sembrado guardado');

  await page.reload();
  // The session is in-memory only and a reload discards it, same as a
  // real browser refresh — log back in to return to this screen so the
  // assertion below is about the persisted seed order, not the session.
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(seedList.getByRole('listitem')).toHaveCount(shuffled.length);
  const afterReload = await seedList.getByRole('listitem').allTextContents();
  expect(afterReload).toEqual(shuffled);
});

test('shows the server’s refusal when a reseed lands after a result', async ({ page }) => {
  await mockControlApi(page, { reseedBlocked: true });

  const target = '/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('button', { name: 'Fijar siembra 1' }).click();
  // A shuffle may legitimately return the order it started from, and the
  // publish button stays disabled until something actually changed.
  await expect(async () => {
    await page.getByRole('button', { name: 'Sortear no fijados' }).click();
    await expect(page.getByRole('button', { name: 'Publicar sembrado' })).toBeEnabled({
      timeout: 500,
    });
  }).toPass();
  await page.getByRole('button', { name: 'Publicar sembrado' }).click();

  await expect(page.getByRole('alert')).toContainText('Seeding cannot change once a result exists');
});
