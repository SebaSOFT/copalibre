import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';
import { expectNoBrokenWords, expectTablesFitTheirFrame } from './support/table-assertions.js';

/**
 * Operations and administration screens on the shared list, rail and summary compositions:
 * roles, venues and officials, analytics, the audit trail and preferences stay inside the
 * page at phone and desktop widths in Spanish and German and pass the axe scan, and the
 * rail form and expandable audit row keep their behaviour.
 */

const ORG_ALIAS = 'liga-mendocina';
const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 375, height: 667 } as const;
const VIEWPORTS = [
  ['mobile', MOBILE],
  ['desktop', DESKTOP],
] as const;
const LANGUAGES = ['es', 'de'] as const;

interface Venue {
  venueId: string;
  organizationId: string;
  name: string;
  alias: string;
  concurrentCapacity: number;
  address?: string;
}

async function mockApi(page: Page): Promise<{ readonly createdVenues: Venue[] }> {
  const createdVenues: Venue[] = [];
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
  const orgPath = `/organizations/${ORG_ALIAS}`;
  const venues: Venue[] = [
    {
      venueId: 'venue-1',
      organizationId: 'org-1',
      name: 'Estadio Feliciano Gambarte',
      alias: 'gambarte',
      concurrentCapacity: 2,
      address: 'Av. Libertador 100, Mendoza',
    },
  ];
  await page.exposeFunction('__route', (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    if (url === '/organizations?mine=true') {
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
    if (url === orgPath) {
      return {
        body: {
          organizationId: 'org-1',
          alias: ORG_ALIAS,
          name: 'Liga Mendocina',
          primaryLanguage: 'es',
          timezone: 'America/Argentina/Mendoza',
        },
      };
    }
    if (url === `${orgPath}/roles`) {
      return {
        body: [
          {
            assignmentId: 'assignment-1',
            principalId: '01800000-0000-7000-8000-000000000001',
            email: 'admin@example.test',
            role: 'admin',
            status: 'active',
          },
          {
            assignmentId: 'assignment-2',
            principalId: '01800000-0000-7000-8000-000000000002',
            email: 'referee@example.test',
            role: 'referee',
            status: 'active',
          },
        ],
      };
    }
    if (url === `${orgPath}/roles/grantable`) {
      return { body: { roles: ['admin', 'club-admin', 'referee', 'broadcaster', 'viewer'] } };
    }
    if (url === `${orgPath}/venues` && method === 'GET') return { body: [...venues] };
    if (url === `${orgPath}/venues` && method === 'POST') {
      const request = JSON.parse(String(init?.body)) as Omit<Venue, 'venueId' | 'organizationId'>;
      const created = {
        venueId: `venue-${venues.length + 1}`,
        organizationId: 'org-1',
        ...request,
      };
      venues.push(created);
      createdVenues.push(created);
      return { body: created, status: 201 };
    }
    if (url === `${orgPath}/officials`) {
      return {
        body: [{ officialId: 'official-1', displayName: 'Patricio Loustau', roles: ['referee'] }],
      };
    }
    if (url === `${orgPath}/tournaments`) {
      return {
        body: [
          {
            tournamentId: '019927d0-0000-7000-8000-000000000002',
            alias: 'apertura-2026',
            name: 'Apertura 2026',
            status: 'started',
          },
        ],
      };
    }
    if (url.endsWith('/completion')) {
      return {
        body: {
          totalMatches: 10,
          resolvedMatches: 4,
          liveMatches: 1,
          scheduledMatches: 5,
          finalizedMatches: 4,
          forfeitedMatches: 0,
          stages: [],
        },
      };
    }
    if (url.startsWith(`${orgPath}/audit-trail`)) {
      return {
        body: {
          records: [
            {
              auditId: 'audit-1',
              entityType: 'organization',
              entityId: 'org-1',
              action: 'organization.settings_updated',
              actor: 'admin@example.test',
              authorizationContext: 'copalibre.control',
              previousState: { name: 'Liga Vieja' },
              resultingState: { name: 'Liga Mendocina' },
              occurredAt: '2026-08-30T10:00:00.000Z',
              outcome: 'applied',
            },
          ],
          total: 1,
          limit: 25,
          offset: 0,
        },
      };
    }
    if (url === `${orgPath}/storage-usage`)
      return { body: { totalBytes: 4_500_000, objectCount: 12 } };
    if (url === '/auth/pat/scopes') return { body: { scopes: ['copalibre.control'] } };
    if (url === '/auth/pat') return { body: [] };
    if (url.endsWith('/clubs') || url.endsWith('/invitations') || url.endsWith('/schedules')) {
      return { body: [] };
    }
    if (url.includes('/events/control/')) return { body: [], status: 403 };
    return { body: [] };
  });
  return { createdVenues };
}

async function open(page: Page, target: string, language: 'es' | 'de'): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('copalibre.language', value), language);
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await page.evaluate(() => document.fonts.ready);
}

const SCREENS = [
  ['roles', `/control/${ORG_ALIAS}/roles`],
  ['venues and officials', `/control/${ORG_ALIAS}/resources`],
  ['analytics', `/control/${ORG_ALIAS}/analytics`],
  ['audit trail', `/control/${ORG_ALIAS}/audit-trail`],
  ['preferences', `/control/${ORG_ALIAS}/organization`],
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
        await expect(page.locator('main')).not.toContainText('Loading');

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(viewport.width);

        // Roles, audit and analytics stack their rows on a phone: nothing scrolls sideways and
        // no word breaks in the middle.
        if (viewportName === 'mobile') {
          await expectTablesFitTheirFrame(page, 'stacked');
          await expectNoBrokenWords(page, '.cl-data-table');
        }

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

test('the venue rail form registers a venue and the list gains it', async ({ page }) => {
  const { createdVenues } = await mockApi(page);
  await page.setViewportSize(DESKTOP);
  await open(page, SCREENS[1][1], 'es');

  await expect(
    page.locator('.cl-entity-identity-cell__name', { hasText: 'Estadio Feliciano Gambarte' }),
  ).toBeVisible();
  await page.getByLabel('Nombre de la nueva cancha').fill('Polideportivo Sur');
  await page.getByLabel('Alias').fill('polideportivo-sur');
  await page.getByRole('button', { name: 'Agregar cancha' }).click();

  await expect(
    page.locator('.cl-entity-identity-cell__name', { hasText: 'Polideportivo Sur' }),
  ).toBeVisible();
  expect(createdVenues.map((venue) => venue.alias)).toEqual(['polideportivo-sur']);
});

test('an audit row opens its before and after comparison and closes it again', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize(DESKTOP);
  await open(page, SCREENS[3][1], 'es');

  const toggle = page.getByRole('button', { name: 'Ver detalle' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Ocultar detalle' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByText('Liga Vieja')).toBeVisible();
  await expect(page.getByText('Liga Mendocina', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Ocultar detalle' }).click();
  await expect(page.getByText('Liga Vieja')).toHaveCount(0);
});
