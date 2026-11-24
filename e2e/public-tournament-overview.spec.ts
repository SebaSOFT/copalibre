import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures.js';
import { expectNoVisibleIdentifiers, FIXTURE_ALIASES } from './support/visible-identifiers.js';
import { expectCenteredPageContainer } from './support/public-layout-widths.js';
import { expectNoSeriousSemanticViolations } from './support/semantic-axe.js';

/**
 * The tournament overview's state-first lead, compact completion fact, rules
 * section and connection notice that appears only when the live stream is down.
 */

const ORGANIZATION = 'liga-mendocina';
const TOURNAMENT_ALIAS = 'apertura-2026';
const TOURNAMENT = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
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
      ? `2026-10-23T${String(15 + index).padStart(2, '0')}:00:00.000Z`
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

// Every ordinary match's persisted number is 1; only the stage ordinal and the group tell them apart.
const nowStripMatches = [
  {
    matchId: '00000000-0000-7000-8000-000000000051',
    stageNumber: 1,
    stageOrdinal: 3,
    matchNumber: 1,
    round: 1,
    groupName: 'Grupo A',
    status: 'in-progress',
    homeEntrantId: 'home-1',
    homeName: 'Club Andes',
    awayEntrantId: 'away-1',
    awayName: 'Deportivo Sur',
    scheduledAt: '2026-10-23T19:00:00.000Z',
  },
  {
    matchId: '00000000-0000-7000-8000-000000000052',
    stageNumber: 1,
    stageOrdinal: 7,
    matchNumber: 1,
    round: 2,
    groupName: 'Grupo B',
    status: 'scheduled',
    homeEntrantId: 'home-2',
    homeName: 'Red Star',
    awayEntrantId: 'away-2',
    awayName: 'Palmira',
    scheduledAt: '2099-06-01T19:00:00.000Z',
  },
  {
    matchId: '00000000-0000-7000-8000-000000000053',
    stageNumber: 1,
    stageOrdinal: 2,
    matchNumber: 1,
    round: 1,
    groupName: 'Grupo C',
    status: 'finalized',
    homeEntrantId: 'home-3',
    homeName: 'Huracán',
    homeScore: 2,
    awayEntrantId: 'away-3',
    awayName: 'Valenciano',
    awayScore: 1,
    scheduledAt: '2026-10-22T19:00:00.000Z',
  },
];

const FACT_VENUES = [
  { alias: 'aldo-cantoni', name: 'Aldo Cantoni', address: 'Av. Central 100', courtCount: 2 },
  { alias: 'huarpes', name: 'Huarpes', courtCount: 1 },
  { alias: 'olimpia', name: 'Olimpia', courtCount: 1 },
  { alias: 'richet-y-zapata', name: 'Richet y Zapata', courtCount: 1 },
  { alias: 'social', name: 'Social', courtCount: 1 },
];

/** The overview with its discipline, `venueCount` venues and five tiebreakers. */
const factsOverview = (venueCount: number) => ({
  ...overview,
  disciplineName: 'Rink Hockey',
  localizedDisciplineName: { en: 'Rink Hockey', es: 'Hockey sobre patines' },
  venues: FACT_VENUES.slice(0, venueCount),
  standingsPreview: demoStandingsPreview,
  standingsGrain: 'match',
  ruleset: {
    ...overview.ruleset,
    tiebreakers: 'points,score-difference,goal-average,goals-for,goals-against',
  },
});

let apiServer: Server;
let noLiveMatches = false;
let nowStripOverview = false;
let scheduleDaysOverview = false;
let demoScaleOverview = false;
let completedOverview = false;
let multiStageOverview = false;
/** How many venues the overview names, with its discipline and five tiebreakers; 0 leaves them out. */
let factsVenueCount = 0;
test.beforeEach(() => {
  factsVenueCount = 0;
  nowStripOverview = false;
  scheduleDaysOverview = false;
  noLiveMatches = false;
  demoScaleOverview = false;
  completedOverview = false;
  multiStageOverview = false;
});

