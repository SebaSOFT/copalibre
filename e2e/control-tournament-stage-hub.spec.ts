import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * The full Tournament → Stage drill-down in a real browser (openspec 0250):
 * open a tournament's hub, see its stage list, open a stage's hub, see its
 * current name pre-filled (the stage-rename-field-doesn't-show-current-name
 * bug this change fixes), rename it, follow a link to its seeding screen,
 * and follow that screen's breadcrumb back to the stage hub.
 *
 * The API is stubbed at `window.fetch`, as the other control-panel e2e specs
 * do (see `control-zone-group.spec.ts`).
 */

const ORG = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORG}/tournaments/${TOURNAMENT_ALIAS}`;
const STAGE = `${TOURNAMENT}/stages/1`;

async function mockControlApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tournament, stage, tokenEndpoint }) => {
      const STAGE_KEY = 'e2e-stage';
      const initialStage = {
        stageId: 'stage-1',
        seasonId: 'season-1',
        number: 1,
        name: 'Fase de grupos',
        format: 'round-robin',
        seeded: false,
      };
      const readStage = (): typeof initialStage => {
        const stored = sessionStorage.getItem(STAGE_KEY);
        return stored ? (JSON.parse(stored) as typeof initialStage) : initialStage;
      };
      const writeStage = (next: typeof initialStage): void =>
        sessionStorage.setItem(STAGE_KEY, JSON.stringify(next));

      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }

        if (url === `${tournament}/stages` && method === 'GET') {
          return Response.json([readStage()]);
        }

        if (url === stage && method === 'PATCH') {
          const body = JSON.parse(String(init?.body)) as { readonly name?: string };
          const updated = {
            ...readStage(),
            ...(body.name !== undefined ? { name: body.name } : {}),
          };
          writeStage(updated);
          return Response.json(updated);
        }

        if (url === `${stage}/seeding` && method === 'GET') {
          return Response.json({
            stageId: 'stage-1',
            format: 'round-robin',
            seeds: [],
            zones: [],
            hasRecordedResults: false,
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    { tournament: TOURNAMENT, stage: STAGE, tokenEndpoint: TOKEN_ENDPOINT },
  );
}

test('drills down from a tournament hub to a stage hub, renames the stage, and links to and from seeding', async ({
  page,
}) => {
  await mockControlApi(page);

  const tournamentHubTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}`;
  await seedLoginTransaction(page, tournamentHubTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${tournamentHubTarget}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Fases' })).toBeVisible();
  const stageLink = page.getByRole('link', { name: /Abrir fase 1/ });
  await expect(stageLink).toBeVisible();
  await expect(stageLink).toContainText('Fase de grupos');

  const stageHubTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1`;
  await stageLink.click();
  await page.waitForURL(`**${stageHubTarget}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Fase 1' })).toBeVisible();
  const renameField = page.getByLabel('Nuevo nombre de la fase');
  // The bug this change fixes: the field used to always start blank.
  await expect(renameField).toHaveValue('Fase de grupos');

  await renameField.fill('Fase renombrada');
  await page.getByRole('button', { name: 'Renombrar' }).click();
  await expect(page.getByText('Stage renamed.')).toBeVisible();

  const seedingTarget = `${stageHubTarget}/seeding`;
  await page.getByRole('link', { name: 'Sorteo' }).click();
  await page.waitForURL(`**${seedingTarget}`);

  const breadcrumbLink = page.getByRole('link', { name: 'Fase 1' });
  await expect(breadcrumbLink).toBeVisible();
  await breadcrumbLink.click();
  await page.waitForURL(`**${stageHubTarget}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Fase 1' })).toBeVisible();
  await expect(page.getByLabel('Nuevo nombre de la fase')).toHaveValue('Fase renombrada');
});
