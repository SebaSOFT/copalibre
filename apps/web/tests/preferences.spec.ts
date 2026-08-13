import { expect, test, type Page } from '@playwright/test';
import {
  loginCallbackUrl,
  seedLoginTransaction,
  TOKEN_ENDPOINT,
} from '../../../e2e/support/control-login.js';

async function mockPreferencesApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      let tokens = [
        {
          tokenId: 'token-1',
          label: 'E2E Test Token',
          scopes: ['api'],
          revoked: false,
          expiresAt: '2099-01-01T00:00:00.000Z',
          createdAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        // Mock the PAT API under /api
        if (url.includes('/auth/pat') && method === 'GET') {
          return Response.json(tokens);
        }

        if (url.includes('/auth/pat') && method === 'POST') {
          const body = JSON.parse(String(init?.body));
          const newToken = {
            tokenId: 'token-2',
            label: body.label,
            scopes: ['api'],
            revoked: false,
            expiresAt: '2099-01-01T00:00:00.000Z',
            createdAt: '2023-01-01T00:00:00.000Z',
            token: 'cl_pat_123456789',
          };
          tokens.push(newToken);
          return Response.json(newToken, { status: 201 });
        }

        if (url.includes('/auth/pat/') && method === 'DELETE') {
          const id = url.split('/').pop();
          tokens = tokens.map((t) => (t.tokenId === id ? { ...t, revoked: true } : t));
          return new Response(null, { status: 204 });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    { patPath, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('user can generate and revoke PAT', async ({ page }) => {
  await mockPreferencesApi(page);
  const target = '/control/liga-mendocina/preferences';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // Verify existing token is rendered
  await expect(page.getByText('E2E Test Token')).toBeVisible();

  // Create a new token
  await page.getByLabel('Token Label').fill('New CI Token');
  await page.getByRole('button', { name: 'Generate Token' }).click();

  // Check it shows the token value
  await expect(page.getByText('Token created. Copy it now:')).toBeVisible();
  await expect(page.getByText('cl_pat_123456789')).toBeVisible();

  // Verify it was added to the list
  await expect(page.getByText('New CI Token')).toBeVisible();

  // Revoke the original token
  // Using a simpler approach since there's multiple Revoke buttons now
  await page
    .locator('li')
    .filter({ hasText: 'E2E Test Token' })
    .getByRole('button', { name: 'Revoke' })
    .click();

  // E2E Test Token should be gone
  await expect(page.getByText('E2E Test Token')).toBeHidden();
});
