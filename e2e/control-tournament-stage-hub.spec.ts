import { expect, test, type Page } from '@playwright/test';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * The full Tournament → Stage drill-down in a real browser:
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
    ({ organizationAlias, tournament, stage, tokenEndpoint }) => {
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

        if (url.includes('/organizations?mine=true')) {
          return Response.json([
            {
              organizationId: 'org-1',
              organizationAlias,
              organizationName: 'Liga Mendocina',
              role: 'admin',
            },
          ]);
        }

        if (url === `${tournament}/stages` && method === 'GET') {
          return Response.json([readStage()]);
        }
        if (url === `${tournament}/settings` && method === 'GET') {
          return Response.json({ name: 'Apertura 2026', featured: false });
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
        if (url === `${stage}/configuration` && method === 'GET') {
          return Response.json({ overrides: {} });
        }
        if (url === `${stage}/promotion-plans` && method === 'GET') {
          return Response.json([]);
        }

        return new Response('Not found', { status: 404 });
      };
    },
    { organizationAlias: ORG, tournament: TOURNAMENT, stage: STAGE, tokenEndpoint: TOKEN_ENDPOINT },
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

  await expect(page.getByRole('link', { name: 'Liga Mendocina' })).toHaveAttribute(
    'href',
    `/control/${ORG}`,
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Apertura 2026' })).toBeVisible();
  await expect(page.getByText(TOURNAMENT_ALIAS, { exact: true })).toHaveCount(0);
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

  const breadcrumb = page.locator('.cl-page-header__breadcrumb');
  await expect(breadcrumb.getByRole('link', { name: 'Apertura 2026' })).toHaveAttribute(
    'href',
    `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}`,
  );
  await expect(page.getByText(TOURNAMENT_ALIAS, { exact: true })).toHaveCount(0);
  const breadcrumbLink = page.getByRole('link', { name: 'Fase 1' });
  await expect(breadcrumbLink).toBeVisible();
  await breadcrumbLink.click();
  await page.waitForURL(`**${stageHubTarget}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Fase 1' })).toBeVisible();
  await expect(page.getByLabel('Nuevo nombre de la fase')).toHaveValue('Fase renombrada');
});

test('centres the Control main column and stage settings at 1920 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockControlApi(page);

  const tournamentHubTarget = `/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}`;
  await seedLoginTransaction(page, tournamentHubTarget);
  await page.goto(loginCallbackUrl());
  await page.waitForURL(`**${tournamentHubTarget}`);
  await page.getByRole('link', { name: /Abrir fase 1/ }).click();
  await page.waitForURL(`**/control/${ORG}/tournaments/${TOURNAMENT_ALIAS}/stages/1`);

  const navigation = page.locator('.cl-control__nav');
  const main = page.locator('.cl-control__main > .cl-container--control');
  const settings = page.locator('main .cl-container--form').first();
  await expect(settings).toBeVisible();
  const [navigationBox, mainBox, settingsBox] = await Promise.all([
    navigation.boundingBox(),
    main.boundingBox(),
    settings.boundingBox(),
  ]);

  expect(navigationBox).not.toBeNull();
  expect(mainBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();
  expect(mainBox?.width).toBeLessThanOrEqual(1440);
  const contentStart = (navigationBox?.x ?? 0) + (navigationBox?.width ?? 0);
  const contentCenter = contentStart + (1920 - contentStart) / 2;
  expect(
    Math.abs((mainBox?.x ?? 0) + (mainBox?.width ?? 0) / 2 - contentCenter),
  ).toBeLessThanOrEqual(1);
  expect(settingsBox?.width).toBeLessThanOrEqual(720);
});
