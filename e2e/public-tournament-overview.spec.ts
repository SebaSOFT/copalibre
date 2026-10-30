import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';
import { expectNoVisibleIdentifiers, FIXTURE_ALIASES } from './support/visible-identifiers.js';
import { expectCenteredPageContainer } from './support/public-layout-widths.js';

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
  organizationTimeZone: 'America/Argentina/Mendoza',
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

const DEMO_CLUBS = [
  'Casa de Italia',
  'San Martín',
  'Richett y Zapata',
  'Estudiantil San Miguel',
  'Lomas de Rivadavia',
  'Club Hispano',
  'Red Star',
  'Corazonistas Bogotá',
  'Atlético Unión',
  'Valenciano',
  'Concepción Patín Club',
  'Andes Talleres',
  'Leonardo Murialdo',
  'Olimpia Patín Club',
  'Banco Hispano',
  'Social San Juan',
  'Unión Vecinal',
  'Richet y Zapata B',
  'Estudiantil Porteño',
  'Huracán',
  'Palmira',
  'Aberastain',
  'Lomas de Rivadavia B',
  'San Martín B',
];

const demoMatches = Array.from({ length: 72 }, (_, index) => {
  const played = index < 6;
  const homeClub = index % DEMO_CLUBS.length;
  const awayClub = (index + 1) % DEMO_CLUBS.length;
  const stageNumber = index < 48 ? 1 : 2;
  const matchNumber = index + 1;
  return {
    matchId: `00000000-0000-7000-8000-${String(index + 100).padStart(12, '0')}`,
    stageNumber,
    stageOrdinal: matchNumber,
    matchNumber,
    status: played ? 'finalized' : 'scheduled',
    round: stageNumber === 1 ? Math.floor(index / 8) + 1 : Math.floor((index - 48) / 8) + 1,
    homeEntrantId: `club-${homeClub + 1}`,
    homeName: DEMO_CLUBS[homeClub],
    ...(played ? { homeScore: 4 } : {}),
    awayEntrantId: `club-${awayClub + 1}`,
    awayName: DEMO_CLUBS[awayClub],
    ...(played ? { awayScore: index % 2 === 0 ? 2 : 3 } : {}),
    scheduledAt: played
      ? `2026-10-${String(23 + index).padStart(2, '0')}T19:00:00.000Z`
      : `2099-06-${String(Math.floor((index - 6) / 5) + 1).padStart(2, '0')}T${String(
          19 + ((index - 6) % 5),
        ).padStart(2, '0')}:00:00.000Z`,
    venueName: `Cancha ${(index % 4) + 1}`,
  };
});

const demoStandingsPreview = DEMO_CLUBS.map((name, index) => ({
  rank: index + 1,
  entrantId: `club-${index + 1}`,
  name,
  sharedRank: false,
  statistics: {
    played: index === 0 || index === 6 ? 1 : index < 6 ? 2 : 0,
    points: index < 6 ? 3 : 0,
  },
  zoneName: `Grupo ${String.fromCharCode(65 + Math.floor(index / 4))}`,
}));

