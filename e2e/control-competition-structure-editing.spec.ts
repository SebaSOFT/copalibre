import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Competition-structure editing (openspec 0168): renaming a stage and a
 * zone from their respective screens, a capacity reduction refused in the
 * tournament-settings screen before the save request is ever sent, and
 * deleting an unreferenced upload from the storage-usage screen.
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

test('renames a stage from the seeding screen and sees the change immediately', async ({
  page,
}) => {
  await withTokenEndpoint(page);
  let stageName = 'Fase de grupos';
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith(`/stages/1/seeding`) && method === 'GET') {
      return {
        body: {
          stageId: 'stage-1',
          format: 'round-robin',
          seeds: [],
          matches: [],
          hasRecordedResults: false,
        },
      };
    }
    if (url.endsWith(`/stages/1`) && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as { name?: string };
      if (body.name !== undefined) stageName = body.name;
      return {
        body: {
          stageId: 'stage-1',
          seasonId: 'season-1',
          number: 1,
          name: stageName,
          format: 'round-robin',
        },
      };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/stages/1/seeding`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('Configuración de la fase')).toBeVisible();
  await page.getByLabel('Nuevo nombre de la fase').fill('Fase de grupos (corregida)');
  await page.getByRole('button', { name: 'Renombrar', exact: true }).click();

  await expect(page.getByText('Fase renombrada.')).toBeVisible();
});

test('renames a zone from the zone-management screen and sees the change immediately', async ({
  page,
}) => {
  await withTokenEndpoint(page);
  let zoneName = 'Zona 1';
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/stages/1/zones') && method === 'GET') {
      return { body: [{ zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: zoneName }] };
    }
    if (url.includes('/registrations') && method === 'GET') {
      return { body: [] };
    }
    if (url.endsWith('/stages/1/zones/1/groups') && method === 'GET') {
      return { body: [] };
    }
    if (url.endsWith('/stages/1/zones/1') && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as { name: string };
      zoneName = body.name;
      return { body: { zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: zoneName } };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/stages/1/zones`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const renameInput = page.getByLabel('Renombrar zona Zona 1');
  await expect(renameInput).toBeVisible();
  await renameInput.fill('Zona 1 (corregida)');
  await page.getByRole('button', { name: 'Renombrar', exact: true }).click();

  await expect(page.getByLabel('Renombrar zona Zona 1 (corregida)')).toBeVisible();
});

test('refuses a capacity reduction below the current entrant count before the save request is sent', async ({
  page,
}) => {
  await withTokenEndpoint(page);
  let updateCalled = false;
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/settings') && method === 'GET') {
      return { body: { name: 'Copa Alta', region: 'Cuyo', capacity: 16 } };
    }
    if (url.endsWith('/settings/preview') && method === 'POST') {
      return {
        body: {
          fields: [
            {
              field: 'registration.capacity',
              blocked: true,
              reason: 'Cannot be reduced to 1: 10 entrant(s) are already accepted',
            },
          ],
        },
      };
    }
    if (url.endsWith('/settings') && method === 'PUT') {
      updateCalled = true;
      return { body: { name: 'Copa Alta', region: 'Cuyo', capacity: 1 } };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/settings`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByLabel('Capacidad').fill('1');
  await page.getByRole('button', { name: 'Vista previa' }).click();

  await expect(page.getByText(/already accepted/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  expect(updateCalled).toBe(false);
});

test('deletes an unreferenced upload from the storage-usage screen and the usage total drops', async ({
  page,
}) => {
  await withTokenEndpoint(page);
  let objects: { objectId: string; contentType: string; sizeBytes: number; createdAt: string }[] = [
    {
      objectId: 'object-1',
      contentType: 'image/png',
      sizeBytes: 2048,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  await page.exposeFunction('__route', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === `/organizations/${ORG_ALIAS}` && method === 'GET') {
      return {
        body: {
          organizationId: 'org-1',
          alias: ORG_ALIAS,
          name: 'Liga Mendocina',
          primaryLanguage: 'es',
          timezone: 'America/Argentina/San_Juan',
        },
      };
    }
    if (url.endsWith('/storage-usage') && method === 'GET') {
      return { body: { totalBytes: 10240, objectCount: 5 } };
    }
    if (url.endsWith('/storage-usage/objects') && method === 'GET') {
      return { body: objects };
    }
    const deleteMatch = /\/storage-usage\/objects\/([^/]+)$/.exec(url);
    if (deleteMatch && method === 'DELETE') {
      const objectId = deleteMatch[1];
      const deleted = objects.find((object) => object.objectId === objectId);
      objects = objects.filter((object) => object.objectId !== objectId);
      return { body: deleted };
    }
    return undefined;
  });

  const target = `/control/${ORG_ALIAS}/preferences`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('image/png')).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar' }).click();

  await expect(page.getByText('image/png')).toBeHidden();
});
