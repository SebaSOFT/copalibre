import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * An operator advances one zone of a seeded multi-zone Swiss stage from the stage hub: the action
 * exists only for zones playing a dynamic format, names the zone, and sends exactly that zone's
 * number to the API. The API is stubbed at `window.fetch`, as the other control-panel specs do.
 */

const ORG = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `${TOURNAMENT}/stages/1`;
const TARGET = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1`;

async function mockControlApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tournament, stage, tokenEndpoint }) => {
      const stageRecord = {
        stageId: 'stage-1',
        seasonId: 'season-1',
        number: 1,
        name: 'Fase suiza',
        format: 'swiss',
        seeded: true,
      };
      const zone = (number: number, name: string, effectiveFormat: string) => ({
        zoneId: `zone-${number}`,
        stageId: 'stage-1',
        number,
        name,
        effectiveFormat,
      });
      const requests: unknown[] = [];
      (window as unknown as { __roundRequests: unknown[] }).__roundRequests = requests;

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${tournament}/stages` && method === 'GET') return Response.json([stageRecord]);
        if (url === `${stage}/zones` && method === 'GET') {
          return Response.json([
            zone(1, 'Zona A', 'swiss'),
            zone(2, 'Zona B', 'round-robin'),
            zone(3, 'Zona C', 'swiss'),
          ]);
        }
        if (url === `${stage}/rounds/next` && method === 'POST') {
          requests.push(JSON.parse(String(init?.body)));
          return Response.json({ stageId: 'stage-1', fixtures: [] });
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tournament: TOURNAMENT, stage: STAGE, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('generates the next round for one zone of a seeded multi-zone stage', async ({ page }) => {
  await mockControlApi(page);
  await seedLoginTransaction(page, TARGET);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${TARGET}`);

  await expect(page.getByRole('heading', { name: 'Rondas' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Generar la próxima ronda de Zona A' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Generar la próxima ronda de Zona C' }),
  ).toBeVisible();
  // A round-robin zone has no rounds to derive.
  await expect(page.getByRole('button', { name: /Zona B/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Generar la próxima ronda de Zona C' }).click();

  await expect(page.getByText('Próxima ronda generada para Zona C.')).toBeVisible();
  const sent = await page.evaluate(
    () => (window as unknown as { __roundRequests: unknown[] }).__roundRequests,
  );
  expect(sent).toEqual([{ zoneNumber: 3 }]);
});
