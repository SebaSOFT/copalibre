import { expect, test } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * 0111: an entrant that collided on every derived abbreviation candidate
 * (0100) is invisible in control-web today — this screen surfaces it and
 * lets an officer resolve it through the existing per-entrant write path.
 */

const ENTRANT_ID = 'entrant-1';

let abbreviation: string | undefined;

function needingAbbreviationResponse(): unknown {
  if (abbreviation !== undefined) return [];
  return [
    {
      entrantId: ENTRANT_ID,
      tournamentId: 't-1',
      status: 'accepted',
      teamId: 'club-atletico-talleres',
    },
  ];
}

async function mockRegistrationApi(page: import('@playwright/test').Page): Promise<void> {
  abbreviation = undefined;
  await page.addInitScript(
    ({ tokenEndpoint, entrantId }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.endsWith('/registrations')) return Response.json([]);
        if (url.endsWith('/entrants/needing-abbreviation')) {
          const rows = await (
            window as unknown as { __needingAbbreviation: () => Promise<unknown> }
          ).__needingAbbreviation();
          return Response.json(rows);
        }
        if (url.endsWith(`/entrants/${entrantId}/abbreviation`) && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { abbreviation: string };
          const result = await (
            window as unknown as {
              __setAbbreviation: (value: string) => Promise<{ status: number; body: unknown }>;
            }
          ).__setAbbreviation(body.abbreviation);
          return new Response(JSON.stringify(result.body), { status: result.status });
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, entrantId: ENTRANT_ID },
  );

  await page.exposeFunction('__needingAbbreviation', needingAbbreviationResponse);
  await page.exposeFunction('__setAbbreviation', (value: string) => {
    if (value === 'IND') {
      return {
        status: 409,
        body: {
          message: 'Abbreviation "IND" is already used by another entrant in this tournament',
        },
      };
    }
    abbreviation = value;
    return {
      status: 200,
      body: { entrantId: ENTRANT_ID, tournamentId: 't-1', status: 'accepted', abbreviation: value },
    };
  });
}

test('sets a free abbreviation for a collided entrant and it disappears from the list on reload', async ({
  page,
}) => {
  await mockRegistrationApi(page);
  const target = '/control/liga-mendocina/tournaments/apertura-2026/registrations';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('club-atletico-talleres')).toBeVisible();

  await page.getByLabel('Abreviatura para club-atletico-talleres').fill('IND');
  await page.getByRole('button', { name: 'Asignar' }).click();
  await expect(
    page.getByText('Abbreviation "IND" is already used by another entrant in this tournament'),
  ).toBeVisible();
  await expect(page.getByText('club-atletico-talleres')).toBeVisible();

  await page.getByLabel('Abreviatura para club-atletico-talleres').fill('TAL');
  await page.getByRole('button', { name: 'Asignar' }).click();
  await expect(page.getByText('Todos los entrantes ya tienen una abreviatura.')).toBeVisible();

  // The session is in-memory only and a reload discards it, same as a real
  // browser refresh — log back in to return to this screen so the assertion
  // below is about the persisted resolution, not the session. The reload
  // races the app's own redirect-to-login against this re-login navigation
  // (same race `control-standings-seeding.spec.ts`'s reload test carries);
  // retrying the whole sequence absorbs it.
  await expect(async () => {
    await page.reload();
    await seedLoginTransaction(page, target);
    await page.goto(loginCallbackUrl(), { timeout: 5000 }).catch((error: Error) => {
      if (!error.message.includes('is interrupted by another navigation')) throw error;
    });
    await page.waitForURL(`**${target}`, { timeout: 5000 });
  }).toPass({ timeout: 30000 });

  await expect(page.getByText('Todos los entrantes ya tienen una abreviatura.')).toBeVisible();
  await expect(page.getByText('club-atletico-talleres')).toHaveCount(0);
});
