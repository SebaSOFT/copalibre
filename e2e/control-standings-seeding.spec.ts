import { expect, test, type Page } from '@playwright/test';

/**
 * A5 and A6 in a real browser (0024).
 *
 * The API is stubbed at `window.fetch`, as the 0023 specs do: what these
 * assert is the screen — that a tied row opens its engine trace, that a locked
 * seed survives a randomize, that both halves of a double-elimination bracket
 * render with named placeholders, and that a refused reseed says so in the
 * server's own words.
 */

const STAGE = '/organizations/liga-mendocina/tournaments/apertura-2026/stages/1';

const standingsFixture = {
  stageId: 'stage-001',
  projectionVersion: 12,
  fullyResolved: true,
  rows: [
    {
      rank: 1,
      entrantId: 'Deportivo Norte',
      sharedRank: false,
      statistics: { played: 6, points: 13, 'goals-for': 28 },
      tieBroken: true,
    },
    {
      rank: 2,
      entrantId: 'Atlético Sur',
      sharedRank: false,
      statistics: { played: 6, points: 13, 'goals-for': 24 },
      tieBroken: true,
    },
    {
      rank: 3,
      entrantId: 'Club Cometa',
      sharedRank: false,
      statistics: { played: 6, points: 4, 'goals-for': 9 },
      tieBroken: false,
    },
  ],
  trace: ['Rule 1 (Puntos): Deportivo Norte=13, Atlético Sur=13 → sin resolver'],
};

const traceFixture = {
  entrantId: 'Deportivo Norte',
  lines: [
    'Rule 1 (Puntos): Deportivo Norte=13, Atlético Sur=13 → Tie not fully resolved by Puntos; proceed to next comparator',
    'Rule 2 (A favor): Deportivo Norte=28, Atlético Sur=24 → A favor resolved the tie',
  ],
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
    ({ stage, standings, trace, seeding, reseedBlocked }) => {
      // `addInitScript` re-runs on every navigation, including a reload, so a
      // plain closure variable would not survive one — sessionStorage does,
      // letting a GET after a reload reflect what the server would have
      // actually persisted (0040) rather than resetting to the page's
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

        if (url === `${stage}/standings`) return Response.json(standings);
        if (url.startsWith(`${stage}/standings/entrants/`)) return Response.json(trace);
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
      stage: STAGE,
      standings: standingsFixture,
      trace: traceFixture,
      seeding: seedingFixture,
      reseedBlocked: options.reseedBlocked ?? false,
    },
  );
}

test('expands a tied standings row and shows the engine’s trace', async ({ page }) => {
  await mockControlApi(page);

  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/stages/1/standings');

  await expect(page.getByText('Proyección v12')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Deportivo Norte' }).click();

  const trace = page.getByLabel('Traza de desempate');
  await expect(trace).toBeVisible();
  for (const line of traceFixture.lines) {
    await expect(trace.getByText(line, { exact: true })).toBeVisible();
  }

  // The row nobody had to break a tie for offers no trace at all.
  await page.locator('summary').filter({ hasText: 'Club Cometa' }).click();
  await expect(
    page.getByText('Ningún comparador de desempate intervino en esta posición.'),
  ).toBeVisible();
});

test('keeps locked seeds through a randomize', async ({ page }) => {
  await mockControlApi(page);

  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding');

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

  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding');

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

  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding');

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
  const afterReload = await seedList.getByRole('listitem').allTextContents();
  expect(afterReload).toEqual(shuffled);
});

test('shows the server’s refusal when a reseed lands after a result', async ({ page }) => {
  await mockControlApi(page, { reseedBlocked: true });

  await page.goto('/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding');

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
