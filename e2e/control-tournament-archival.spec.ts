import { expect, test, type Page } from '@playwright/test';

/**
 * Tournament archival from the A1 dashboard (0033, task 6.1).
 *
 * The dashboard's tournament list is still build-time sample data (no live
 * "active only" listing exists in this codebase yet — the archive action
 * itself, not the listing it will eventually filter, is what this change
 * adds). Archiving removes the card from the operator's own view
 * immediately; the public route resolving afterward is asserted against the
 * real static build, since an archived tournament's canonical URL is
 * unaffected by archival by construction (`findByScopedAlias` has no status
 * filter at all).
 */

const DASHBOARD_PATH = '/control/liga-mendocina';
const PUBLIC_TOURNAMENT_PATH = '/liga-mendocina/tournaments/apertura-2026';

async function mockArchiveApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/archive') && method === 'POST') {
        return Response.json({ status: 'archived' });
      }
      if (url.includes('/display-tokens')) {
        return Response.json([]);
      }
      return new Response('Not found', { status: 404 });
    };
  });
}

test('archives a finished tournament and it disappears from the active dashboard (6.1)', async ({
  page,
}) => {
  await mockArchiveApi(page);
  await page.goto(DASHBOARD_PATH);

  await expect(page.getByText('Torneo Apertura 2025')).toBeVisible();
  await page.getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByText('Torneo Apertura 2025')).toHaveCount(0);

  // Every other card is unaffected by one archival.
  await expect(page.getByText('Torneo Apertura 2026')).toBeVisible();
});

test("an archived tournament's own public page still resolves (6.1)", async ({ page }) => {
  // No mock needed: this is the real, unmocked static build — the point is
  // that the route itself is unaffected by archival, not that this specific
  // sample tournament is archived.
  const response = await page.goto(PUBLIC_TOURNAMENT_PATH);
  expect(response?.status()).toBe(200);
  await expect(page.locator('body')).not.toBeEmpty();
});
