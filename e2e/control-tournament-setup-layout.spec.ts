import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Tournament setup screens on the shared setup compositions: settings, ruleset and the
 * creation wizard stay inside the page at phone and desktop widths in Spanish and German,
 * pass the axe scan, and keep their own save and navigation behaviour.
 */

const ORG_ALIAS = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 375, height: 667 } as const;
const VIEWPORTS = [
  ['mobile', MOBILE],
  ['desktop', DESKTOP],
] as const;
const LANGUAGES = ['es', 'de'] as const;

const FIELD_POLICIES = {
  'scoring.pointsPerWin': {
    permission: { kind: 'replaced' },
    mutationClass: 'safe',
    label: 'Points per win',
  },
  'scoring.pointsPerDraw': {
    permission: { kind: 'replaced' },
    mutationClass: 'safe',
    label: 'Points per draw',
  },
  tiebreakers: {
    permission: { kind: 'merged', strategy: 'union-list' },
    mutationClass: 'safe',
    label: 'Tiebreakers',
  },
};

async function mockApi(page: Page): Promise<{ readonly saved: Record<string, unknown>[] }> {
  const saved: Record<string, unknown>[] = [];
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        const handler = (
          window as unknown as {
            __route?: (u: string, i?: { method?: string; body?: string }) => Promise<unknown>;
          }
        ).__route;
        const handled = handler
          ? ((await handler(url, {
              method: init?.method,
              body: typeof init?.body === 'string' ? init.body : undefined,
            })) as { body: unknown; status?: number } | null)
          : null;
        if (handled) return Response.json(handled.body, { status: handled.status ?? 200 });
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
  let overrides: Record<string, unknown> = {
    'scoring.pointsPerWin': 3,
    'scoring.pointsPerDraw': 1,
  };
  await page.exposeFunction('__route', (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/ruleset-overrides') && method === 'GET') {
      return {
        body: {
          overrides,
          fieldPolicies: FIELD_POLICIES,
          disciplineDefaults: { scoring: { pointsPerWin: 2, pointsPerDraw: 1 } },
        },
      };
    }
    if (url.endsWith('/ruleset-overrides') && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as { overrides: Record<string, unknown> };
      saved.push(body.overrides);
      overrides = { ...overrides, ...body.overrides };
      return {
        body: {
          overrides,
          fieldPolicies: FIELD_POLICIES,
          disciplineDefaults: { scoring: { pointsPerWin: 2, pointsPerDraw: 1 } },
        },
      };
    }
    if (url.endsWith('/settings') && method === 'GET') {
      return {
        body: {
          name: 'Apertura 2026',
          region: 'Cuyo',
          capacity: 16,
          featured: false,
          includesMinors: false,
          showYouthProfiles: false,
        },
      };
    }
    if (url === '/api/organizations?mine=true' && method === 'GET') {
      return {
        body: [
          {
            organizationId: 'org-1',
            organizationAlias: ORG_ALIAS,
            organizationName: 'Liga Mendocina',
            role: 'admin',
          },
        ],
      };
    }
    if (url === '/api/disciplines' && method === 'GET') {
      return {
        body: [
          {
            descriptorId: 'football.default',
            version: '1.0.0',
            name: 'Futbol',
            supportedFormats: ['round-robin'],
          },
        ],
      };
    }
    if (url.includes('custom-script-vocabulary')) return { body: { hooks: [], entries: [] } };
    if (url.includes('/events/control/')) return { body: [], status: 403 };
    return { body: [] };
  });
  return { saved };
}

async function open(page: Page, target: string, language: 'es' | 'de'): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('copalibre.language', value), language);
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await page.evaluate(() => document.fonts.ready);
}

const SCREENS = [
  ['settings', `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/settings`],
  ['ruleset', `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}/ruleset`],
  ['wizard', `/control/${ORG_ALIAS}/tournaments/new`],
] as const;

for (const language of LANGUAGES) {
  for (const [screen, target] of SCREENS) {
    for (const [viewportName, viewport] of VIEWPORTS) {
      test(`the ${screen} screen has no horizontal page overflow and passes the axe scan at ${viewportName} width in ${language}`, async ({
        page,
      }) => {
        await mockApi(page);
        await page.setViewportSize(viewport);
        await open(page, target, language);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(viewport.width);

        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(
          violations.map(({ id, impact, nodes }) => ({
            id,
            impact,
            targets: nodes.map(({ target: node }) => node),
          })),
        ).toEqual([]);
      });
    }
  }
}

test('the ruleset shows the unsaved bar for two edits, Reset restores them and Save sends only the changes', async ({
  page,
}) => {
  const { saved } = await mockApi(page);
  await page.setViewportSize(DESKTOP);
  await open(page, SCREENS[1][1], 'es');

  const win = page.getByLabel('Points per win');
  const draw = page.getByLabel('Points per draw');
  await expect(win).toHaveValue('3');
  await expect(page.getByRole('status')).toHaveCount(0);

  await win.fill('4');
  await draw.fill('2');
  const bar = page.getByRole('status');
  await expect(bar).toContainText('2 cambios sin guardar');
  await expect(bar.getByRole('list')).toContainText('Points per win');
  await expect(bar.getByRole('list')).toContainText('Points per draw');

  await bar.getByRole('button', { name: 'Restablecer' }).click();
  await expect(win).toHaveValue('3');
  await expect(draw).toHaveValue('1');
  await expect(page.getByRole('status')).toHaveCount(0);

  await win.fill('5');
  await page.getByRole('status').getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Configuración guardada.')).toBeVisible();
  expect(saved).toEqual([{ 'scoring.pointsPerWin': 5 }]);
});

test('the creation wizard names the next step once the first step is complete', async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize(DESKTOP);
  await open(page, SCREENS[2][1], 'es');

  await expect(page.getByText('Siguiente: Privacidad')).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill('Apertura 2026');
  await page.getByLabel('Alias').fill('apertura-2026');
  await page.getByRole('button', { name: 'Continuar al siguiente paso' }).click();

  await expect(page.getByText('Siguiente: Disciplina')).toBeVisible();
});

for (const colorScheme of ['dark', 'light'] as const) {
  test(`the tournament overview meets AA contrast in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await mockApi(page);
    await page.emulateMedia({ colorScheme });
    await open(page, `/control/${ORG_ALIAS}/tournaments/${TOURNAMENT_ALIAS}`, 'es');
    await expect(page.locator('.cl-context-rail-header__scope').first()).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    expect(violations.map(({ nodes }) => nodes.map(({ target }) => target))).toEqual([]);
  });
}
