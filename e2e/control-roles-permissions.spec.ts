import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const rolesPath = '/organizations/liga-mendocina/roles';
const invitationPath = '/organizations/liga-mendocina/invitations';

async function mockRolesApi(page: Page, viewer = false): Promise<void> {
  await page.addInitScript(
    ({ rolesPath, invitationPath, viewer, tokenEndpoint }) => {
      let roles = [
        {
          assignmentId: '01800000-0000-7000-8000-000000000002',
          principalId: '01800000-0000-7000-8000-000000000001',
          email: 'referee@example.test',
          role: 'referee',
          status: 'active',
        },
      ];
      let invitedRole = 'viewer';
      let pendingInvitations: {
        invitationId: string;
        recipientEmail: string;
        role: string;
        status: string;
        expiresAt: string;
      }[] = [];
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === rolesPath && method === 'GET') {
          if (viewer)
            return Response.json(
              { message: 'Subject organization role is not authorized for this route' },
              { status: 403 },
            );
          if (roles[0]?.status === 'inactive') {
            return Response.json(
              { message: 'Subject has no active organization role' },
              { status: 403 },
            );
          }
          return Response.json(roles);
        }
        if (url === invitationPath && method === 'GET') {
          return Response.json(pendingInvitations);
        }
        if (url === invitationPath && method === 'POST') {
          const body = JSON.parse(String(init?.body)) as { email: string; role: string };
          invitedRole = body.role;
          const invitationId = '01800000-0000-7000-8000-000000000003';
          pendingInvitations = [
            ...pendingInvitations,
            {
              invitationId,
              recipientEmail: body.email,
              role: body.role,
              status: 'active',
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
          ];
          return Response.json(
            { invitationId, expiresAt: '2099-01-01T00:00:00.000Z' },
            { status: 201 },
          );
        }
        const rescindMatch = /^\/organizations\/liga-mendocina\/invitations\/([^/]+)$/.exec(url);
        if (rescindMatch && method === 'DELETE') {
          const invitationId = rescindMatch[1];
          const rescinded = pendingInvitations.find(
            (invitation) => invitation.invitationId === invitationId,
          );
          pendingInvitations = pendingInvitations.filter(
            (invitation) => invitation.invitationId !== invitationId,
          );
          return Response.json({
            invitationId,
            expiresAt: rescinded?.expiresAt ?? '2099-01-01T00:00:00.000Z',
          });
        }
        if (url === '/invitations/accept' && method === 'POST') {
          return Response.json({
            assignmentId: '01800000-0000-7000-8000-000000000004',
            principalId: '01800000-0000-7000-8000-000000000005',
            email: 'new-referee@example.test',
            role: invitedRole,
            status: 'active',
          });
        }
        if (url.startsWith(`${rolesPath}/`) && method === 'PATCH') {
          const update = JSON.parse(String(init?.body));
          roles = roles.map((row) => ({ ...row, ...update }));
          return Response.json(roles[0]);
        }
        if (url.startsWith(`${rolesPath}/`) && method === 'DELETE')
          return Response.json({ ...roles[0], status: 'inactive' });
        return new Response('Not found', { status: 404 });
      };
    },
    { rolesPath, invitationPath, viewer, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('admin invites a referee and changes a user status immediately', async ({ page }) => {
  await mockRolesApi(page);
  const target = '/control/liga-mendocina/roles';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByText('referee@example.test')).toBeVisible();

  await page.getByText('Añadir destinatario').click();
  await page.getByLabel('Correo electrónico').fill('new-referee@example.test');
  await page.getByLabel('Rol de invitación').selectOption('referee');
  await page.getByText('Enviar invitación').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const accepted = await page.evaluate(async () => {
    const response = await fetch('/invitations/accept', { method: 'POST', body: '{}' });
    return response.json();
  });
  expect(accepted).toMatchObject({ role: 'referee', status: 'active' });

  await page.getByLabel('Estado de referee@example.test').click();
  await expect(page.getByText('Inactivo')).toBeVisible();
  const afterDeactivation = await page.evaluate(async (path) => {
    const response = await fetch(path);
    return { status: response.status, body: await response.json() };
  }, rolesPath);
  expect(afterDeactivation).toMatchObject({
    status: 403,
    body: { message: 'Subject has no active organization role' },
  });
});

test('admin creates a pending invitation and rescinds it (openspec 0170)', async ({ page }) => {
  await mockRolesApi(page);
  const target = '/control/liga-mendocina/roles';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByText('referee@example.test')).toBeVisible();

  await page.getByText('Añadir destinatario').click();
  await page.getByLabel('Correo electrónico').fill('pendiente@example.test');
  await page.getByLabel('Rol de invitación').selectOption('viewer');
  await page.getByText('Enviar invitación').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByText('pendiente@example.test')).toBeVisible();
  await page.getByLabel('Retirar invitación de pendiente@example.test').click();
  await expect(page.getByText('pendiente@example.test')).toHaveCount(0);
});

test('viewer receives server refusal instead of roles data', async ({ page }) => {
  await mockRolesApi(page, true);
  const target = '/control/liga-mendocina/roles';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);
  await expect(page.getByRole('alert')).toContainText('not authorized');
  await expect(page.getByText('referee@example.test')).toHaveCount(0);
});
