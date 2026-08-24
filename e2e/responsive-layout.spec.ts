import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const REFERENCE_WIDTHS = [375, 768, 1024, 1440] as const;
const EFFECTIVE_200_PERCENT_ZOOM_WIDTH = 188;
const CONTROL_ROUTES = [
  '/control/platform',
  '/control/liga-mendocina',
  '/control/liga-mendocina/roles',
  '/control/liga-mendocina/preferences',
  '/control/liga-mendocina/tournaments/new',
  '/control/liga-mendocina/clubs',
  '/control/liga-mendocina/resources',
  '/control/liga-mendocina/persons/019cf000-0000-7000-8000-000000000004',
  '/control/liga-mendocina/tournaments/apertura-2026/registrations',
  '/control/liga-mendocina/tournaments/apertura-2026/reports',
  '/control/liga-mendocina/tournaments/apertura-2026/matches/019cf000-0000-7000-8000-000000000005',
  '/control/liga-mendocina/tournaments/apertura-2026/matches/019cf000-0000-7000-8000-000000000005/load',
  '/control/liga-mendocina/tournaments/apertura-2026/stages/1/seeding',
  '/control/liga-mendocina/tournaments/apertura-2026/stages/1/standings',
  '/control/liga-mendocina/tournaments/apertura-2026/stages/1/zones',
  '/control/liga-mendocina/tournaments/apertura-2026/stages/1/zones/1/promotion',
  '/control/liga-mendocina/tournaments/apertura-2026/stages/1/schedule',
] as const;

async function expectNoPageOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth),
    )
    .toBe(true);
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.body.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function installResponsiveControlFixture(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          const payload = btoa(JSON.stringify({ scp: 'copalibre.super-admin' }))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '');
          return Response.json({ access_token: `e2e.${payload}.scope`, expires_in: 3600 });
        }
        if (url === '/organizations/liga-mendocina/tournaments' && method === 'GET') {
          return Response.json([
            {
              tournamentId: '019cf000-0000-7000-8000-000000000001',
              organizationId: '019cf000-0000-7000-8000-000000000002',
              alias: 'apertura-2026',
              name: 'Torneo Apertura con un nombre extraordinariamente largo para revisar contenido',
              rulesetId: '019cf000-0000-7000-8000-000000000003',
              status: 'published',
            },
          ]);
        }
        if (url === '/disciplines') {
          return Response.json([
            {
              descriptorId: 'football.default',
              version: '1.0.0',
              name: 'Football',
              supportedFormats: ['round-robin'],
            },
          ]);
        }
        if (url.includes('/custom-script-vocabulary')) {
          return Response.json({ hooks: [], entries: [] });
        }
        if (url.endsWith('/tournaments/apertura-2026/tables')) {
          return Response.json({ layouts: [] });
        }
        if (url.endsWith('/stages/1/zones')) {
          return Response.json([
            {
              zoneId: '019cf000-0000-7000-8000-000000000006',
              stageId: '019cf000-0000-7000-8000-000000000007',
              number: 1,
              name: 'Zona con un nombre extraordinariamente largo',
            },
          ]);
        }
        if (url.endsWith('/stages/1/zones/1/promotion-preview')) {
          return Response.json({ combined: [], bands: {}, trace: [] });
        }
        if (url.endsWith('/stages/1/fixtures')) {
          return Response.json({
            stageId: '019cf000-0000-7000-8000-000000000007',
            fixtures: [],
          });
        }
        if (url.endsWith('/stages/019cf000-0000-7000-8000-000000000007/schedule')) {
          return Response.json({ assignments: [] });
        }
        if (url.includes('/registrations') || url.includes('/display-tokens')) {
          return Response.json([]);
        }
        if (url.endsWith('/console')) {
          return Response.json({
            matchId: '019cf000-0000-7000-8000-000000000005',
            status: 'in-progress',
            result: null,
            liveScores: [
              { entrantId: 'entrant-a', score: 0, statistics: {} },
              { entrantId: 'entrant-b', score: 0, statistics: {} },
            ],
            segments: [],
            runningTimers: [],
            events: [],
            eventDefinitions: [],
            eligiblePersonIds: [],
            rosters: [],
            rosterRoles: [],
            eligibleStaffIds: [],
            entrantIds: ['entrant-a', 'entrant-b'],
            capabilities: [],
            projectionVersion: 1,
          });
        }
        if (url === '/events/control/liga-mendocina') {
          return new Response('', { status: 403 });
        }
        return Response.json([]);
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('Control routes remain visible without page overflow at every reference width', async ({
  page,
}) => {
  await installResponsiveControlFixture(page);
  await seedLoginTransaction(page, '/control/liga-mendocina');
  await page.goto(loginCallbackUrl());
  await page.waitForURL('**/control/liga-mendocina');
  await expect(page.locator('.cl-control')).toBeVisible();

  for (const width of [...REFERENCE_WIDTHS, EFFECTIVE_200_PERCENT_ZOOM_WIDTH]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of CONTROL_ROUTES) {
      await test.step(`${path} at ${width}px`, async () => {
        const previousTitle = await page.title();
        await page.evaluate((nextPath) => {
          history.pushState({}, '', nextPath);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, path);
        await expect.poll(() => page.title()).not.toBe(previousTitle);
        await expect(page.locator('.cl-control')).toBeVisible();
        await expect(page.locator('main')).toBeVisible();
        await expect(
          page.locator('main').locator('h1, section, [role="alert"], .cl-inline-alert').first(),
        ).toBeVisible();
        await expectNoPageOverflow(page);
      });
    }
  }
});

test('/control/callback shows a readable progress state at every reference width', async ({
  page,
}) => {
  await seedLoginTransaction(page, '/control/liga-mendocina');
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) =>
        String(input) === tokenEndpoint
          ? new Promise<Response>(() => undefined)
          : originalFetch(input, init);
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );

  for (const width of [...REFERENCE_WIDTHS, EFFECTIVE_200_PERCENT_ZOOM_WIDTH]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(loginCallbackUrl());
    await expect(page.getByText('Completando el acceso…')).toBeVisible();
    await expectNoPageOverflow(page);
  }
});

for (const path of [
  '/control/login',
  '/control/forgot-password',
  '/control/reset-password?token=e2e-reset-token',
]) {
  test(`${path} remains usable at every reference width`, async ({ page }) => {
    for (const width of [...REFERENCE_WIDTHS, EFFECTIVE_200_PERCENT_ZOOM_WIDTH]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.locator('form')).toBeVisible();
      await expectNoPageOverflow(page);
    }
  });
}

for (const path of [
  '/',
  '/404',
  '/tv/liga-mendocina/tournaments/apertura-2026',
  '/tv/liga-mendocina/tournaments/apertura-2026/stages/1/matches/1',
]) {
  test(`${path} has no page overflow at every reference width`, async ({ page }) => {
    for (const width of [...REFERENCE_WIDTHS, EFFECTIVE_200_PERCENT_ZOOM_WIDTH]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body > *:not(script):not(style):not(link)').first()).toBeVisible();
      await expectNoPageOverflow(page);
    }
  });
}
