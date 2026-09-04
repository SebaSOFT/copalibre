import { expect, test, type Page } from '@playwright/test';

async function mockTvApis(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.fetch = async (input) => {
      const url = String(input);
      if (url.includes('/live')) {
        return Response.json({
          matches: [
            {
              matchId: 'm-final-1',
              stageNumber: 1,
              matchNumber: 1,
              state: 'final',
              projectionVersion: 1,
              sides: [
                { entrantId: 'e1', name: 'Atlético Palmira', score: 3, state: 'final' },
                { entrantId: 'e2', name: 'Gutiérrez SC', score: 1, state: 'final' },
              ],
            },
          ],
          standingsVersion: 1,
          usingLastKnown: true,
        });
      }
      return Response.json([]);
    };
  });
}

test('bare TV URL renders and stays rendered without reload loop into about:blank', async ({
  page,
}) => {
  await mockTvApis(page);

  // Navigate to bare TV URL with no token
  await page.goto('/tv/liga-mendocina/tournaments/apertura-2026');

  // Assert page is not blank
  expect(page.url()).not.toBe('about:blank');
  expect(page.url()).toContain('/tv/liga-mendocina/tournaments/apertura-2026');

  // Assert broadcast scorebug and champion/match panel render
  const scorebug = page.locator('.tv-scorebug');
  await expect(scorebug).toBeVisible({ timeout: 10_000 });

  // Wait 3 seconds to verify it does not enter an infinite reload loop
  await page.waitForTimeout(3000);
  expect(page.url()).not.toBe('about:blank');
  await expect(scorebug).toBeVisible();
});

test('stale operator session does not redirect TV route to /control/login', async ({ page }) => {
  // Prepopulate sessionStorage with an expired session token
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'copalibre:session:v1',
      JSON.stringify({ token: 'expired-operator-token', expiresAtMs: Date.now() - 10_000 }),
    );
  });

  await mockTvApis(page);
  await page.goto('/tv/liga-mendocina/tournaments/apertura-2026');

  // Verify page stays on TV route and does NOT redirect to /control/login
  await page.waitForTimeout(1500);
  expect(page.url()).toContain('/tv/liga-mendocina/tournaments/apertura-2026');
  await expect(page.locator('.tv-scorebug')).toBeVisible();
  expect(page.url()).not.toContain('/control/login');
});

test('rotating rail allows navigation through standings, performers, and facts', async ({
  page,
}) => {
  await mockTvApis(page);
  await page.goto('/tv/liga-mendocina/tournaments/apertura-2026');

  // Verify rail tabs are present
  const performersBtn = page.getByRole('button', { name: 'Destacados' });
  const factsBtn = page.getByRole('button', { name: 'Estadísticas' });
  const standingsBtn = page.getByRole('button', { name: 'Posiciones' });

  await expect(performersBtn).toBeVisible({ timeout: 10_000 });
  await performersBtn.click();
  await expect(performersBtn).toHaveClass(/tv-rail-tab--active/);

  await factsBtn.click();
  await expect(factsBtn).toHaveClass(/tv-rail-tab--active/);

  await standingsBtn.click();
  await expect(standingsBtn).toHaveClass(/tv-rail-tab--active/);
});
