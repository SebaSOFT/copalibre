import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const organizationAlias = 'liga-mendocina';
const tournamentName = 'Copa de invierno';
const target = `/control/${organizationAlias}`;

async function openDashboard(page: Page, initialFailure = false) {
  let failed = initialFailure;
  let tournamentReads = 0;
  await page.addInitScript(() => {
    localStorage.setItem('copalibre.language', 'en');
    const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (!String(input).includes('/events/control/')) return fetch(input, init);
      let timer: ReturnType<typeof setInterval>;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            window.__refreshDashboard = () =>
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ eventId: 'dashboard-refresh', organizationId: '019927d0-0000-7000-8000-000000000001', stream: 'control', entityId: '019927d0-0000-7000-8000-000000000002', eventType: 'tournament.updated', projectionVersion: 2, createdAt: new Date().toISOString(), payload: {} })}\n\n`,
                ),
              );
            timer = setInterval(() => controller.enqueue(encoder.encode(': heartbeat\n\n')), 1_000);
          },
          cancel() {
            clearInterval(timer);
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    };
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api(?=\/)/, '');
    const json = async (body: unknown) => route.fulfill({ json: body });
    if (url.href === TOKEN_ENDPOINT)
      return json({ access_token: 'e2e-access-token', expires_in: 3600 });
    if (path === '/organizations' && url.searchParams.get('mine') === 'true')
      return json([
        {
          organizationId: '019927d0-0000-7000-8000-000000000001',
          organizationAlias,
          organizationName: 'Liga Mendocina',
          role: 'admin',
        },
      ]);
    if (path === `/organizations/${organizationAlias}/tournaments`) {
      tournamentReads += 1;
      if (failed) return route.abort('failed');
      return json([
        {
          tournamentId: '019927d0-0000-7000-8000-000000000002',
          organizationId: '019927d0-0000-7000-8000-000000000001',
          alias: 'copa-invierno',
          name: tournamentName,
          status: 'started',
        },
      ]);
    }
    if (path.includes('/audit-trail')) return json({ records: [], total: 0, limit: 10, offset: 0 });
    if (path.endsWith('/registrations') || path.endsWith('/display-tokens')) return json([]);
    return route.continue();
  });
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  return {
    fail: (value: boolean) => {
      failed = value;
    },
    reads: () => tournamentReads,
  };
}

test('a failed dashboard refresh retains tournaments, announces stale data and offers immediate retry', async ({
  page,
}) => {
  const api = await openDashboard(page);
  await expect(page.getByText(tournamentName, { exact: true })).toBeVisible();
  api.fail(true);
  await expect.poll(() => page.evaluate(() => typeof window.__refreshDashboard)).toBe('function');
  await page.evaluate(() => window.__refreshDashboard?.());
  await expect(page.locator('.cl-stale-mark')).toContainText('Stale');
  await expect(page.getByText(tournamentName, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByText(/no tournaments/i)).toHaveCount(0);
  const previousReads = api.reads();
  await page
    .locator('.cl-toast:not([data-exiting])')
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect.poll(api.reads).toBeGreaterThan(previousReads);
  api.fail(false);
  await page
    .locator('.cl-toast:not([data-exiting])')
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(page.locator('.cl-stale-mark')).toHaveCount(0);
  await expect(page.getByText(tournamentName, { exact: true })).toBeVisible();
});

test('a failed first read keeps the skeleton and recovers through Retry without claiming an empty dashboard', async ({
  page,
}) => {
  const api = await openDashboard(page, true);
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.locator('.cl-skeleton[aria-busy="true"]')).toBeVisible();
  await expect(page.getByText(/no tournaments/i)).toHaveCount(0);
  api.fail(false);
  await page
    .locator('.cl-toast:not([data-exiting])')
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(page.getByText(tournamentName, { exact: true })).toBeVisible();
  await expect(page.locator('.cl-skeleton')).toHaveCount(0);
});

declare global {
  interface Window {
    __refreshDashboard?: () => void;
  }
}
