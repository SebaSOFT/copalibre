import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

// openspec 0165: the capability mapping reaches two surfaces a reader can
// actually see — the control panel's own navigation (task 7.1), and the
// help site's role manuals (tasks 7.2, 7.3, 7.4).

const organizationsPath = '/organizations?mine=true';

async function mockOrganizationRole(page: Page, role: string): Promise<void> {
  await page.addInitScript(
    ({ organizationsPath, role, tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === organizationsPath && method === 'GET') {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias: 'liga-mendocina',
              organizationName: 'Liga Mendocina',
              role,
            },
          ]);
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { organizationsPath, role, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test.describe('control-panel navigation follows the declared capability mapping (7.1)', () => {
  for (const [role, seesRoles] of [
    ['admin', true],
    ['club-admin', false],
    ['tournament-admin', false],
    ['referee', false],
  ] as const) {
    test(`${role} ${seesRoles ? 'sees' : 'does not see'} the Roles navigation entry`, async ({
      page,
    }) => {
      await mockOrganizationRole(page, role);
      const target = '/control/liga-mendocina';
      await seedLoginTransaction(page, target);
      await page.goto(loginCallbackUrl());
      await page.waitForURL(`**${target}`);

      const rolesLink = page.getByRole('link', { name: 'Roles', exact: true });
      if (seesRoles) {
        await expect(rolesLink).toBeVisible();
      } else {
        await expect(rolesLink).toHaveCount(0);
      }
      // Every role keeps an ungated entry, proving this is a real filter,
      // not every navigation entry disappearing along with "Roles".
      await expect(page.getByRole('link', { name: 'Torneos', exact: true })).toBeVisible();
    });
  }
});

test.describe('role manual pages are reachable from the help index (7.2)', () => {
  for (const [name, path, mustContain] of [
    ['Admin', 'admin', ['What it cannot do']],
    ['Club admin', 'club-admin', ['What it inherits', 'What it cannot do']],
    ['Tournament admin', 'tournament-admin', ['What it inherits', 'What it cannot do']],
  ] as const) {
    test(`${name}'s page is one click from /help/ and names what it inherits and cannot do`, async ({
      page,
    }) => {
      await page.goto('/help/');
      // Scoped to the article body: the left sidebar also links to every
      // role page by the same name, which would otherwise match twice.
      await page.locator('main').getByRole('link', { name, exact: true }).click();
      await page.waitForURL(`**/help/roles/${path}/`);
      await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
      for (const heading of mustContain) {
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      }
    });
  }
});

test('a club-admin is refused a control outside their club, naming ownership (7.3)', async ({
  page,
}) => {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === '/organizations/liga-mendocina/clubs' && method === 'GET') {
          return Response.json([
            { clubId: 'club-2', organizationId: 'org-1', name: 'Casa de Italia' },
          ]);
        }
        if (url === '/organizations/liga-mendocina/clubs/club-2' && method === 'PATCH') {
          return Response.json(
            { message: 'subject is not scoped to administer this club' },
            { status: 403 },
          );
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
  const target = '/control/liga-mendocina/clubs';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByText('Casa de Italia').waitFor();
  await page.getByText('Editar').click();
  await page.getByLabel('Nombre', { exact: true }).fill('Casa de Italia Renombrada');
  await page.getByText('Guardar cambios').click();

  await expect(page.getByRole('alert')).toContainText('not scoped to administer this club');
});

test('inviting a tournament-admin requires selecting a tournament (7.4)', async ({ page }) => {
  await page.addInitScript(
    ({ tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === '/organizations/liga-mendocina/roles' && method === 'GET') {
          return Response.json([]);
        }
        if (url === '/organizations/liga-mendocina/tournaments' && method === 'GET') {
          return Response.json([
            { tournamentId: 'tournament-1', alias: 'apertura', name: 'Apertura' },
          ]);
        }
        if (url === '/organizations/liga-mendocina/invitations' && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as { tournamentId?: string };
          if (!body.tournamentId) {
            return Response.json({ message: 'requires naming a tournament' }, { status: 409 });
          }
          return Response.json(
            { invitationId: 'invite-1', expiresAt: '2099-01-01T00:00:00.000Z' },
            { status: 201 },
          );
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT },
  );
  const target = '/control/liga-mendocina/roles';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByText('Añadir destinatario').click();
  await page.getByLabel('Rol de invitación').selectOption('tournament-admin');
  const submit = page.getByText('Enviar invitación');
  await expect(submit).toBeDisabled();

  await page.getByLabel('Torneo administrado').selectOption('tournament-1');
  await expect(submit).toBeEnabled();
});