const demoTableProjection = {
  layoutCode: 'group-table',
  target: 'group-phase',
  label: { en: 'Group Table', es: 'Tabla de posiciones' },
  columns: [
    { code: 'rank', header: '#', format: 'number' },
    { code: 'name', header: 'Equipo', format: 'text' },
    { code: 'played', header: 'PJ', format: 'number' },
    { code: 'points', header: 'Pts', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  rows: demoStandingsPreview.map((row, index) => ({
    actorId: `00000000-0000-7000-8000-${String(index + 201).padStart(12, '0')}`,
    entrantId: `00000000-0000-7000-8000-${String(index + 301).padStart(12, '0')}`,
    actorName: row.name,
    entrantName: row.name,
    rank: row.rank,
    sharedRank: row.sharedRank,
    cells: {
      rank: { raw: row.rank, formatted: String(row.rank) },
      name: { formatted: row.name },
      played: { raw: row.statistics.played, formatted: String(row.statistics.played) },
      points: { raw: row.statistics.points, formatted: String(row.statistics.points) },
    },
  })),
  projectionVersion: 1,
  grain: 'match',
  countColumnCode: 'played',
};

const demoCompletion = {
  ...completion,
  totalMatches: 72,
  resolvedMatches: 6,
  liveMatches: 0,
  scheduledMatches: 66,
  finalizedMatches: 6,
  stages: [
    {
      stageId: 'stage-1',
      stageNumber: 1,
      stageName: 'Fase de grupos',
      totalMatches: 48,
      resolvedMatches: 6,
      liveMatches: 0,
      scheduledMatches: 42,
      finalizedMatches: 6,
      forfeitedMatches: 0,
      segments: Array.from({ length: 6 }, (_, index) => ({
        segmentId: `group-${index + 1}`,
        name: `Grupo ${String.fromCharCode(65 + index)}`,
        totalMatches: 8,
        resolvedMatches: index === 0 ? 6 : 0,
      })),
    },
    {
      stageId: 'stage-2',
      stageNumber: 2,
      stageName: 'Copas',
      totalMatches: 24,
      resolvedMatches: 0,
      liveMatches: 0,
      scheduledMatches: 24,
      finalizedMatches: 0,
      forfeitedMatches: 0,
      segments: ['Copa Oro', 'Copa Plata', 'Copa Bronce'].map((name, index) => ({
        segmentId: `cup-${index + 1}`,
        name,
        totalMatches: 8,
        resolvedMatches: 0,
      })),
    },
  ],
};

let apiServer: Server;
let noLiveMatches = false;
let demoScaleOverview = false;
test.beforeEach(() => {
  noLiveMatches = false;
  demoScaleOverview = false;
});

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${TOURNAMENT}/overview`) {
      const response = demoScaleOverview
        ? {
            ...overview,
            matches: demoMatches,
            standingsPreview: demoStandingsPreview,
            standingsGrain: 'match',
          }
        : noLiveMatches
          ? {
              ...overview,
              matches: overview.matches.map((match) => ({
                ...match,
                status: 'scheduled',
                scheduledAt: '2099-06-01T19:00:00.000Z',
              })),
            }
          : overview;
      res.end(JSON.stringify(response));
      return;
    }
    if (path === `${TOURNAMENT}/completion`) {
      res.end(JSON.stringify(demoScaleOverview ? demoCompletion : completion));
      return;
    }
    if (demoScaleOverview && path === `${TOURNAMENT}/public/tables`) {
      res.end(
        JSON.stringify({
          layouts: [
            {
              code: 'group-table',
              target: 'group-phase',
              label: { en: 'Group Table', es: 'Tabla de posiciones' },
              entityGranularity: 'team',
            },
          ],
        }),
      );
      return;
    }
    if (demoScaleOverview && path.endsWith('/public/tables/group-table')) {
      res.end(JSON.stringify(demoTableProjection));
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
  test('4.1: on the 72-match demo scale, kickoff is in the first viewport and the page stays below 2,500px', async ({
    page,
  }) => {
    demoScaleOverview = true;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);
    await page.evaluate(() => document.fonts.ready);

    const kickoff = page
      .locator('section[aria-labelledby="overview-next-heading"]')
      .getByText('16:00', { exact: true })
      .first();
    await expect(kickoff).toBeVisible();
    await expect(kickoff).toBeInViewport();
    await expect(page.locator('.cl-standings-section tbody tr')).toHaveCount(8);
    const firstUpcoming = page
      .locator('section[aria-labelledby="overview-next-heading"] .cl-match-card--compact')
      .first();
    await expect(firstUpcoming).toContainText('Red Star');
    await expect(firstUpcoming).toContainText('Corazonistas Bogotá');
    await expect(firstUpcoming).toHaveCSS('min-height', '44px');
    await expect(
      page.locator('section[aria-labelledby="overview-next-heading"] .cl-match-card--compact'),
    ).toHaveCount(4);
    await expect(
      page.locator('section[aria-labelledby="overview-results-heading"] .cl-match-card--compact'),
    ).toHaveCount(4);
    await expect(
      page.locator('.cl-club-filter, .cl-table-tabs, [data-table-sort-button]'),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ver tabla completa' })).toHaveAttribute(
      'href',
      `${PAGE}?tab=group-table`,
    );

    const pageHeight = await page.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    );
    expect(pageHeight).toBeLessThan(2500);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const mobileUpcoming = page
      .locator('section[aria-labelledby="overview-next-heading"] .cl-match-card--compact')
      .first();
    await expect(mobileUpcoming).toContainText('Red Star');
    await expect(mobileUpcoming).toContainText('Corazonistas Bogotá');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('the progress card fills the public column and nests a bar per stage and segment', async ({
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

    const [cardBox, containerBox, padding] = await Promise.all([
      card.boundingBox(),
      page.locator('main > .cl-container--public').first().boundingBox(),
      page
        .locator('main > .cl-container--public')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
        }),
    ]);
    expect(cardBox && containerBox).not.toBeNull();
    expect(cardBox?.width).toBeCloseTo((containerBox?.width ?? 0) - padding, 0);
  });

  test('uses the centered public container at reference widths', async ({ page }) => {
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await expectCenteredPageContainer(page, PAGE);
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

  test('the rules section lists the rules in force, defaults included @visible-identifier-lint', async ({
    page,
  }) => {
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);
    await expectNoVisibleIdentifiers(page, FIXTURE_ALIASES);

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

test.describe('public empty states without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('names the next kickoff and links to matches when no match is live', async ({ page }) => {
    noLiveMatches = true;
    await page.goto(PAGE);
    const empty = page.locator('.cl-interaction-empty-state');
    await expect(empty.getByRole('heading', { name: 'No hay partidos en vivo' })).toBeVisible();
    await expect(empty).toContainText('Próximo partido:');
    await expect(empty).toContainText('2099');
    await expect(empty.getByRole('link', { name: 'Ver partidos' })).toHaveAttribute(
      'href',
      `${PAGE}/matches`,
    );
  });
  test('a missing organization keeps its 404 status and offers organization and help navigation', async ({
    page,
  }) => {
    const response = await page.goto('/es/organizacion-ausente');
    expect(response?.status()).toBe(404);
    const empty = page.locator('.cl-interaction-empty-state');
    await expect(empty.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(empty.getByRole('link', { name: 'Ver organizaciones' })).toHaveAttribute(
      'href',
      '/es/',
    );
    await expect(empty.getByRole('link').last()).toHaveAttribute('href', /help/);
  });
});
