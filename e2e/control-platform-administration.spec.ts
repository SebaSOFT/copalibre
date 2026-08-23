import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

function scopedToken(scopes: string): string {
  return `header.${Buffer.from(JSON.stringify({ scp: scopes })).toString('base64url')}.signature`;
}

async function mockPlatformApi(page: Page, scopes: string): Promise<void> {
  await page.addInitScript(
    ({ accessToken, tokenEndpoint }) => {
      let modules = [
        {
          moduleId: '01800000-0000-7000-8000-000000000001',
          kind: 'discipline',
          alias: 'football',
          version: '1.0.0',
          sourceKind: 'curated',
          attributionAuthor: 'CopaLibre',
        },
      ];
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: accessToken, expires_in: 3600 });
        }
        if (url === '/organizations?mine=true') {
          return Response.json([
            {
              organizationId: '01800000-0000-7000-8000-000000000002',
              organizationAlias: 'liga-sur',
              organizationName: 'Liga Sur',
              role: 'admin',
            },
          ]);
        }
        if (url === '/organizations' && method === 'POST') {
          const body = JSON.parse(String(init?.body));
          return Response.json(
            { organizationId: '01800000-0000-7000-8000-000000000003', ...body },
            { status: 201 },
          );
        }
        if (url === '/organizations/copa-norte/invitations' && method === 'POST') {
          return Response.json(
            {
              invitationId: '01800000-0000-7000-8000-000000000004',
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
            { status: 201 },
          );
        }
        if (url === '/admin/modules?outdated=true') {
          return Response.json([
            {
              alias: 'football',
              currentVersion: '1.0.0',
              latestVersion: '1.1.0',
              upgrade: 'minor',
            },
          ]);
        }
        if (url === '/admin/modules/verify' && method === 'POST') {
          return Response.json(
            modules.map((module_) => ({
              alias: module_.alias,
              version: module_.version,
              ok: true,
              failures: [],
            })),
          );
        }
        if (url === '/admin/modules' && method === 'POST') {
          const body = JSON.parse(String(init?.body));
          modules = [
            ...modules,
            {
              moduleId: '01800000-0000-7000-8000-000000000005',
              kind: 'tournament-profile',
              alias: body.alias,
              version: '2.0.0',
              sourceKind: body.source ? 'alternate' : 'curated',
              attributionAuthor: 'Test Author',
            },
          ];
          return Response.json(
            {
              kind: 'tournament-profile',
              alias: body.alias,
              version: '2.0.0',
              unsatisfiedRequiredCapabilities: [],
            },
            { status: 201 },
          );
        }
        if (url.startsWith('/admin/modules/') && method === 'DELETE') {
          const alias = decodeURIComponent(url.split('/').at(-1) ?? '');
          modules = modules.filter((module_) => module_.alias !== alias);
          return Response.json({ alias, removedCount: 1 });
        }
        if (url === '/admin/modules') return Response.json(modules);
        return Response.json([]);
      };
    },
    { accessToken: scopedToken(scopes), tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('super-admin creates an organization and manages modules', async ({ page }) => {
  await mockPlatformApi(page, 'copalibre.control copalibre.super-admin');
  const target = '/control/platform';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByRole('heading', { name: 'Administración de plataforma' })).toBeVisible();
  await expect(page.getByText('football')).toBeVisible();
  await page.getByLabel('Alias', { exact: true }).fill('copa-norte');
  await page.getByLabel('Nombre').fill('Copa Norte');
  await page.getByRole('button', { name: 'Crear organización' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Crear organización' })
      .getByText(/Organización copa-norte creada. Invitá/),
  ).toBeVisible();
  await page.getByLabel('Email del primer administrador').fill('admin@copa.test');
  await page.getByRole('button', { name: 'Invitar administrador' }).click();
  await expect(
    page.getByText('Organización copa-norte creada y administrador invitado.'),
  ).toBeVisible();

  await page.getByLabel('Alias del módulo').fill('profile-pro');
  await page.getByLabel('Fuente alternativa (un solo uso)').fill('file:///modules/profile-pro');
  await page.getByRole('button', { name: 'Instalar módulo' }).click();
  await expect(page.getByText('profile-pro', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Fuente alternativa (un solo uso)')).toHaveValue('');

  await page.getByRole('button', { name: 'Buscar actualizaciones' }).click();
  await expect(page.getByText(/1.0.0 → 1.1.0/)).toBeVisible();
  await page.getByRole('button', { name: 'Verificar' }).first().click();
  await expect(page.getByText(/football superó la verificación/)).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByRole('row')
    .filter({ hasText: 'profile-pro' })
    .getByRole('button', { name: 'Eliminar' })
    .click();
  await expect(page.getByText('profile-pro', { exact: true })).toHaveCount(0);
});

test('ordinary organization admin cannot discover or open platform administration', async ({
  page,
}) => {
  await mockPlatformApi(page, 'copalibre.control');
  const target = '/control/liga-sur';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByRole('link', { name: 'Administración de plataforma' })).toHaveCount(0);

  await page.evaluate(() => {
    history.pushState({}, '', '/control/platform');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForURL('**/control/login');
  await expect(page.getByRole('heading', { name: 'Administración de plataforma' })).toHaveCount(0);
});
