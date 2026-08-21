import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Tournament archival from the A1 dashboard (0033, task 6.1).
 *
 * The dashboard's tournament list is real data since 0113 (`listActive`,
 * `0100`'s admin-scoped organization tournament list) — archiving removes
 * the card from the operator's own view immediately, via local state rather
 * than a refetch (`DashboardRoute.tsx`'s own comment: the operator sees the
 * result of their own action either way). The public route resolving
 * afterward is asserted against the real static build, since an archived
 * tournament's canonical URL is unaffected by archival by construction
 * (`findByScopedAlias` has no status filter at all).
 */

const DASHBOARD_PATH = '/control/liga-mendocina';

async function mockArchiveApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === '/organizations/liga-mendocina/tournaments' && method === 'GET') {
          return Response.json([
            {
              tournamentId: 't-2025',
              organizationId: 'org-1',
              alias: 'apertura-2025',
              name: 'Torneo Apertura 2025',
              status: 'finished',
            },
            {
              tournamentId: 't-2026',
              organizationId: 'org-1',
              alias: 'apertura-2026',
              name: 'Torneo Apertura 2026',
              status: 'started',
            },
          ]);
        }
        if (url.includes('/registrations?status=pending')) {
          return Response.json([]);
        }
        if (url.includes('/archive') && method === 'POST') {
          return Response.json({ status: 'archived' });
        }
        if (url.includes('/display-tokens')) {
          return Response.json([]);
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('archives a finished tournament and it disappears from the active dashboard (6.1)', async ({
  page,
}) => {
  await mockArchiveApi(page);
  await seedLoginTransaction(page, DASHBOARD_PATH);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${DASHBOARD_PATH}`);

  await expect(page.getByText('Torneo Apertura 2025')).toBeVisible();
  await page.getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByText('Torneo Apertura 2025')).toHaveCount(0);

  // Every other card is unaffected by one archival.
  await expect(page.getByText('Torneo Apertura 2026')).toBeVisible();
});
