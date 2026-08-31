import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

// openspec 0166: the audit trail's control-panel surface (tasks 7.1-7.2).
// The correction-history view (task 7.3) has no control-web UI to click
// through yet — GET .../corrections is API-only — so that scenario is
// covered at the integration level instead (series-operations.integration.test.ts).

const organizationsPath = '/organizations?mine=true';
const apiAuditTrailPath = '/organizations/liga-mendocina/audit-trail';
const controlAuditTrailPath = '/control/liga-mendocina/audit-trail';

async function mockAuditTrailApi(page: Page, role: string): Promise<void> {
  await page.addInitScript(
    ({ organizationsPath, auditTrailPath, role, tokenEndpoint }) => {
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
        if (url.startsWith(auditTrailPath) && method === 'GET') {
          if (role !== 'admin') {
            return Response.json(
              { message: 'Subject organization role is not authorized for this route' },
              { status: 403 },
            );
          }
          return Response.json({
            records: [
              {
                auditId: '01890000-0000-7000-8000-00000000a001',
                entityType: 'organization',
                entityId: 'org-1',
                action: 'organization.settings_updated',
                actor: 'user:alice',
                authorizationContext: 'copalibre.control',
                occurredAt: '2026-08-30T12:00:00.000Z',
                outcome: 'applied',
              },
              {
                auditId: '01890000-0000-7000-8000-00000000a002',
                entityType: 'organization',
                entityId: 'org-1',
                action: 'authorization.refused',
                actor: 'user:bob',
                authorizationContext: '',
                reason: 'Subject organization role is not authorized for this route',
                occurredAt: '2026-08-30T11:00:00.000Z',
                outcome: 'refused',
              },
            ],
            total: 2,
            limit: 25,
            offset: 0,
          });
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { organizationsPath, auditTrailPath: apiAuditTrailPath, role, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('an administrator opens the audit surface and sees applied and refused actions (7.1)', async ({
  page,
}) => {
  await mockAuditTrailApi(page, 'admin');
  const target = '/control/liga-mendocina';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByRole('link', { name: 'Registro de auditoría', exact: true }).click();
  await page.waitForURL(`**${controlAuditTrailPath}`);

  await expect(page.getByText('user:alice')).toBeVisible();
  await expect(page.getByText('user:bob')).toBeVisible();
  await expect(page.getByText('Aplicado')).toBeVisible();
  await expect(page.getByText('Rechazado')).toBeVisible();
  await expect(
    page.getByText('Subject organization role is not authorized for this route'),
  ).toBeVisible();
});

test('a role without the audit capability does not see the navigation entry (7.2)', async ({
  page,
}) => {
  await mockAuditTrailApi(page, 'referee');
  const target = '/control/liga-mendocina';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByRole('link', { name: 'Registro de auditoría', exact: true })).toHaveCount(
    0,
  );
});

test('a role without the audit capability is refused the surface directly (7.2)', async ({
  page,
}) => {
  await mockAuditTrailApi(page, 'referee');
  await seedLoginTransaction(page, controlAuditTrailPath);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${controlAuditTrailPath}`);

  await expect(page.getByRole('alert')).toContainText('not authorized');
  await expect(page.getByText('user:alice')).toHaveCount(0);
});
