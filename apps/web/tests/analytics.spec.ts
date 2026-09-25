import { expect, test } from '@playwright/test';
import {
  loginCallbackUrl,
  seedLoginTransaction,
  TOKEN_ENDPOINT,
} from '../../../e2e/support/control-login.js';

test('analytics shows organization context and tournament match progress', async ({ page }) => {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      window.fetch = async (input) => {
        const url = String(input);
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.includes('/organizations/liga-mendocina/tournaments/apertura-2026/completion')) {
          return Response.json({
            totalMatches: 8,
            resolvedMatches: 5,
            liveMatches: 1,
            scheduledMatches: 2,
            finalizedMatches: 5,
            forfeitedMatches: 0,
            stages: [],
          });
        }
        if (url.includes('/organizations/liga-mendocina/tournaments')) {
          return Response.json([
            {
              tournamentId: '019927d0-0000-7000-8000-000000000002',
              alias: 'apertura-2026',
              name: 'Apertura 2026',
              status: 'started',
            },
          ]);
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );

  const target = '/control/liga-mendocina/analytics';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('liga-mendocina / Analítica')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumen de torneos' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Apertura 2026/ })).toContainText('5 / 8 partidos');
  await expect(page.getByRole('row', { name: /Apertura 2026/ })).toContainText('En vivo');
});
