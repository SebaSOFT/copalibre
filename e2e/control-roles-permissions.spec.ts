import { expect, test, type Page } from '@playwright/test';

const rolesPath = '/organizations/liga-mendocina/roles';
const invitationPath = '/organizations/liga-mendocina/invitations';

async function mockRolesApi(page: Page, viewer = false): Promise<void> {
  await page.addInitScript(
    ({ rolesPath, invitationPath, viewer }) => {
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
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
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
        if (url === invitationPath && method === 'POST') {
          invitedRole = JSON.parse(String(init?.body)).role;
          return Response.json(
            {
              invitationId: '01800000-0000-7000-8000-000000000003',
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
            { status: 201 },
          );
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
    { rolesPath, invitationPath, viewer },
  );
}

test('admin invites a referee and changes a user status immediately', async ({ page }) => {
  await mockRolesApi(page);
  await page.goto('/control/liga-mendocina/roles');
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

test('viewer receives server refusal instead of roles data', async ({ page }) => {
  await mockRolesApi(page, true);
  await page.goto('/control/liga-mendocina/roles');
  await expect(page.getByRole('alert')).toContainText('not authorized');
  await expect(page.getByText('referee@example.test')).toHaveCount(0);
});
