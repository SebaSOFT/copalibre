import { expect, test } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * 0093 task 7.1: set a person's nationality from the registration review
 * screen and see the flag appear in the list, then open their profile and
 * see the placeholder before any photo has been uploaded.
 */

const PERSON_ID = 'person-1';

let nationality: string | undefined;

function registrationsResponse(): unknown {
  return [
    {
      entrantId: 'entrant-1',
      tournamentId: 't-1',
      status: 'pending',
      personId: PERSON_ID,
      displayName: 'Elías Salomón',
      ...(nationality === undefined ? {} : { nationality }),
    },
  ];
}

async function mockRegistrationApi(page: import('@playwright/test').Page): Promise<void> {
  nationality = undefined;
  await page.addInitScript(
    ({ tokenEndpoint, personId }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.endsWith('/registrations')) {
          const registrations = await (
            window as unknown as { __registrations: () => Promise<unknown> }
          ).__registrations();
          return Response.json(registrations);
        }
        if (url.endsWith(`/persons/${personId}/nationality`) && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { nationality: string | null };
          await (
            window as unknown as { __setNationality: (value: string | null) => Promise<void> }
          ).__setNationality(body.nationality);
          return Response.json({ personId, nationality: body.nationality });
        }
        if (url.endsWith(`/persons/${personId}`) && (init?.method ?? 'GET') === 'GET') {
          const profile = await (
            window as unknown as { __personProfile: () => Promise<unknown> }
          ).__personProfile();
          return Response.json(profile);
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, personId: PERSON_ID },
  );

  await page.exposeFunction('__registrations', registrationsResponse);
  await page.exposeFunction('__setNationality', (value: string | null) => {
    nationality = value ?? undefined;
  });
  await page.exposeFunction('__personProfile', () => ({
    personId: PERSON_ID,
    displayName: 'Elías Salomón',
    ...(nationality === undefined ? {} : { nationality }),
  }));
}

test('sets a nationality and sees the flag, then sees a placeholder photo on the profile', async ({
  page,
}) => {
  await mockRegistrationApi(page);
  const target = '/control/liga-mendocina/tournaments/apertura-2026/registrations';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByText('Elías Salomón').click();
  await page.getByLabel('País').fill('Argent');
  await page.getByRole('option', { name: /Argentina/ }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByRole('option', { name: 'Argentina' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.getByRole('link', { name: 'Ver perfil' }).click();
  await page.waitForURL('**/control/liga-mendocina/persons/person-1');

  await expect(page.getByRole('img', { name: 'Sin foto cargada' })).toBeVisible();
});