function mendozaDayKey(offsetDays: number): string {
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Argentina/Mendoza',
  }).format(new Date());
  const [year = 2026, month = 1, day = 1] = todayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

function buildScheduleDaysOverview() {
  const now = Date.now();
  const yesterdayKey = mendozaDayKey(-1);
  const minus3Key = mendozaDayKey(-3);
  const tomorrowKey = mendozaDayKey(1);
  const plus3Key = mendozaDayKey(3);
  return {
    ...overview,
    matches: [
      {
        matchId: '00000000-0000-7000-8000-000000000701',
        stageNumber: 1,
        stageOrdinal: 1,
        matchNumber: 1,
        round: 1,
        groupName: 'Grupo A',
        status: 'finalized',
        homeEntrantId: 'h-final-old',
        homeName: 'Final Viejo Local',
        homeScore: 1,
        awayEntrantId: 'a-final-old',
        awayName: 'Final Viejo Visita',
        awayScore: 0,
        scheduledAt: `${minus3Key}T15:00:00.000Z`,
      },
      {
        matchId: '00000000-0000-7000-8000-000000000702',
        stageNumber: 1,
        stageOrdinal: 2,
        matchNumber: 2,
        round: 1,
        groupName: 'Grupo A',
        status: 'finalized',
        homeEntrantId: 'h-final-new',
        homeName: 'Último Resultado Local',
        homeScore: 3,
        awayEntrantId: 'a-final-new',
        awayName: 'Último Resultado Visita',
        awayScore: 2,
        scheduledAt: `${yesterdayKey}T15:00:00.000Z`,
      },
      {
        matchId: '00000000-0000-7000-8000-000000000703',
        stageNumber: 1,
        stageOrdinal: 3,
        matchNumber: 3,
        round: 2,
        groupName: 'Grupo B',
        status: 'scheduled',
        homeEntrantId: 'h-up-late',
        homeName: 'Próximo Lejano Local',
        awayEntrantId: 'a-up-late',
        awayName: 'Próximo Lejano Visita',
        scheduledAt: `${plus3Key}T15:00:00.000Z`,
      },
      {
        matchId: '00000000-0000-7000-8000-000000000704',
        stageNumber: 1,
        stageOrdinal: 4,
        matchNumber: 4,
        round: 2,
        groupName: 'Grupo B',
        status: 'scheduled',
        homeEntrantId: 'h-up-soon',
        homeName: 'Próximo Mañana Local',
        awayEntrantId: 'a-up-soon',
        awayName: 'Próximo Mañana Visita',
        scheduledAt: `${tomorrowKey}T15:00:00.000Z`,
      },
      {
        matchId: '00000000-0000-7000-8000-000000000705',
        stageNumber: 1,
        stageOrdinal: 5,
        matchNumber: 5,
        round: 2,
        groupName: 'Grupo C',
        status: 'scheduled',
        homeEntrantId: 'h-delayed',
        homeName: 'Demorado Local',
        awayEntrantId: 'a-delayed',
        awayName: 'Demorado Visita',
        scheduledAt: new Date(now - 20 * 60_000).toISOString(),
      },
      {
        matchId: '00000000-0000-7000-8000-000000000706',
        stageNumber: 1,
        stageOrdinal: 6,
        matchNumber: 6,
        round: 2,
        groupName: 'Grupo C',
        status: 'in-progress',
        homeEntrantId: 'h-live',
        homeName: 'En Vivo Local',
        homeScore: 1,
        awayEntrantId: 'a-live',
        awayName: 'En Vivo Visita',
        awayScore: 1,
        scheduledAt: new Date(now - 35 * 60_000).toISOString(),
      },
    ],
  };
}

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path] = (req.url ?? '').split('?');
    if (path === `${TOURNAMENT}/overview`) {
      if (factsVenueCount > 0) {
        res.end(JSON.stringify(factsOverview(factsVenueCount)));
        return;
      }
      const response = scheduleDaysOverview
        ? buildScheduleDaysOverview()
        : nowStripOverview
          ? { ...overview, matches: nowStripMatches }
          : multiStageOverview
            ? {
                ...overview,
                stages: [
                  { stageNumber: 1, stageName: 'Fase de grupos', format: 'round-robin', zones: [] },
                  { stageNumber: 2, stageName: 'Copas', format: 'single-elimination', zones: [] },
                ],
              }
            : completedOverview
              ? {
                  ...overview,
                  status: 'finished',
                  winners: [
                    {
                      zoneId: 'zone-finished',
                      zoneName: 'Zona Campeonato',
                      champion: { entrantId: 'home-1', name: 'Club Andes', abbreviation: 'AND' },
                      runnerUp: { entrantId: 'away-1', name: 'Deportivo Sur', abbreviation: 'SUR' },
                    },
                  ],
                  matches: overview.matches.map((match) => ({ ...match, status: 'finalized' })),
                }
              : demoScaleOverview
                ? {
                    ...overview,
                    matches: demoMatches,
                    standingsPreview: demoStandingsPreview,
                    standingsGrain: 'match',
                    ruleset: {
                      ...overview.ruleset,
                      tiebreakers: 'points,score-difference,goal-average,goals-for,goals-against',
                    },
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
      const result = completedOverview
        ? {
            ...completion,
            totalMatches: 1,
            resolvedMatches: 1,
            liveMatches: 0,
            scheduledMatches: 0,
            finalizedMatches: 1,
            stages: [
              {
                stageId: 'stage-finished',
                stageNumber: 1,
                stageName: 'Fase de grupos',
                totalMatches: 1,
                resolvedMatches: 1,
                liveMatches: 0,
                scheduledMatches: 0,
                finalizedMatches: 1,
                forfeitedMatches: 0,
                segments: [],
              },
            ],
          }
        : demoScaleOverview
          ? demoCompletion
          : completion;
      res.end(JSON.stringify(result));
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
            {
              code: 'player-statistics',
              target: 'player-ranking',
              label: { en: 'Player Statistics' },
              entityGranularity: 'person',
            },
          ],
        }),
      );
      return;
    }
    if (demoScaleOverview && path.endsWith('/public/tables/player-statistics')) {
      res.end(
        JSON.stringify({
          layoutCode: 'player-statistics',
          target: 'player-ranking',
          label: { en: 'Player Statistics' },
          columns: [
            { code: 'player', header: { en: 'Player', es: 'Jugador' }, format: 'text' },
            { code: 'points', header: { en: 'Points' }, format: 'number' },
          ],
          defaultSort: [{ columnCode: 'points', direction: 'desc' }],
          rows: [
            {
              actorId: '00000000-0000-7000-8000-000000000901',
              actorName: 'Player Demo',
              rank: 1,
              sharedRank: false,
              cells: {
                player: { formatted: 'Player Demo' },
                points: { raw: 5, formatted: '5' },
              },
            },
          ],
          projectionVersion: 1,
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
  test('localizes the default player-statistics ticker badge in German', async ({ page }) => {
    demoScaleOverview = true;
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE.replace(/^\/es/, '/de'));

    const ticker = page.locator('.cl-ticker');
    await expect(ticker).toContainText('Spielerstatistiken');
    await expect(ticker).not.toContainText('Player Statistics');
  });

  test('Now titles each card by its group, holds no final when live, and shows a live match at 0–0 as 0 and 0', async ({
    page,
  }) => {
    nowStripOverview = true;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);

    const nowStrip = page.locator('.cl-overview-now');
    const live = nowStrip.locator('.cl-overview-now__item--live .cl-match-card');
    await expect(live.locator('.cl-match-card__heading')).toHaveText(/^Grupo A\s*Partido 3$/);
    await expect(live.locator('.cl-match-card__side .cl-stat-tile__value')).toHaveText(['0', '0']);
    // When a match is live, the now strip excludes both upcoming and final matches.
    await expect(nowStrip.locator('.cl-overview-now__item--upcoming')).toHaveCount(0);
    await expect(nowStrip.locator('.cl-overview-now__item--final')).toHaveCount(0);

    const nextSection = page.locator('section[aria-labelledby="overview-next-heading"]');
    await expect(nextSection).toContainText('Red Star');
    await expect(nextSection).toContainText('Palmira');

    const resultsSection = page.locator('section[aria-labelledby="overview-results-heading"]');
    await expect(resultsSection).toContainText('Huracán');
    await expect(resultsSection).toContainText('Valenciano');
  });

  test('4.1: on the 72-match demo scale, kickoff is in the first viewport and the page stays below 2,650px', async ({
    page,
  }) => {
    demoScaleOverview = true;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);
    await page.evaluate(() => document.fonts.ready);

    const tickerToHeroGap = () =>
      page.evaluate(() => {
        const ticker = document.querySelector('.cl-ticker');
        const hero = document.querySelector('.cl-overview-hero');
        if (!ticker || !hero) throw new Error('Expected overview ticker and hero');
        return hero.getBoundingClientRect().top - ticker.getBoundingClientRect().bottom;
      });
    expect(await tickerToHeroGap()).toBeGreaterThanOrEqual(16);

    const nowStrip = page.locator('.cl-overview-now');
    await expect(nowStrip).toBeVisible();
    const kickoff = nowStrip.locator('.cl-overview-now__item--upcoming').getByText(/16:00/).first();
    await expect(kickoff).toBeVisible();
    await expect(kickoff).toBeInViewport();
    await expect(page.locator('.cl-standings-section tbody tr')).toHaveCount(8);
    const firstUpcoming = nowStrip.locator('.cl-overview-now__item--upcoming');
    await expect(firstUpcoming).toContainText('Red Star');
    await expect(firstUpcoming).toContainText('Corazonistas Bogotá');
    await expect(firstUpcoming.locator('.cl-match-card')).toBeVisible();
    // Now strip holds no final match; the latest finals appear under Latest results instead.
    await expect(nowStrip.locator('.cl-overview-now__item--final')).toHaveCount(0);
    const headingLineHeight = await firstUpcoming
      .locator('.cl-match-card__heading')
      .evaluate((heading) => getComputedStyle(heading).lineHeight);
    expect(headingLineHeight).not.toBe('normal');
    await expect(
      page.locator('section[aria-labelledby="overview-next-heading"] .cl-match-card--compact'),
    ).toHaveCount(3);
    await expect(
      page.locator('section[aria-labelledby="overview-results-heading"] .cl-match-card--compact'),
    ).toHaveCount(4);
    await expect(
      page.locator('.cl-club-filter, .cl-table-tabs, [data-table-sort-button]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-full-layout-code="group-table"]')).toHaveAttribute(
      'href',
      `${PAGE}?tab=group-table`,
    );

    const pageHeight = await page.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    );
    expect(pageHeight).toBeLessThan(2650);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    expect(await tickerToHeroGap()).toBeGreaterThanOrEqual(16);
    const mobileUpcoming = page.locator('.cl-overview-now__item--upcoming');
    await expect(mobileUpcoming).toContainText('Red Star');
    await expect(mobileUpcoming).toContainText('Corazonistas Bogotá');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('overview keeps finals out of now strip, groups upcoming and results by day with day-or-date compact times, renders time-zone note once, and orders ticker by state and time', async ({
    page,
  }) => {
    scheduleDaysOverview = true;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);

    const nowStrip = page.locator('.cl-overview-now');
    await expect(nowStrip.locator('.cl-overview-now__item--final')).toHaveCount(0);
    await expect(nowStrip.locator('.cl-overview-now__item--live')).toContainText('En Vivo Local');
    await expect(nowStrip.locator('.cl-overview-now__item--delayed')).toContainText(
      'Demorado Local',
    );

    const matchesSection = page.locator('section[aria-labelledby="overview-matches-heading"]');
    const tzNote = matchesSection.locator('.cl-time-zone-note');
    await expect(tzNote).toHaveCount(1);
    await expect(tzNote).toContainText('Horarios:');
    await expect(tzNote).toContainText(/GMT-3|Argentina/);

    const nextSection = matchesSection.locator('section[aria-labelledby="overview-next-heading"]');
    const nextHeadings = nextSection.locator('h4.cl-overview-day-heading');
    await expect(nextHeadings).toHaveCount(2);
    await expect(nextHeadings.nth(0)).toContainText(/^Mañana · /);

    const nextTimes = await nextSection
      .locator('.cl-match-card__compact-time time')
      .allTextContents();
    expect(nextTimes.length).toBe(2);
    expect(nextTimes[0]).toMatch(/^Mañana \d{2}:\d{2}$/);
    expect(nextTimes[1]).toMatch(/^\d{1,2}-[\p{L}.]+ \d{2}:\d{2}$/u);
    for (const text of nextTimes) {
      expect(text.trim()).not.toMatch(/^\d{2}:\d{2}$/);
    }

    const resultsSection = matchesSection.locator(
      'section[aria-labelledby="overview-results-heading"]',
    );
    const resultHeadings = resultsSection.locator('h4.cl-overview-day-heading');
    await expect(resultHeadings).toHaveCount(2);
    await expect(resultHeadings.nth(0)).toContainText(/^Ayer · /);
    // Latest final appears first under Últimos resultados.
    await expect(resultsSection.locator('.cl-match-card--compact').first()).toContainText(
      'Último Resultado Local',
    );

    // Ticker orders match items: live -> delayed -> upcoming ascending -> final descending.
    const tickerMatchIds = await page
      .locator('.cl-ticker__track .cl-ticker__item[data-match-id]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-match-id')));
    // The ticker repeats items across copies; take the first 6 distinct sequence entries.
    expect(tickerMatchIds.slice(0, 6)).toEqual([
      '00000000-0000-7000-8000-000000000706', // live
      '00000000-0000-7000-8000-000000000705', // delayed
      '00000000-0000-7000-8000-000000000704', // upcoming tomorrow (ascending)
      '00000000-0000-7000-8000-000000000703', // upcoming +3d (ascending)
      '00000000-0000-7000-8000-000000000702', // final yesterday (descending)
      '00000000-0000-7000-8000-000000000701', // final -3d (descending)
    ]);
  });

  test('the completion summary stays with the full-width overview hero', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);

    const hero = page.locator('.cl-overview-hero');
    await expect(hero.locator('.cl-overview-hero__facts')).toContainText(/9.*12/);
    const figure = page.locator('.cl-completion-figure');
    await expect(figure).toBeVisible();
    await expect(figure).toContainText('9 de 12 partidos jugados');

    await page.waitForFunction(() => {
      const deferredHrefs = Array.from(
        document.querySelectorAll<HTMLMetaElement>('meta[name="copalibre:deferred-stylesheet"]'),
      ).map((meta) => meta.content);
      const links = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      );
      return deferredHrefs.every((href) =>
        links.some((link) => link.getAttribute('href') === href && link.sheet !== null),
      );
    });
    await page.evaluate(() => document.fonts.ready);

    const [heroBox, containerBox, padding] = await Promise.all([
      hero.boundingBox(),
      page.locator('main > .cl-container--public').first().boundingBox(),
      page
        .locator('main > .cl-container--public')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
        }),
    ]);
    expect(heroBox && containerBox).not.toBeNull();
    expect(heroBox?.width).toBeCloseTo((containerBox?.width ?? 0) - padding, 0);
  });

  test('hero status line names finished and active stages, progress card follows now strip with stage/group bars, and ruleset names each stage format', async ({
    page,
  }) => {
    multiStageOverview = true;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);
    await page.waitForFunction(() => {
      const deferredHrefs = Array.from(
        document.querySelectorAll<HTMLMetaElement>('meta[name="copalibre:deferred-stylesheet"]'),
      ).map((meta) => meta.content);
      const links = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      );
      return deferredHrefs.every((href) =>
        links.some((link) => link.getAttribute('href') === href && link.sheet !== null),
      );
    });
    await page.evaluate(() => document.fonts.ready);

    await expect(page.locator('.cl-overview-hero__status')).toHaveText(
      'Fase de grupos finalizada · Copas: 1 de 4 · Copa Oro 1/2 · Copa Plata 0/2',
    );

    const nowStrip = page.locator('.cl-overview-now');
    const completionCard = page.locator('.cl-overview-completion .cl-completion-figure');
    await expect(nowStrip).toBeVisible();
    await expect(completionCard).toBeVisible();
    const [nowBox, completionBox] = await Promise.all([
      nowStrip.boundingBox(),
      completionCard.boundingBox(),
    ]);
    expect(nowBox).not.toBeNull();
    expect(completionBox).not.toBeNull();
    if (nowBox && completionBox) {
      expect(completionBox.y).toBeGreaterThanOrEqual(nowBox.y + nowBox.height - 1);
    }

    await expect(completionCard.locator('progress.cl-progress--overall')).toHaveAttribute(
      'value',
      '9',
    );
    await expect(completionCard.locator('progress')).toHaveCount(7);
    await expect(completionCard).toContainText('Fase de grupos');
    await expect(completionCard).toContainText('Grupo A');
    await expect(completionCard).toContainText('Grupo B');
    await expect(completionCard).toContainText('Copas');
    await expect(completionCard).toContainText('Copa Oro');
    await expect(completionCard).toContainText('Copa Plata');

    const rulesSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Reglamento' }),
    });
    await expect(rulesSection).toContainText(
      'Fase de grupos: todos contra todos y Copas: eliminación simple',
    );
  });

  test('player-statistics tab omits entrant-count and team tiebreak subtitle', async ({ page }) => {
    demoScaleOverview = true;
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(`${PAGE}?tab=player-statistics`);

    await expect(page.getByRole('cell', { name: 'Player Demo' })).toBeVisible();
    await expect(page.locator('#standings .cl-standings-meta')).toHaveCount(0);
  });

  test('the hero names the discipline and lists many venues in a column of their own', async ({
    page,
  }) => {
    factsVenueCount = 5;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);

    const hero = page.locator('.cl-overview-hero');
    await expect(hero.locator('.cl-overview-hero__facts')).toContainText('Hockey sobre patines');
    const column = hero.getByRole('region', { name: 'Sedes' });
    await expect(column.getByRole('button')).toHaveText([
      'Aldo Cantoni',
      'Huarpes',
      'Olimpia',
      'Richet y Zapata',
      'Social',
    ]);
    await expect(hero.locator('.cl-overview-hero__facts').getByRole('button')).toHaveCount(0);
    const [mainBox, columnBox] = await Promise.all([
      hero.locator('.cl-overview-hero__main').boundingBox(),
      column.boundingBox(),
    ]);
    expect(columnBox?.x ?? 0).toBeGreaterThan((mainBox?.x ?? 0) + (mainBox?.width ?? 0) - 1);

    // A mouse opens a venue's public details; the address shows, the operator details never do.
    await column.getByRole('button', { name: 'Aldo Cantoni' }).hover();
    const popup = page.getByRole('dialog', { name: 'Aldo Cantoni' });
    await expect(popup).toContainText('Dirección: Av. Central 100');
    await expect(popup).toContainText('2 canchas');
    await page.mouse.move(0, 0);
    await expect(popup).toHaveCount(0);

    // So does the keyboard, and Escape closes it.
    await column.getByRole('button', { name: 'Huarpes' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Huarpes' })).toContainText('1 cancha');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Huarpes' })).toHaveCount(0);

    const header = page.locator('#standings .cl-standings-meta');
    await expect(header).toContainText(`${demoStandingsPreview.length} participantes`);
    await expect(header).toContainText(
      'Desempate: Puntos › Diferencia de marcador › Promedio de goles …',
    );
  });

  test('two venues show as pills in the facts strip, and stack inside a phone', async ({
    page,
  }) => {
    factsVenueCount = 2;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);

    const facts = page.locator('.cl-overview-hero__facts');
    await expect(facts.getByRole('button')).toHaveText(['Aldo Cantoni', 'Huarpes']);
    await expect(page.getByRole('region', { name: 'Sedes' })).toHaveCount(0);
    await facts.getByRole('button', { name: 'Huarpes' }).click();
    await expect(page.getByRole('dialog', { name: 'Huarpes' })).toContainText('1 cancha');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('the overview passes the semantic accessibility rules', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('h1').first()).toBeVisible();

    await expectNoSeriousSemanticViolations(page);
  });

  test('uses the centered public container at reference widths', async ({ page }) => {
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await expectCenteredPageContainer(page, PAGE);
  });

  test('the overview hero fits a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/events/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' }),
    );
    await page.goto(PAGE);
    await expect(page.locator('.cl-overview-hero__facts')).toContainText(/9.*12/);
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
    await expect(page.locator('.cl-overview-hero__facts')).toContainText(/9.*12/);
    await expect(page.getByText('esta página ya trae todo')).toHaveCount(0);
    await expect(page.locator('[data-ticker-connection-notice]')).toBeHidden();

    await page.unroute('**/events/**');
    await page.route('**/events/**', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.reload();
    await expect(page.locator('[data-ticker-connection-notice]')).toBeVisible();
    await expect(page.locator('[data-ticker-connection-notice]')).toContainText(/conexi[oó]n/i);
  });
});

