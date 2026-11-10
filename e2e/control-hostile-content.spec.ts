import { expect, test } from './csp-guard.js';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Names an organizer or a participant typed reach Control as data. Each one
 * here carries markup that would run script if any screen wrote it as HTML;
 * Control must show it as text, run none of it, and report no blocked
 * script under the enforced Content Security Policy.
 */

const ORG_ALIAS = 'liga-mendocina';
const HOSTILE_CLUB = 'Casa de Italia <img src=x onerror="window.__hostileRan=1">';
const HOSTILE_ORGANIZATION = 'Liga <svg onload="window.__hostileRan=1"></svg>';
const HOSTILE_ABBREVIATION = '<b>CDI</b>';

test('Control shows hostile club and organization names as text and runs none of them', async ({
  page,
}) => {
  await page.addInitScript(
    ({ tokenEndpoint, orgAlias, club, organization, abbreviation }) => {
      (window as unknown as { __hostileRan?: number }).__hostileRan = 0;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (method !== 'GET') return originalFetch(input, init);
        if (url === '/api/organizations?mine=true') {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias: orgAlias,
              organizationName: organization,
              role: 'admin',
            },
          ]);
        }
        if (url === '/api/auth/pat/scopes') return Response.json({ scopes: [] });
        if (url === '/api/auth/pat') return Response.json([]);
        if (url.startsWith(`/api/organizations/${orgAlias}/storage-usage`)) {
          return Response.json(url.endsWith('/objects') ? [] : { totalBytes: 0, objectCount: 0 });
        }
        if (url === `/api/organizations/${orgAlias}`) {
          return Response.json({
            organizationId: 'org-1',
            alias: orgAlias,
            name: organization,
            primaryLanguage: 'es',
            timezone: 'America/Argentina/San_Juan',
          });
        }
        if (url === `/api/organizations/${orgAlias}/clubs`) {
          return Response.json([
            {
              clubId: 'club-1',
              organizationId: 'org-1',
              name: club,
              alias: 'casa-de-italia',
              abbreviation,
            },
          ]);
        }
        return originalFetch(input, init);
      };
    },
    {
      tokenEndpoint: TOKEN_ENDPOINT,
      orgAlias: ORG_ALIAS,
      club: HOSTILE_CLUB,
      organization: HOSTILE_ORGANIZATION,
      abbreviation: HOSTILE_ABBREVIATION,
    },
  );
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  const clubsTarget = `/control/${ORG_ALIAS}/clubs`;
  await seedLoginTransaction(page, clubsTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${clubsTarget}`);

  await expect(page.getByText(HOSTILE_CLUB, { exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.locator('svg[onload]')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __hostileRan?: number }).__hostileRan),
  ).toBe(0);
  expect(dialogs).toEqual([]);
});
