import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * End-to-end tests for OpenSpec 0174:
 * - Internal brand navigation preserves current locale
 * - 404 page resolves locale from requested pathname and renders home link
 * - Control-panel Modal close control exposes an accessible name in accessibility tree
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';

const organizationsList = [
  {
    organizationId: '01900000-0000-7000-8000-000000000001',
    alias: ORGANIZATION,
    name: 'Liga Mendocina',
    primaryLanguage: 'es',
    timezone: 'America/Argentina/Mendoza',
  },
];

const organizationTournaments = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournaments: [
    {
      tournamentId: '01900000-0000-7000-8000-000000000010',
      alias: TOURNAMENT_ALIAS,
      name: 'Apertura 2026',
      status: 'live',
      discipline: {
        descriptorId: '01890000-0000-7000-8000-000000000001',
        version: '1.0.0',
        name: 'Football',
      },
    },
  ],
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [
    {
      matchNumber: 1,
      stageNumber: 1,
      homeName: 'Talleres',
      awayName: 'San Martín',
      status: 'in-progress',
      scheduledAt: '2026-03-01T15:00:00Z',
    },
  ],
  clubs: [],
  ruleset: {},
};

let apiServer: Server;

test.beforeAll(async () => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');

    if (path === '/organizations') {
      res.end(JSON.stringify(organizationsList));
      return;
    }

    if (path === `/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(JSON.stringify(organizationTournaments));
      return;
    }

    if (
      path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/overview` ||
      path === `/organizations/${ORGANIZATION}/public/tournaments/${TOURNAMENT_ALIAS}/overview`
    ) {
      res.end(JSON.stringify(overview));
      return;
    }

    if (path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/live`) {
      res.end(
        JSON.stringify({
          organizationAlias: ORGANIZATION,
          tournamentAlias: TOURNAMENT_ALIAS,
          matches: [],
        }),
      );
      return;
    }

    if (path === `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });

  await new Promise<void>((resolve) => apiServer.listen(3001, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.describe('Public Navigation & Accessibility Hardening (OpenSpec 0174)', () => {
  test('8.1: from a /es/ tournament page, brand link navigates to /es/ root', async ({ page }) => {
    await page.goto(`/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await expect(page.locator('a.cl-logo')).toHaveAttribute('href', '/es/');

    await page.locator('a.cl-logo').click();
    await page.waitForURL('**/es/**');
    expect(page.url()).toMatch(/\/es\/?$/);
  });

  test('8.1 (baseline): from an unprefixed tournament page, brand link navigates to / root', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);
    await expect(page.locator('a.cl-logo')).toHaveAttribute('href', '/');

    await page.locator('a.cl-logo').click();
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '');
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('0198: the shell header renders the brand lockup, not a default-styled link', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`);

    const lockup = page.locator('a.cl-logo');
    await expect(lockup).toBeVisible();
    // Mark and wordmark are one unit.
    await expect(lockup.locator('img')).toBeVisible();
    await expect(lockup.locator('.cl-logo__wordmark')).toHaveText('CopaLibre');

    // The defect this replaces: browser-default underlined link text.
    await expect(lockup).toHaveCSS('text-decoration-line', 'none');
  });

  test('0198: public CTAs render the shared chamfered button treatment', async ({ page }) => {
    await page.goto(`/${ORGANIZATION}`);

    const cta = page.locator('a.cl-btn').first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveClass(/cl-chamfer--control/);
    await expect(cta).toHaveCSS('text-decoration-line', 'none');
  });

  test('8.2: 404 page resolves requested Spanish locale and renders Spanish copy with link', async ({
    page,
  }) => {
    const response = await page.goto('/es/some-missing-page');
    expect(response?.status()).toBe(404);

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByText('No existe ninguna organización en esta dirección.')).toBeVisible();
    const brandLink = page.locator('a.cl-logo');
    await expect(brandLink).toHaveAttribute('href', '/es/');
  });

  test('8.2 (baseline): 404 page for unprefixed missing route renders English copy with link', async ({
    page,
  }) => {
    const response = await page.goto('/some-missing-page');
    expect(response?.status()).toBe(404);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('No organization exists at this address.')).toBeVisible();
    const brandLink = page.locator('a.cl-logo');
    await expect(brandLink).toHaveAttribute('href', '/');
  });

  test('8.2 (fallback): static 404 template renders not-found markup with return home link', async ({
    page,
  }) => {
    await page.goto('/404');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#static-not-found h1')).toHaveText('Page not found');
    await expect(page.locator('#static-not-found a')).toHaveAttribute('href', '/');
  });

  test('8.3: Modal close control exposes accessible name in accessibility tree', async ({
    page,
  }) => {
    const rolesPath = `/organizations/${ORGANIZATION}/roles`;
    const invitationPath = `/organizations/${ORGANIZATION}/invitations`;

    await page.addInitScript(
      ({ rolesPath, invitationPath, tokenEndpoint }) => {
        window.fetch = async (input, init) => {
          const url = String(input);
          const method = init?.method ?? 'GET';

          if (url === tokenEndpoint) {
            return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
          }

          if (url === rolesPath && method === 'GET') {
            return Response.json([
              {
                assignmentId: '01800000-0000-7000-8000-000000000002',
                principalId: '01800000-0000-7000-8000-000000000001',
                email: 'admin@example.test',
                role: 'tournament-admin',
                status: 'active',
              },
            ]);
          }

          if (url === invitationPath && method === 'GET') {
            return Response.json([]);
          }

          return Response.json({});
        };
      },
      { rolesPath, invitationPath, tokenEndpoint: TOKEN_ENDPOINT },
    );

    const targetUrl = `/control/${ORGANIZATION}/roles`;
    await seedLoginTransaction(page, targetUrl);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${targetUrl}`);

    // Click "Añadir destinatario" / "Invitar usuario" button to open the Modal
    const inviteButton = page.getByRole('button', {
      name: /añadir destinatario|add recipient|invitar usuario|invite user/i,
    });
    await expect(inviteButton).toBeVisible();
    await inviteButton.click();

    // Verify modal is open
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Verify close control exposes accessible name "Close"
    const closeButton = dialog.getByRole('button', { name: 'Close' });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toHaveAttribute('aria-label', 'Close');

    // Click close button and confirm modal dismisses
    await closeButton.click();
    await expect(dialog).not.toBeVisible();
  });
});