test.describe('public empty states without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the in-progress overview leads with the now strip without JavaScript', async ({ page }) => {
    await page.goto(PAGE);

    await expect(page.locator('#overview-now-heading')).toBeVisible();
    await expect(page.locator('#overview-honours-heading')).toHaveCount(0);
    const lifecycleBadge = page.locator('.cl-overview-hero__state .cl-badge');
    await expect(lifecycleBadge).toHaveText('En progreso');
    await expect(lifecycleBadge).not.toHaveClass(/cl-badge--live/);
  });

  test('the tournament header links its sections in server-rendered markup', async ({ page }) => {
    await page.goto(PAGE);

    const navigation = page.locator('#cl-public-tournament-nav nav');
    await expect(navigation.getByRole('link', { name: 'Resumen', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(navigation.getByRole('link', { name: 'Partidos', exact: true })).toHaveAttribute(
      'href',
      `${PAGE}/matches`,
    );
    await expect(navigation.getByRole('link', { name: 'Posiciones', exact: true })).toHaveAttribute(
      'href',
      `${PAGE}#standings`,
    );
    await expect(navigation.getByRole('link', { name: 'Cuadros', exact: true })).toHaveAttribute(
      'href',
      `${PAGE}/stages/1`,
    );
    await expect(navigation.getByRole('link', { name: 'Equipos', exact: true })).toHaveAttribute(
      'href',
      `${PAGE}/clubs`,
    );
    await expect(page.locator('#standings')).toBeAttached();
  });

  test('the completed overview leads with the honour board without JavaScript', async ({
    page,
  }) => {
    completedOverview = true;
    await page.goto(PAGE);

    const honours = page.locator('#overview-honours-heading');
    await expect(honours).toBeVisible();
    await expect(page.locator('.cl-overview-honours')).toContainText('Club Andes');
    await expect(page.locator('#overview-now-heading')).toHaveCount(0);
  });

  test('overview and not-found report stay inside a 375px German viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto(PAGE.replace(/^\/es/, '/de'));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.goto('/de/liga-mendocina/tournaments/apertura-2026/stages/1/matches/999999');
    await expect(page.locator('.cl-not-found__card')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('names the next kickoff and links to matches when no match is live', async ({ page }) => {
    noLiveMatches = true;
    await page.goto(PAGE);
    const nowStrip = page.locator('.cl-overview-now');
    await expect(nowStrip).toBeVisible();
    await expect(
      nowStrip.locator('.cl-overview-now__item--upcoming').getByText(/16:00/),
    ).toBeVisible();
    await expect(page.locator(`a[href="${PAGE}/matches"]`).first()).toBeVisible();
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
