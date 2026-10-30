import { expect, test } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const ORG_ALIAS = 'liga-mendocina';
const TARGET = `/control/${ORG_ALIAS}/live`;

test('a started tournament without a match in play has a neutral live-console status', async ({
  page,
}) => {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const path = new URL(url).pathname;
    if (url === TOKEN_ENDPOINT) {
      return route.fulfill({ json: { access_token: 'live-console-e2e-token', expires_in: 3600 } });
    }
    if (path === `/organizations/${ORG_ALIAS}/tournaments`) {
      return route.fulfill({
        json: [
          {
            tournamentId: 't-1',
            organizationId: 'org-1',
            alias: 'apertura-2026',
            name: 'Apertura 2026',
            status: 'started',
          },
        ],
      });
    }
    if (path.startsWith('/organizations/')) return route.fulfill({ json: [] });
    return route.continue();
  });

  await seedLoginTransaction(page, TARGET);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${TARGET}`);

  const badge = page.locator('.cl-live-console .cl-state--muted');
  await expect(badge).toHaveText('En curso');
  await expect(page.locator('.cl-live-console .cl-state--live')).toHaveCount(0);
});
