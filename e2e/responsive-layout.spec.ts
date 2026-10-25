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
            entrants: [
              { entrantId: 'entrant-a', name: 'Club Atlético Norte', abbreviation: 'CAN' },
              { entrantId: 'entrant-b', name: 'Deportivo Cuyo', abbreviation: 'DCU' },
            ],
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

async function captureControlTypeScaleScreenshots(page: Page, phase: 'before' | 'after') {
  const routes = [
    ['dashboard', '/control/liga-mendocina'],
    ['settings', '/control/liga-mendocina/preferences'],
    ['venues', '/control/liga-mendocina/resources'],
  ] as const;

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [375, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [name, path] of routes) {
      const currentPath = await page.evaluate(() => window.location.pathname);
      if (currentPath !== path) {
        await page.evaluate((nextPath) => {
          history.pushState({}, '', nextPath);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, path);
      }
      await expect(page.locator('.cl-control')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `docs/assets/screenshots/responsive-type-scale-${phase}-control-${name}-${width}x${height}.png`,
      });
    }
  }
}

async function applyPreviousControlTypography(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      ':root { --cl-font-size-lg: 1.25rem; --cl-font-size-xl: 1.5rem; --cl-font-size-2xl: 1.875rem; --cl-font-size-3xl: 2.25rem; }',
  });
  await page.evaluate(() => {
    const selectors = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    const removeHeadingSizes = (rules: CSSRuleList, removeRule: (index: number) => void): void => {
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index];
        if (
          rule instanceof CSSStyleRule &&
          selectors.has(rule.selectorText) &&
          rule.style.fontSize.includes('--cl-font-size-')
        ) {
          removeRule(index);
        } else if (rule instanceof CSSGroupingRule) {
          removeHeadingSizes(rule.cssRules, (childIndex) => rule.deleteRule(childIndex));
        }
      }
    };

    for (const sheet of document.styleSheets) {
      try {
        removeHeadingSizes(sheet.cssRules, (index) => sheet.deleteRule(index));
      } catch {
        // Cross-origin font sheets cannot be changed and carry no heading rules.
      }
    }
  });
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

test('Control dashboard, settings and venues remain readable at 200% text size', async ({
  page,
}) => {
  let pageToCheck = page;
  const captureScreenshots = process.env.CAPTURE_RESPONSIVE_TYPE_SCALE_SCREENSHOTS === '1';
  await installResponsiveControlFixture(page);
  if (captureScreenshots) {
    await page.addInitScript(() => localStorage.setItem('copalibre.language', 'es'));
  }
  await seedLoginTransaction(page, '/control/liga-mendocina');
  await page.goto(loginCallbackUrl());
  await page.waitForURL('**/control/liga-mendocina');

  if (captureScreenshots) {
    await applyPreviousControlTypography(page);
    await captureControlTypeScaleScreenshots(page, 'before');

    pageToCheck = await page.context().newPage();
    await installResponsiveControlFixture(pageToCheck);
    await pageToCheck.addInitScript(() => localStorage.setItem('copalibre.language', 'es'));
    await seedLoginTransaction(pageToCheck, '/control/liga-mendocina');
    await pageToCheck.goto(loginCallbackUrl());
    await pageToCheck.waitForURL('**/control/liga-mendocina');
    await captureControlTypeScaleScreenshots(pageToCheck, 'after');
  }

  await pageToCheck.setViewportSize({ width: 1280, height: 900 });
  await pageToCheck.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  for (const path of [
    '/control/liga-mendocina',
    '/control/liga-mendocina/preferences',
    '/control/liga-mendocina/resources',
  ]) {
    await test.step(path, async () => {
      const currentPath = await pageToCheck.evaluate(() => window.location.pathname);
      if (currentPath !== path) {
        const previousTitle = await pageToCheck.title();
        await pageToCheck.evaluate((nextPath) => {
          history.pushState({}, '', nextPath);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, path);
        await expect.poll(() => pageToCheck.title()).not.toBe(previousTitle);
      }
      await expect(pageToCheck.locator('.cl-control')).toBeVisible();
      await expectNoPageOverflow(pageToCheck);

      const clippedLabels = await pageToCheck
        .locator('main h1, main h2, main h3, main label, main button, main [role="button"]')
        .evaluateAll((elements) =>
          elements.flatMap((element) => {
            const style = getComputedStyle(element);
            const clipsWidth = ['hidden', 'clip'].includes(style.overflowX);
            const clipsHeight = ['hidden', 'clip'].includes(style.overflowY);
            const clipped =
              (clipsWidth && element.scrollWidth > element.clientWidth + 1) ||
              (clipsHeight && element.scrollHeight > element.clientHeight + 1);
            return clipped ? [element.textContent?.trim() ?? element.tagName] : [];
          }),
        );
      expect(clippedLabels).toEqual([]);
    });
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

test('public headings and body text follow the responsive type scale', async ({ page }) => {
  await page.goto('/404');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.evaluate(() => {
    const probe = document.createElement('h1');
    probe.dataset.typeScaleProbe = 'display';
    probe.textContent = 'Display scale';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.append(probe);
  });

  for (const [width, expectedHeading] of [
    [375, 16 * 1.125 ** 3],
    [1440, 16 * 1.2 ** 3],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    const actual = await page.evaluate(() => {
      const heading = document.querySelector('h1');
      const display = document.querySelector('[data-type-scale-probe="display"]');
      if (heading === null || display === null) {
        throw new Error('The responsive type-scale probes were not rendered.');
      }
      return {
        heading: Number.parseFloat(getComputedStyle(heading).fontSize),
        display: Number.parseFloat(getComputedStyle(display).fontSize),
        body: Number.parseFloat(getComputedStyle(document.body).fontSize),
      };
    });

    expect(Math.abs(actual.heading - expectedHeading)).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(actual.display - (width === 375 ? 16 * 1.125 ** 4 : 16 * 1.2 ** 4)),
    ).toBeLessThanOrEqual(0.5);
    expect(Math.abs(actual.body - 16)).toBeLessThanOrEqual(0.5);
    await expectNoPageOverflow(page);
  }
});

test('public overview and matches remain readable at 200% text size', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const path of [
    '/es/panamericano-demo/tournaments/panamericano-clubes-2025',
    '/es/panamericano-demo/tournaments/panamericano-clubes-2025/matches',
  ]) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await expectNoPageOverflow(page);

      const clippedLabels = await page
        .locator('main h1, main h2, main h3, main label, main button, main [role="button"]')
        .evaluateAll((elements) =>
          elements.flatMap((element) => {
            const style = getComputedStyle(element);
            const clipsWidth = ['hidden', 'clip'].includes(style.overflowX);
            const clipsHeight = ['hidden', 'clip'].includes(style.overflowY);
            const clipped =
              (clipsWidth && element.scrollWidth > element.clientWidth + 1) ||
              (clipsHeight && element.scrollHeight > element.clientHeight + 1);
            return clipped ? [element.textContent?.trim() ?? element.tagName] : [];
          }),
        );
      expect(clippedLabels).toEqual([]);
    });
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
  // Help renders through Starlight's own layout, whose theme maps onto the
  // CopaLibre tokens rather than composing the public shell — so it is the one
  // surface a public-route check does not cover. One page per locale direction
  // of the pair the docs gate builds.
  '/help/',
  '/help/standings/strength-of-schedule/',
  '/es/help/',
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
