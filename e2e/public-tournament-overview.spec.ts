import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';

/**
 * The tournament overview's progress card (an overall bar, one per stage and
 * one per declared zone or group), its rules section and the connection
 * notice that appears only when the live stream is down.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
const PAGE = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Liga Mendocina',
  tournamentAlias: TOURNAMENT_ALIAS,
  tournamentName: 'Apertura 2026',
  seasonName: 'Apertura 2026',
  status: 'live',
  matches: [
    {
      matchId: '00000000-0000-7000-8000-000000000041',
      stageNumber: 1,
      matchNumber: 1,
      status: 'in-progress',
      round: 1,
      homeEntrantId: 'home-1',
      homeName: 'Club Andes',
      homeScore: 1,
      awayEntrantId: 'away-1',
      awayName: 'Deportivo Sur',
      awayScore: 0,
    },
  ],
  clubs: [],
  // A tournament that overrides nothing still lists the discipline's rules.
  ruleset: { format: 'round-robin', 'scoring.pointsPerWin': '3', 'scoring.pointsPerDraw': '1' },
  rulesetLabels: {
    format: { en: 'Format', es: 'Formato' },
    'scoring.pointsPerWin': { en: 'Points Per Win', es: 'Puntos Por Victoria' },
    'scoring.pointsPerDraw': { en: 'Points Per Draw', es: 'Puntos Por Empate' },
  },
};

const completion = {
  totalMatches: 12,
  resolvedMatches: 9,
  liveMatches: 1,
  scheduledMatches: 2,
  finalizedMatches: 9,
  forfeitedMatches: 0,
  stages: [
    {
      stageId: 'stage-1',
      stageNumber: 1,
      stageName: 'Fase de grupos',
      totalMatches: 8,
      resolvedMatches: 8,
      liveMatches: 0,
      scheduledMatches: 0,
      finalizedMatches: 8,
      forfeitedMatches: 0,
      segments: [
        { segmentId: 'g-a', name: 'Grupo A', totalMatches: 4, resolvedMatches: 4 },
        { segmentId: 'g-b', name: 'Grupo B', totalMatches: 4, resolvedMatches: 4 },
      ],
    },
    {
      stageId: 'stage-2',
      stageNumber: 2,
      stageName: 'Copas',
      totalMatches: 4,
      resolvedMatches: 1,
      liveMatches: 1,
      scheduledMatches: 2,
      finalizedMatches: 1,
      forfeitedMatches: 0,
      segments: [
        { segmentId: 'z-oro', name: 'Copa Oro', totalMatches: 2, resolvedMatches: 1 },
        { segmentId: 'z-plata', name: 'Copa Plata', totalMatches: 2, resolvedMatches: 0 },
      ],
    },
  ],
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
      res.end(JSON.stringify(completion));
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

test.describe('tournament overview progress and rules', () => {
  test('the progress card nests a bar per stage and per zone or group, sized to its content', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);

    const card = page.locator('.cl-completion-figure');
    await expect(card.getByLabel('Fase de grupos: 8 / 8')).toBeVisible();
    await expect(card.getByLabel('Copas: 1 / 4')).toBeVisible();
    await expect(card.getByLabel('Grupo B: 4 / 4')).toBeVisible();
    await expect(card.getByLabel('Copa Oro: 1 / 2')).toBeVisible();
    await expect(card.locator('progress')).toHaveCount(7);

    // Not a full-width banner for a handful of lines.
    const [cardBox, viewport] = [await card.boundingBox(), page.viewportSize()];
    expect(cardBox && viewport && cardBox.width < viewport.width * 0.6).toBe(true);
  });

  test('the progress card fits a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);
    await expect(page.locator('.cl-completion-figure')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('the rules section lists the rules in force, defaults included', async ({ page }) => {
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);

    const section = page.locator('section', {
      has: page.getByRole('heading', { name: 'Reglamento' }),
    });
    await expect(section).toContainText('Puntos Por Victoria');
    await expect(section).toContainText('3');
    await expect(section).toContainText('Puntos Por Empate');
  });

  test('no note describes the normal state, and the connection notice shows only when the stream fails', async ({
    page,
  }) => {
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);
    await expect(page.locator('.cl-completion-figure')).toBeVisible();
    await expect(page.getByText('esta página ya trae todo')).toHaveCount(0);
    await expect(page.locator('[data-connection-notice]')).toBeHidden();

    await page.unroute('**/events/**');
    await page.route('**/events/**', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.reload();
    await expect(page.locator('[data-connection-notice]')).toBeVisible();
    await expect(page.locator('[data-connection-notice]')).toContainText(
      'actualizaciones en vivo no están disponibles',
    );
  });
});
