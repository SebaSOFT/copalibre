import { createServer, type Server } from 'node:http';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import { loginCallbackUrl, seedLoginTransaction, TOKEN_ENDPOINT } from './support/control-login.js';

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const PUBLIC_TOURNAMENT_PATH = `/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const CONTROL_MATCHES_VIEW_PATH = `/control/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}/matches-view`;

const sampleCompletion = {
  totalMatches: 32,
  resolvedMatches: 18,
  liveMatches: 2,
  scheduledMatches: 12,
  finalizedMatches: 16,
  forfeitedMatches: 2,
  stages: [
    {
      stageId: '00000000-0000-7000-8000-000000000001',
      stageNumber: 1,
      stageName: 'Group Stage',
      totalMatches: 24,
      resolvedMatches: 18,
      liveMatches: 2,
      scheduledMatches: 4,
    },
    {
      stageId: '00000000-0000-7000-8000-000000000002',
      stageNumber: 2,
      stageName: 'Playoffs',
      totalMatches: 8,
      resolvedMatches: 0,
      liveMatches: 0,
      scheduledMatches: 8,
    },
  ],
};

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  matches: [],
  clubs: [],
  ruleset: {},
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${TOURNAMENT}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${TOURNAMENT}/completion`) {
      res.end(JSON.stringify(sampleCompletion));
      return;
    }
    if (path === `${TOURNAMENT}/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

async function forceEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('copalibre.language', 'en');
  });
}

async function mockControlCompletionApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ completion, tokenEndpoint }) => {
      window.fetch = async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url.includes('/completion') && method === 'GET') {
          return Response.json(completion);
        }
        if (url.includes('/internal-matches-view') && method === 'GET') {
          return Response.json({ matches: [] });
        }
        return new Response('Not found', { status: 404 });
      };
    },
    {
      completion: sampleCompletion,
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

test.describe('Tournament completion overview', () => {
  test('public overview shows tournament completion figure and per-stage breakdown', async ({
    page,
  }) => {
    await page.goto(PUBLIC_TOURNAMENT_PATH);

    const figure = page.locator('.cl-completion-figure');
    await expect(figure).toBeVisible();

    await expect(figure.getByRole('heading', { name: 'Tournament Progress' })).toBeVisible();
    await expect(figure.getByText('18 of 32 matches played')).toBeVisible();
    await expect(figure.getByText('In progress')).toBeVisible();
    await expect(figure.getByText('◐')).toBeVisible();

    await expect(figure.getByText('Group Stage')).toBeVisible();
    await expect(figure.getByText('18 / 24')).toBeVisible();
    await expect(figure.getByText('Playoffs')).toBeVisible();
    await expect(figure.getByText('0 / 8')).toBeVisible();
  });

  test('control view shows matching completion figures for the organizer', async ({ page }) => {
    await forceEnglish(page);
    await mockControlCompletionApi(page);
    await seedLoginTransaction(page, CONTROL_MATCHES_VIEW_PATH);
    await page.goto(loginCallbackUrl());
    await page.waitForURL(`**${CONTROL_MATCHES_VIEW_PATH}`);

    const completionSection = page.locator('.cl-matches-view__completion');
    await expect(completionSection).toBeVisible();

    // Verify tournament-wide stat tile matches public numbers
    const tournamentValue = completionSection.getByTestId('completion-value');
    await expect(tournamentValue).toBeVisible();
    await expect(tournamentValue).toHaveText('18 of 32');

    // Verify per-stage stat tiles match public numbers
    const stageOneValue = completionSection.getByTestId('completion-stage-1');
    await expect(stageOneValue).toBeVisible();
    await expect(stageOneValue).toHaveText('18 of 24');

    const stageTwoValue = completionSection.getByTestId('completion-stage-2');
    await expect(stageTwoValue).toBeVisible();
    await expect(stageTwoValue).toHaveText('0 of 8');
  });
});
