import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * Full-browser coverage for openspec 0251: a `Select` that explains the
 * selected option, in the two surfaces this change adds it to.
 *
 * - Stage hub: the format `Select` shows the currently-selected format's own
 *   discipline-declared description, and updates it the moment the operator
 *   picks a different format (before any submit — `StageIdentitySection`'s
 *   format field is local state, decoupled from the "Change format" action).
 * - Roles: the role `Select` shows a condensed description of the currently-
 *   assigned role, with a "learn more" link to that role's own real help
 *   page, opened in a new tab.
 */

const ORG = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `${TOURNAMENT}/stages/1`;

async function mockStageApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tournament, stage, tokenEndpoint }) => {
      const initialStage = {
        stageId: 'stage-1',
        seasonId: 'season-1',
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        seeded: false,
        availableFormats: ['round-robin', 'single-elimination'],
        formatDescriptions: {
          'round-robin': 'Cada equipo juega contra todos los demás una vez.',
          'single-elimination': 'Quien pierde un partido queda eliminado del torneo.',
        },
      };

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${tournament}/stages` && method === 'GET') {
          return Response.json([initialStage]);
        }
        if (url === stage && method === 'PATCH') {
          return Response.json(initialStage);
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { tournament: TOURNAMENT, stage: STAGE, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('the Stage hub format Select shows the selected format’s own description, changing before submit', async ({
  page,
}) => {
  await mockStageApi(page);

  const stageHubTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1`;
  await seedLoginTransaction(page, stageHubTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${stageHubTarget}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Fase 1' })).toBeVisible();
  await expect(page.getByText('Cada equipo juega contra todos los demás una vez.')).toBeVisible();

  await page.getByLabel('Formato').selectOption('single-elimination');

  await expect(page.getByText('Quien pierde un partido queda eliminado del torneo.')).toBeVisible();
  await expect(page.getByText('Cada equipo juega contra todos los demás una vez.')).toHaveCount(0);
});

async function mockRolesApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ rolesPath, tokenEndpoint }) => {
      let role = 'referee';
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
              email: 'referee@example.test',
              role,
              status: 'active',
            },
          ]);
        }
        if (url.startsWith(`${rolesPath}/`) && method === 'PATCH') {
          const update = JSON.parse(String(init?.body)) as { role?: string };
          if (update.role !== undefined) role = update.role;
          return Response.json({
            assignmentId: '01800000-0000-7000-8000-000000000002',
            principalId: '01800000-0000-7000-8000-000000000001',
            email: 'referee@example.test',
            role,
            status: 'active',
          });
        }
        if (url === '/organizations/liga-mendocina/invitations' && method === 'GET') {
          return Response.json([]);
        }
        return new Response('Not found', { status: 404 });
      };
    },
    { rolesPath: '/organizations/liga-mendocina/roles', tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('the role Select explains the assigned role and links to that role’s own help page', async ({
  page,
}) => {
  await mockRolesApi(page);
  const target = '/control/liga-mendocina/roles';
  await seedLoginTransaction(page, target);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${target}`);

  await expect(page.getByText('referee@example.test')).toBeVisible();
  await expect(
    page.getByText(
      'Opera un partido en vivo: registra eventos, controla el reloj, resuelve cronómetros y selecciona la plantilla.',
    ),
  ).toBeVisible();
  const learnMoreLink = page.getByRole('link', { name: 'Más información' });
  await expect(learnMoreLink).toHaveAttribute('href', '/es/help/roles/referee');
  await expect(learnMoreLink).toHaveAttribute('target', '_blank');

  await page.getByLabel('Rol de referee@example.test').selectOption('viewer');

  await expect(
    page.getByText(
      'El rol de organización con menos privilegios: pertenece a la organización sin otorgar ninguna autoridad operativa.',
    ),
  ).toBeVisible();
  await expect(learnMoreLink).toHaveAttribute('href', '/es/help/roles/viewer');

  const [helpPage] = await Promise.all([
    page.context().waitForEvent('page'),
    learnMoreLink.click(),
  ]);
  await helpPage.waitForLoadState();
  await expect(helpPage).toHaveURL(/\/es\/help\/roles\/viewer\/?$/);
  await expect(helpPage.getByRole('heading', { level: 1, name: 'Viewer' })).toBeVisible();
});
