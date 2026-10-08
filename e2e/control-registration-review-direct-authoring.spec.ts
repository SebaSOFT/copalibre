import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Direct participant authoring from the registration-review
 * screen itself: a walk-up entrant registered with no CSV file, and a
 * directly-added team's name corrected in place.
 */

const TEAM_ID = 'team-1';

let registrations: unknown[];

function registrationsResponse(): unknown {
  return registrations;
}

async function mockRegistrationApi(
  page: Page,
  initial: readonly unknown[] = [],
  pendingRegistrations = false,
): Promise<void> {
  registrations = [...initial];
  await page.addInitScript(
    ({ tokenEndpoint, teamId, pendingRegistrations }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.endsWith('/registrations')) {
          if (pendingRegistrations) return new Promise<Response>(() => undefined);
          const loaded = await (
            window as unknown as { __registrations: () => Promise<unknown> }
          ).__registrations();
          return Response.json(loaded);
        }
        if (url.endsWith('/registrations/persons') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { displayName: string };
          const created = await (
            window as unknown as { __createPerson: (displayName: string) => Promise<unknown> }
          ).__createPerson(body.displayName);
          return Response.json(created, { status: 201 });
        }
        if (url.endsWith(`/registrations/teams/${teamId}`) && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as { name: string };
          const updated = await (
            window as unknown as { __renameTeam: (name: string) => Promise<unknown> }
          ).__renameTeam(body.name);
          return Response.json(updated);
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tokenEndpoint: TOKEN_ENDPOINT, teamId: TEAM_ID, pendingRegistrations },
  );

  await page.exposeFunction('__registrations', registrationsResponse);
  await page.exposeFunction('__createPerson', (displayName: string) => {
    const created = {
      entrantId: `entrant-${registrations.length + 1}`,
      tournamentId: 't-1',
      status: 'pending',
      personId: `person-${registrations.length + 1}`,
      displayName,
    };
    registrations = [...registrations, created];
    return created;
  });
  await page.exposeFunction('__renameTeam', (name: string) => {
    return { teamId: TEAM_ID, name };
  });
}

test('dismisses a loading alert in the registration control screen and captures both states', async ({
  page,
}) => {
  await mockRegistrationApi(page, [], true);
  const target = '/control/liga-mendocina/tournaments/apertura-2026/registrations';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const alert = page.getByRole('status');
  await expect(alert).toContainText('Cargando inscripciones...');
  await page.screenshot({
    fullPage: true,
    path: 'docs/assets/screenshots/control-panel-loading-alert.png',
  });

  await alert.getByRole('button', { name: 'Descartar notificación' }).click();
  await expect(alert).toHaveCount(0);
  await page.screenshot({
    fullPage: true,
    path: 'docs/assets/screenshots/control-panel-alert-dismissed.png',
  });
});

test('registers a walk-up entrant from the registration review screen, with no CSV file involved', async ({
  page,
}) => {
  await mockRegistrationApi(page);
  const target = '/control/liga-mendocina/tournaments/apertura-2026/registrations';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  const header = page.locator('.cl-list-screen__header');
  const breadcrumb = page.locator('.cl-list-screen__breadcrumb');
  const title = page.getByRole('heading', { level: 1 });
  const toolbar = page.locator('.cl-list-screen__toolbar');
  await expect(header).toBeVisible();
  await expect(breadcrumb).toBeVisible();
  await expect(title).toBeVisible();
  await expect(toolbar).toBeVisible();
  const [headerTop, headerBottom, toolbarTop] = await Promise.all([
    header.evaluate((element) => element.getBoundingClientRect().top),
    header.evaluate((element) => element.getBoundingClientRect().bottom),
    toolbar.evaluate((element) => element.getBoundingClientRect().top),
  ]);
  expect(headerTop).toBeGreaterThanOrEqual(0);
  expect(headerTop).toBeLessThan(300);
  expect(headerBottom).toBeLessThan(toolbarTop);

  await page.getByRole('button', { name: 'Agregar participante' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar participante' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Nombre').fill('Walk-up Person');
  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await expect(dialog).toBeHidden();

  const row = page.locator('summary', { hasText: 'Walk-up Person' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Pendiente')).toBeVisible();
});

test("edits a directly-added team's name from the screen and sees the change immediately", async ({
  page,
}) => {
  await mockRegistrationApi(page, [
    {
      entrantId: 'entrant-1',
      tournamentId: 't-1',
      status: 'pending',
      teamId: TEAM_ID,
    },
  ]);
  const target = '/control/liga-mendocina/tournaments/apertura-2026/registrations';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await page.getByText(TEAM_ID).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Editar identidad' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nombre').fill('Talleres FC');
  await dialog.getByRole('button', { name: 'Guardar' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Talleres FC')).toBeVisible();
});
