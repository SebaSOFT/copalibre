import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Selecting a language through the Select atom's styled popover, not the
 * hidden native `<select>` — proves the pointer-interception fix actually
 * opens `.cl-select__content` for a real click (openspec 0295, task 3.1).
 */

const ORG_ALIAS = 'liga-mendocina';

async function setupMockApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint, orgAlias }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === '/organizations?mine=true' && method === 'GET') {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias: orgAlias,
              organizationName: 'Liga Mendocina',
              role: 'admin',
            },
          ]);
        }
        if (url === `/organizations/${orgAlias}/tournaments` && method === 'GET') {
          return Response.json([]);
        }
        if (url.includes(`/organizations/${orgAlias}/audit-trail`) && method === 'GET') {
          return Response.json({ records: [], total: 0, limit: 10, offset: 0 });
        }
        if (url === `/events/control/${orgAlias}`) {
          return new Response('', { status: 403 });
        }
        return Response.json([]);
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, orgAlias: ORG_ALIAS },
  );
}

test('3.1: clicking the trigger opens the styled popover and switches the shell language', async ({
  page,
}) => {
  await setupMockApi(page);
  const target = `/control/${ORG_ALIAS}`;
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  // The browser's Accept-Language picks Spanish as the shell's default.
  await expect(page.getByText('Torneos activos')).toBeVisible();

  const trigger = page.locator('button.cl-select');
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText('Español');
  await expect(trigger).toContainText('ES');

  // The native <select> shim sits off-screen; the click must land on the
  // visible, styled trigger and open `.cl-select__content`, not the
  // browser's own native picker.
  await trigger.click();
  const option = page.getByRole('option', { name: 'Français' });
  await expect(option).toBeVisible();
  await option.click();
  await expect(option).toBeHidden();

  await expect(trigger).toContainText('Français');
  await expect(trigger).toContainText('FR');
  await expect(page.getByText('Tournois actifs')).toBeVisible();
});
