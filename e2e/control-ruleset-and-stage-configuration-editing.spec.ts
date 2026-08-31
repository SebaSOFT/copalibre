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
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/ruleset-overrides') && method === 'GET') {
      return { body: { overrides: { 'scoring.pointsPerWin': pointsPerWin } } };
    }
    if (url.endsWith('/ruleset-overrides') && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as {
        overrides: Record<string, unknown>;
      };
      if (typeof body.overrides['scoring.pointsPerWin'] === 'number') {
        pointsPerWin = body.overrides['scoring.pointsPerWin'];
      }
      return { body: { overrides: { 'scoring.pointsPerWin': pointsPerWin } } };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/ruleset`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByLabel('scoring.pointsPerWin')).toBeVisible();
  await page.getByLabel('scoring.pointsPerWin').fill('4');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByText('Configuración guardada.')).toBeVisible();
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
          matches: seeded
            ? [
                {
                  matchId: 'm-1',
                  bracket: 'main',
                  round: 1,
                  position: 1,
                  status: 'scheduled',
                  slots: [],
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
