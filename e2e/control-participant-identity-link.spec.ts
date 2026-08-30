import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Participant identity link correction (openspec 0170): a person pre-linked
 * to the wrong email is unlinked, then re-linked to the correct one, with the
 * registration-review screen reflecting the final state throughout.
 */

const ORG_ALIAS = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const PERSON_ID = 'person-1';

async function mockRegistrationApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint, personId }) => {
      let hasIdentityLink = false;
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.endsWith('/registrations') && method === 'GET') {
          return Response.json([
            {
              entrantId: 'entrant-1',
              tournamentId: 't-1',
              status: 'pending',
              personId,
              displayName: 'Persona a Corregir',
              hasIdentityLink,
            },
          ]);
        }
        if (url.endsWith(`/participants/${personId}/identity-link`) && method === 'POST') {
          hasIdentityLink = true;
          return Response.json({ principalId: 'principal-1', personId }, { status: 201 });
        }
        if (url.endsWith(`/participants/${personId}/identity-link`) && method === 'DELETE') {
          hasIdentityLink = false;
          return Response.json({ principalId: 'principal-1', personId });
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, personId: PERSON_ID },
  );
}

test('pre-links a participant to the wrong email, unlinks, then re-links to the correct one', async ({
  page,
}) => {
  await mockRegistrationApi(page);
  const target = `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/registrations`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByText('Persona a Corregir').click();
  await page.getByText('Vincular identidad').click();
  const linkDialog = page.getByRole('dialog');
  await expect(linkDialog).toBeVisible();
  await linkDialog.getByLabel('Correo electrónico').fill('incorrecto@example.test');
  await linkDialog.getByRole('button', { name: 'Vincular' }).click();
  await expect(linkDialog).toBeHidden();

  await expect(page.getByRole('button', { name: 'Desvincular' })).toBeVisible();
  await page.getByRole('button', { name: 'Desvincular' }).click();
  await expect(page.getByText('Vincular identidad')).toBeVisible();

  await page.getByText('Vincular identidad').click();
  const relinkDialog = page.getByRole('dialog');
  await expect(relinkDialog).toBeVisible();
  await relinkDialog.getByLabel('Correo electrónico').fill('correcto@example.test');
  await relinkDialog.getByRole('button', { name: 'Vincular' }).click();
  await expect(relinkDialog).toBeHidden();

  await expect(page.getByRole('button', { name: 'Desvincular' })).toBeVisible();
});
