import { createServer, type Server } from 'node:http';
import { expect, gotoTv, test } from './support/tv-ready.js';

/**
 * Localized public & TV labels across organization listing, stage matches view, and TV routes:
 * - Organization page shows localized discipline name ("Hockey sobre patines", not "Rink Hockey")
 * - Fase 1 page shows localized deciding factor ("Decidido por: Promedio de goles") only on
 *   the tiebreak-separated match, localized latestEvent kinds ("Gol", "Gol de tiro libre directo"),
 *   and zero raw "Rule " or English "Goal" strings
 * - Pinned-match TV page in Spanish lists "Gol" and "Gol de tiro libre directo" events
 * - English TV page renders "Away" (not "Visitante") when the away side has no name
 */

const ORGANIZATION = 'fsp-san-juan';
const TOURNAMENT = 'panamericano-clubes-2025';
const TIME_ZONE = 'America/Argentina/San_Juan';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const ES_ORG = `/es/${ORGANIZATION}`;
const ES_STAGE_1 = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}/stages/1`;
const TV_TOURNAMENT = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

const organizations = [
  {
    organizationId: '01900000-0000-7000-8000-000000000001',
    alias: ORGANIZATION,
    name: 'Federación Sanjuanina de Patín',
    primaryLanguage: 'es',
    timezone: TIME_ZONE,
  },
];

const organizationTournaments = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Federación Sanjuanina de Patín',
  tournaments: [
    {
      tournamentId: '01900000-0000-7000-8000-000000000010',
      alias: TOURNAMENT,
      name: 'Panamericano de Clubes 2025',
      status: 'live',
      featured: true,
      discipline: {
        descriptorId: 'rink-hockey',
        version: '1.1.0',
        name: 'Rink Hockey',
        localizedName: {
          en: 'Rink Hockey',
          es: 'Hockey sobre patines',
          de: 'Rollhockey',
        },
      },
    },
  ],
  clubs: [],
};

const plainWinMatch = {
  matchId: 'group-1-m1',
  stageNumber: 1,
  stageName: 'Fase 1',
  zoneName: 'Grupos',
  groupName: 'Grupo A',
  matchNumber: 1,
  round: 1,
  status: 'final' as const,
  homeEntrantId: 'e-cpc',
  homeName: 'Concepción',
  homeAbbreviation: 'CPC',
  homeScore: 4,
  awayEntrantId: 'e-val',
  awayName: 'Valenciano',
  awayAbbreviation: 'VAL',
  awayScore: 2,
  scheduledAt: '2025-11-20T21:00:00.000Z',
  venueName: 'Aldo Cantoni',
  latestEvent: {
    definitionCode: 'goal',
    label: 'Goal',
    labels: { en: 'Goal', es: 'Gol', de: 'Tor' },
    occurredAt: '2025-11-20T21:35:00.000Z',
  },
};

const tiebreakSeparatedMatch = {
  matchId: 'group-1-m2',
  stageNumber: 1,
  stageName: 'Fase 1',
  zoneName: 'Grupos',
  groupName: 'Grupo A',
  matchNumber: 2,
  round: 1,
  status: 'final' as const,
  homeEntrantId: 'e-uvt',
  homeName: 'Uvt',
  homeAbbreviation: 'UVT',
  homeScore: 3,
  awayEntrantId: 'e-hur',
  awayName: 'Huracán',
  awayAbbreviation: 'HUR',
  awayScore: 3,
  scheduledAt: '2025-11-20T22:30:00.000Z',
  venueName: 'Aldo Cantoni',
  decidingFactorCode: 'goal-average',
  decidingFactorRule: 3,
  decidingFactor: 'Rule 3 (Goal Average)',
  latestEvent: {
    definitionCode: 'direct-free-kick-goal',
    label: 'Direct free kick goal',
    labels: {
      en: 'Direct free kick goal',
      es: 'Gol de tiro libre directo',
      de: 'Direkter Freistoßtor',
    },
    occurredAt: '2025-11-20T23:05:00.000Z',
  },
};

const upcomingUnnamedAwayMatch = {
  matchId: 'group-1-m3',
  stageNumber: 1,
  stageName: 'Fase 1',
  zoneName: 'Grupos',
  groupName: 'Grupo A',
  matchNumber: 3,
  round: 2,
  status: 'upcoming' as const,
  homeEntrantId: 'e-cpc',
  homeName: 'Concepción',
  homeAbbreviation: 'CPC',
  scheduledAt: '2025-11-21T21:00:00.000Z',
  venueName: 'Aldo Cantoni',
};

const stage1MatchesViewRows = [plainWinMatch, tiebreakSeparatedMatch, upcomingUnnamedAwayMatch];

const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Federación Sanjuanina de Patín',
  organizationTimeZone: TIME_ZONE,
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Panamericano de Clubes 2025',
  seasonName: '2025',
  status: 'live' as const,
  disciplineName: 'Rink Hockey',
  localizedDisciplineName: {
    en: 'Rink Hockey',
    es: 'Hockey sobre patines',
    de: 'Rollhockey',
  },
  clubs: [],
  ruleset: {},
  matches: [
    {
      matchId: plainWinMatch.matchId,
      stageNumber: 1,
      stageOrdinal: 1,
      stageName: 'Fase 1',
      zoneName: 'Grupos',
      groupName: 'Grupo A',
      matchNumber: 1,
      round: 1,
      status: 'final' as const,
      homeEntrantId: 'e-cpc',
      homeName: 'Concepción',
      homeAbbreviation: 'CPC',
      homeScore: 4,
      awayEntrantId: 'e-val',
      awayName: 'Valenciano',
      awayAbbreviation: 'VAL',
      awayScore: 2,
      scheduledAt: plainWinMatch.scheduledAt,
      venueName: 'Aldo Cantoni',
    },
    {
      matchId: tiebreakSeparatedMatch.matchId,
      stageNumber: 1,
      stageOrdinal: 2,
      stageName: 'Fase 1',
      zoneName: 'Grupos',
      groupName: 'Grupo A',
      matchNumber: 2,
      round: 1,
      status: 'final' as const,
      homeEntrantId: 'e-uvt',
      homeName: 'Uvt',
      homeAbbreviation: 'UVT',
      homeScore: 3,
      awayEntrantId: 'e-hur',
      awayName: 'Huracán',
      awayAbbreviation: 'HUR',
      awayScore: 3,
      scheduledAt: tiebreakSeparatedMatch.scheduledAt,
      venueName: 'Aldo Cantoni',
    },
    {
      matchId: upcomingUnnamedAwayMatch.matchId,
      stageNumber: 1,
      stageOrdinal: 3,
      stageName: 'Fase 1',
      zoneName: 'Grupos',
      groupName: 'Grupo A',
      matchNumber: 3,
      round: 2,
      status: 'scheduled' as const,
      homeEntrantId: 'e-cpc',
      homeName: 'Concepción',
      homeAbbreviation: 'CPC',
      scheduledAt: upcomingUnnamedAwayMatch.scheduledAt,
      venueName: 'Aldo Cantoni',
    },
  ],
};

const groupMatch1Report = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Federación Sanjuanina de Patín',
  organizationTimeZone: TIME_ZONE,
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Panamericano de Clubes 2025',
  stageNumber: 1,
  stageName: 'Fase 1',
  groupName: 'Grupo A',
  stageFormat: 'round-robin',
  matchNumber: 1,
  round: 1,
  status: 'final' as const,
  homeEntrantId: 'e-cpc',
  homeName: 'Concepción',
  homeAbbreviation: 'CPC',
  homeScore: 4,
  awayEntrantId: 'e-val',
  awayName: 'Valenciano',
  awayAbbreviation: 'VAL',
  awayScore: 2,
  scheduledAt: plainWinMatch.scheduledAt,
  venueName: 'Aldo Cantoni',
  schedulePublished: true,
  officials: [],
  rosters: {
    home: [{ personId: 'p-1', number: 7, name: 'Matías Bridge', onField: true }],
    away: [{ personId: 'p-2', number: 9, name: 'Lucas Ordóñez', onField: true }],
  },
  timeline: [
    {
      eventId: 'evt-1',
      definitionCode: 'goal',
      label: 'Goal',
      labels: { en: 'Goal', es: 'Gol' },
      occurredAt: '2025-11-20T21:12:00.000Z',
      sequence: 1,
      side: 'e-cpc',
      personId: 'p-1',
      payload: {},
    },
    {
      eventId: 'evt-2',
      definitionCode: 'direct-free-kick-goal',
      label: 'Direct free kick goal',
      labels: { en: 'Direct free kick goal', es: 'Gol de tiro libre directo' },
      occurredAt: '2025-11-20T21:25:00.000Z',
      sequence: 2,
      side: 'e-val',
      personId: 'p-2',
      payload: {},
    },
  ],
};

const groupMatch3Report = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Federación Sanjuanina de Patín',
  organizationTimeZone: TIME_ZONE,
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Panamericano de Clubes 2025',
  stageNumber: 1,
  stageName: 'Fase 1',
  groupName: 'Grupo A',
  stageFormat: 'round-robin',
  matchNumber: 3,
  round: 2,
  status: 'upcoming' as const,
  homeEntrantId: 'e-cpc',
  homeName: 'Concepción',
  homeAbbreviation: 'CPC',
  scheduledAt: upcomingUnnamedAwayMatch.scheduledAt,
  venueName: 'Aldo Cantoni',
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
};

const liveUnnamedAwayMatch = {
  matchId: upcomingUnnamedAwayMatch.matchId,
  stageNumber: 1,
  stageName: 'Fase 1',
  matchNumber: 3,
  stageOrdinal: 3,
  state: 'live',
  projectionVersion: 1,
  sides: [
    { entrantId: 'e-cpc', name: 'Concepción', abbreviation: 'CPC', score: 1 },
    { entrantId: 'e-away-unnamed', score: 0 },
  ],
};

let apiServer: Server;
let liveUnnamedAway = false;

test.beforeEach(() => {
  liveUnnamedAway = false;
});

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path, query] = (req.url ?? '').split('?');
    if (path === '/api/organizations') {
      res.end(JSON.stringify(organizations));
      return;
    }
    if (path === `/api/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(JSON.stringify(organizationTournaments));
      return;
    }
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/live`) {
      res.end(JSON.stringify({ matches: liveUnnamedAway ? [liveUnnamedAwayMatch] : [] }));
      return;
    }
    if (path === `${BASE}/public/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }
    if (path === `${BASE}/matches-view`) {
      const params = new URLSearchParams(query);
      const stateParam = params.get('state');
      const rows =
        stateParam && stateParam !== 'all'
          ? stage1MatchesViewRows.filter((row) => row.status === stateParam)
          : stage1MatchesViewRows;
      res.end(JSON.stringify({ matches: rows }));
      return;
    }
    if (path === `${BASE}/stages/1/bracket`) {
      res.end(
        JSON.stringify({
          format: 'round-robin',
          zones: [
            { zoneId: 'zone-grupos', zoneName: 'Grupos', format: 'round-robin', matches: [] },
          ],
        }),
      );
      return;
    }
    if (path === `${BASE}/stages/1/matches/1`) {
      res.end(JSON.stringify(groupMatch1Report));
      return;
    }
    if (path === `${BASE}/stages/1/matches/3`) {
      res.end(JSON.stringify(groupMatch3Report));
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

test.describe('localized public and TV labels', () => {
  test('Fase 1 stage page renders Spanish deciding factor and latest event kinds without English leaks, across desktop and mobile viewports', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ES_STAGE_1);
    await expect(page.locator('astro-island').first()).toBeAttached();
    await expect(page.locator('astro-island[ssr]')).toHaveCount(0);

    const plainCard = page.locator(`.cl-match-card[data-match="${plainWinMatch.matchId}"]`);
    const tiebreakCard = page.locator(
      `.cl-match-card[data-match="${tiebreakSeparatedMatch.matchId}"]`,
    );

    await expect(plainCard).toBeVisible();
    await expect(tiebreakCard).toBeVisible();

    await expect(plainCard.locator('.cl-match-card__deciding-factor')).toHaveCount(0);
    await expect(plainCard.locator('.cl-match-card__event')).toHaveText('Gol');

    await expect(tiebreakCard.locator('.cl-match-card__deciding-factor')).toHaveText(
      'Decidido por: Promedio de goles',
    );
    await expect(tiebreakCard.locator('.cl-match-card__event')).toHaveText(
      'Gol de tiro libre directo',
    );

    const allCardsText = (await page.locator('.cl-match-card').allTextContents()).join('\n');
    expect(allCardsText).not.toContain('Rule ');
    expect(allCardsText).not.toContain('Goal Average');
    expect(allCardsText).not.toContain('Direct free kick goal');
    expect(allCardsText).not.toMatch(/\bGoal\b/);

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(desktopOverflow).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(mobileOverflow).toBe(true);
  });

  test('organization page shows localized Spanish discipline name across desktop and mobile viewports', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ES_ORG);

    const badge = page
      .locator(`[data-tournament-alias="${TOURNAMENT}"] .cl-discipline-badge`)
      .first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('Hockey sobre patines');
    await expect(badge).not.toContainText('Rink Hockey');

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(desktopOverflow).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(mobileOverflow).toBe(true);
  });

  test('Spanish TV pinned-match page lists localized Spanish event kinds', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoTv(page, `${TV_TOURNAMENT}/stages/1/matches/1?lang=es`);

    const ticker = page.locator('.tv-event-ticker');
    await expect(ticker).toBeVisible();
    const labels = ticker.locator('.tv-event-ticker__label');
    await expect(labels).toHaveText(['Gol', 'Gol de tiro libre directo']);
    const tickerText = await ticker.textContent();
    expect(tickerText).not.toContain('Direct free kick goal');
    expect(tickerText).not.toMatch(/\bGoal\b/);
  });

  test('English TV page shows "Away" instead of "Visitante" when the away side is unnamed', async ({
    page,
  }) => {
    liveUnnamedAway = true;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoTv(page, `${TV_TOURNAMENT}/stages/1/matches/3?lang=en`);

    const spotlight = page.getByTestId('tv-match-spotlight');
    await expect(spotlight).toBeVisible();
    const awaySide = spotlight.locator('.tv-team-side').nth(1);
    await expect(awaySide.locator('.tv-team-side__name')).toHaveText('Away');
    await expect(awaySide.locator('.tv-team-side__role')).toHaveText('Away');
    await expect(spotlight).not.toContainText('Visitante');
  });
});
