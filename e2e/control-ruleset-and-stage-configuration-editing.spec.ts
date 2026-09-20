import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Ruleset and stage-configuration editing (openspec 0169): a tournament's
 * ruleset override fields are editable and mutation-classified from the
 * dedicated ruleset screen; a blocked field is refused in the UI before any
 * save request is sent; a stage's own configuration override is editable
 * until it is seeded, then the edit action names why it is locked.
 */

const ORG_ALIAS = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';

async function withTokenEndpoint(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        const handler = (window as unknown as { __route?: (u: string, i?: RequestInit) => unknown })
          .__route;
        const handled = handler ? await handler(url, init) : undefined;
        if (handled !== undefined)
          return Response.json((handled as { body: unknown }).body, {
            status: (handled as { status?: number }).status ?? 200,
          });
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('edits a ruleset override from the tournament ruleset screen and sees the change immediately', async ({
  page,
}) => {
  await withTokenEndpoint(page);
  let pointsPerWin = 3;
  const fieldPolicies = {
    'scoring.pointsPerWin': {
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
      label: 'Points per win',
    },
  };
  const disciplineDefaults = { scoring: { pointsPerWin: 2 } };
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/ruleset-overrides') && method === 'GET') {
      return {
        body: {
          overrides: { 'scoring.pointsPerWin': pointsPerWin },
          fieldPolicies,
          disciplineDefaults,
        },
      };
    }
    if (url.endsWith('/ruleset-overrides') && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as {
        overrides: Record<string, unknown>;
      };
      if (typeof body.overrides['scoring.pointsPerWin'] === 'number') {
        pointsPerWin = body.overrides['scoring.pointsPerWin'];
      }
      return {
        body: {
          overrides: { 'scoring.pointsPerWin': pointsPerWin },
          fieldPolicies,
          disciplineDefaults,
        },
      };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/ruleset`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // The plain-language rule context (openspec 0263) shows alongside the
  // existing edit field, reflecting the tournament's current override.
  await expect(page.getByText('Reglas')).toBeVisible();
  // Shown twice now: the read-only summary's label, and the editor field's own label.
  await expect(page.getByText('Points per win').first()).toBeVisible();
  await expect(page.getByText('Valor actual: 3')).toBeVisible();

  await expect(page.getByLabel('Points per win')).toBeVisible();
  await page.getByLabel('Points per win').fill('4');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByText('Configuración guardada.')).toBeVisible();
});

test('renders typed controls for boolean/format/union-list fields, saves only the union-list delta, and updates the plain-language summary (openspec 0264)', async ({
  page,
}) => {
  await withTokenEndpoint(page);
  let overrides: Record<string, unknown> = {
    format: 'round-robin',
    'venuePolicy.neutralGround': false,
    tiebreakers: [],
  };
  const fieldPolicies = {
    format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
    'venuePolicy.neutralGround': {
      permission: { kind: 'replaced' },
      mutationClass: 'safe',
      label: 'Neutral ground required',
    },
    tiebreakers: {
      permission: { kind: 'merged', strategy: 'union-list' },
      mutationClass: 'requires_rebuild',
      label: 'Tiebreakers',
    },
  };
  const disciplineDefaults = { tiebreakers: ['points', 'score-difference'] };
  let lastPutOverrides: Record<string, unknown> | undefined;
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/ruleset-overrides') && method === 'GET') {
      return { body: { overrides, fieldPolicies, disciplineDefaults } };
    }
    if (url.endsWith('/ruleset-overrides') && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as { overrides: Record<string, unknown> };
      lastPutOverrides = body.overrides;
      overrides = { ...overrides, ...body.overrides };
      return { body: { overrides, fieldPolicies, disciplineDefaults } };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/ruleset`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // A boolean field is a real checkbox, never a JSON-text input.
  await expect(page.getByRole('checkbox').first()).toBeVisible();
  // A union-list field's "current value" already shows the inherited items.
  await expect(page.getByText('Valor actual: points, score-difference')).toBeVisible();

  // Adding one tiebreaker sends only that addition, not the inherited list.
  const tiebreakersRow = page.getByRole('listitem').filter({ hasText: 'Tiebreakers' });
  await tiebreakersRow.getByLabel('Tiebreakers').fill('goals-against');
  await tiebreakersRow.getByRole('button', { name: 'Agregar' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  // The plain-language summary now reflects the real merged effective value.
  await expect(
    page.getByText('Valor actual: points, score-difference, goals-against'),
  ).toBeVisible();
  expect(lastPutOverrides).toEqual({ tiebreakers: ['goals-against'] });
});

test('refuses a blocked ruleset-override edit before the save request is sent', async ({
  page,
}) => {
  await withTokenEndpoint(page);
  let updateCalled = false;
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/ruleset-overrides') && method === 'GET') {
      return { body: { overrides: { 'scoring.pointsPerWin': 3 } } };
    }
    if (url.endsWith('/ruleset-overrides/preview') && method === 'POST') {
      return {
        body: {
          fields: [
            {
              field: 'scoring.pointsPerWin',
              blocked: true,
              reason:
                'Field "scoring.pointsPerWin" is blocked after results; use the audited correction workflow',
            },
          ],
        },
      };
    }
    if (url.endsWith('/ruleset-overrides') && method === 'PUT') {
      updateCalled = true;
      return { body: { overrides: { 'scoring.pointsPerWin': 5 } } };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/ruleset`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('scoring.pointsPerWin').fill('5');
  await page.getByRole('button', { name: 'Vista previa' }).click();

  await expect(page.getByText(/audited correction workflow/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  expect(updateCalled).toBe(false);
});

test("edits a stage's configuration override before seeding, then finds it locked once seeded", async ({
  page,
}) => {
  await withTokenEndpoint(page);
  let seeded = false;
  let overtimeEnabled = false;
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/stages/1/seeding') && method === 'GET') {
      return {
        body: {
          stageId: 'stage-1',
          format: 'round-robin',
          seeds: [],
          zones: seeded
            ? [
                {
                  matches: [
                    {
                      matchId: 'm-1',
                      bracket: 'main',
                      round: 1,
                      position: 1,
                      status: 'scheduled',
                      slots: [],
                    },
                  ],
                },
              ]
            : [],
          hasRecordedResults: false,
        },
      };
    }
    if (url.endsWith('/stages/1/configuration') && method === 'GET') {
      return { body: { overrides: { segments: { overtimeEnabled } } } };
    }
    if (url.endsWith('/stages/1/configuration') && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as { overrides: Record<string, unknown> };
      const nextSegments = body.overrides['segments'] as { overtimeEnabled?: boolean } | undefined;
      if (nextSegments?.overtimeEnabled !== undefined)
        overtimeEnabled = nextSegments.overtimeEnabled;
      seeded = true;
      return { body: { overrides: { segments: { overtimeEnabled } } } };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/stages/1/seeding`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByLabel('segments')).toBeVisible();
  await page.getByLabel('segments').fill('{"overtimeEnabled":true}');
  await page.getByRole('button', { name: 'Aplicar' }).click();

  // The session is in-memory only and a reload discards it, same as a real
  // browser refresh — log back in to return to this screen so the assertion
  // below is about the server's now-seeded state, not the session.
  await expect(async () => {
    await page.reload();
    await seedLoginTransaction(page, target);
    await page.goto(loginCallbackUrl(), { timeout: 5000 }).catch((error: Error) => {
      if (!error.message.includes('is interrupted by another navigation')) throw error;
    });
    await page.waitForURL(`**${target}`, { timeout: 5000 });
  }).toPass();

  await expect(page.getByLabel('segments')).toBeDisabled();
  await expect(
    page.getByText(
      'Esta fase ya tiene partidos generados, por lo que su configuración está bloqueada.',
    ),
  ).toBeVisible();
});
