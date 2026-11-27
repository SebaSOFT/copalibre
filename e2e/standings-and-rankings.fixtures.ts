import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { TOKEN_ENDPOINT } from './support/control-login.js';

/**
 * A5 (Control Web) and B2 (public tournament page) rendering declared table
 * layouts dynamically — the discipline's own columns (GF/GC/Dif), a
 * composite fraction cell ("4/5"), switching between declared layouts, and
 * exporting the active one as CSV.
 */

export const ORGANIZATION = 'liga-mendocina';
export const TOURNAMENT_ALIAS = 'apertura-2026';
export const TOURNAMENT = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT_ALIAS}`;
export const PLAYER_PROFILE_PATH = `**${TOURNAMENT}/persons/p-1/public/profile`;
export const STAGE = `${TOURNAMENT}/stages/1`;
export const RESPONSIVE_WIDTHS = [375, 768, 1024, 1440, 188] as const;

/** A real, tiny, decodable PNG (1×1) — for the framed player-photo GET below. */
export const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export const layoutsFixture = {
  layouts: [
    {
      code: 'group-standings-default',
      target: 'group-phase',
      label: 'Group Standings',
      entityGranularity: 'team',
    },
    {
      code: 'top-scorers',
      target: 'player-ranking',
      label: 'Top Scorers',
      entityGranularity: 'person',
    },
    {
      code: 'discipline-drilldown',
      target: 'player-ranking',
      label: 'Discipline Drilldown',
      entityGranularity: 'person',
    },
  ],
};

export const groupStandingsFixture = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  columns: [
    { code: 'name', header: 'Team', format: 'text' },
    { code: 'gf', header: 'GF', description: 'Goals for', format: 'number' },
    { code: 'ga', header: 'GA', shortHeader: 'GC', format: 'number' },
    { code: 'gd', header: 'GD', shortHeader: 'Dif', format: 'number' },
    { code: 'goal-average', header: 'Avg', format: 'decimal-2' },
  ],
  defaultSort: [{ columnCode: 'gd', direction: 'desc' }],
  rows: [
    {
      actorId: 'Talleres',
      entrantId: 'Talleres',
      clubId: 'club-talleres',
      rank: 1,
      sharedRank: false,
      cells: {
        name: { formatted: 'Talleres' },
        gf: { raw: 12, formatted: '12' },
        ga: { raw: 3, formatted: '3' },
        gd: { raw: 9, formatted: '9' },
        'goal-average': { raw: 4, formatted: '4.00' },
      },
    },
    {
      actorId: 'Independiente',
      entrantId: 'Independiente',
      clubId: 'club-independiente',
      rank: 2,
      sharedRank: false,
      cells: {
        name: { formatted: 'Independiente' },
        gf: { raw: 6, formatted: '6' },
        ga: { raw: 5, formatted: '5' },
        gd: { raw: 1, formatted: '1' },
        'goal-average': { raw: 1.2, formatted: '1.20' },
      },
    },
  ],
  projectionVersion: 3,
};

/** The columns the shipped football module declares, so a language it lacks fails here. */
export const footballColumns = (
  JSON.parse(
    readFileSync(
      new URL('../packages/module-catalogue/disciplines/football.json', import.meta.url),
      'utf8',
    ),
  ) as {
    tableLayouts: { code: string; columns: { code: string; header: object; format: string }[] }[];
  }
).tableLayouts
  .find((layout) => layout.code === 'group-standings-default')
  ?.columns.map(({ code, header, format }) => ({ code, header, format }));

export const topScorersFixture = {
  layoutCode: 'top-scorers',
  target: 'player-ranking',
  label: 'Top Scorers',
  columns: [
    { code: 'rank', header: '#', format: 'number' },
    { code: 'player', header: 'Player', format: 'text' },
    { code: 'goals', header: 'Goals', format: 'number' },
    { code: 'cards', header: 'Y/R Cards', format: 'fraction' },
  ],
  defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
  rows: [
    {
      actorId: 'p-1',
      entityId: 'p-1',
      actorName: 'Goleador Uno',
      shirtNumber: 3,
      rank: 1,
      sharedRank: false,
      cells: {
        rank: { raw: 1, formatted: '1' },
        player: { formatted: 'Goleador Uno' },
        goals: { raw: 9, formatted: '9' },
        cards: { formatted: '4/5', numerator: 4, denominator: 5 },
      },
    },
    {
      actorId: 'p-2',
      entityId: 'p-2',
      actorName: 'Goleador Dos',
      shirtNumber: 10,
      rank: 2,
      sharedRank: false,
      cells: {
        rank: { raw: 2, formatted: '2' },
        player: { formatted: 'Goleador Dos' },
        goals: { raw: 5, formatted: '5' },
        cards: { formatted: '1/0', numerator: 1, denominator: 0 },
      },
    },
    {
      actorId: 'p-3',
      entityId: 'p-3',
      actorName: 'León Vega',
      rank: 3,
      sharedRank: false,
      cells: {
        rank: { raw: 3, formatted: '3' },
        player: { formatted: 'León Vega' },
        goals: { raw: 2, formatted: '2' },
        cards: { formatted: '—', numerator: 0, denominator: 0 },
      },
    },
  ],
  projectionVersion: 3,
};

// Same table, filtered to club-independiente: p-2 keeps rank 2, not
// renumbered to 1 by the whole-table-rank rule.
export const topScorersFilteredToIndependiente = {
  ...topScorersFixture,
  rows: [topScorersFixture.rows[1]],
};

export const playerProfileFixture = {
  personId: 'p-1',
  displayName: 'Goleador Uno',
  nationality: 'AR',
  age: 28,
  photoObjectId: 'photo-1',
  competitionHistory: [
    {
      tournamentId: 't-1',
      tournamentName: 'Apertura 2026',
      tournamentAlias: TOURNAMENT_ALIAS,
      teamId: 'tm-1',
      teamName: 'Talleres',
      entrantId: 'Talleres',
      shirtNumber: 3,
      role: 'player',
      entrantAbbreviation: 'TAL',
      disciplineDescriptorId: 'football',
      disciplineDescriptorVersion: '1.2.0',
    },
  ],
  careerStatistics: [
    {
      disciplineDescriptorId: 'football',
      disciplineName: 'Football',
      localizedDisciplineName: { en: 'Football', es: 'Fútbol' },
      statistics: [
        {
          code: 'career-goals',
          label: 'Career goals',
          localizedLabel: { en: 'Career goals', es: 'Goles en carrera' },
          value: 9,
        },
        {
          code: 'career-assists',
          label: 'Career assists',
          localizedLabel: { en: 'Career assists', es: 'Asistencias en carrera' },
          value: 0,
        },
      ],
    },
  ],
};

// A person with a team in the tournament, no recorded shirt number, no upcoming
// match left, and a zero-valued declared career statistic alongside a non-zero one.
export const playerProfileFixtureNoNumber = {
  personId: 'p-3',
  displayName: 'León Vega',
  nationality: 'AR',
  age: 22,
  competitionHistory: [
    {
      tournamentId: 't-1',
      tournamentName: 'Apertura 2026',
      tournamentAlias: TOURNAMENT_ALIAS,
      teamId: 'tm-3',
      teamName: 'San Martín',
      entrantId: 'San Martín',
      role: 'player',
      entrantAbbreviation: 'SMT',
      disciplineDescriptorId: 'football',
      disciplineDescriptorVersion: '1.2.0',
    },
  ],
  careerStatistics: [
    {
      disciplineDescriptorId: 'football',
      disciplineName: 'Football',
      localizedDisciplineName: { en: 'Football', es: 'Fútbol' },
      statistics: [
        {
          code: 'goals',
          label: 'Goals',
          localizedLabel: { en: 'Goals', es: 'Goles' },
          value: 0,
        },
        {
          code: 'assists',
          label: 'Assists',
          localizedLabel: { en: 'Assists', es: 'Asistencias' },
          value: 4,
        },
      ],
    },
  ],
};

// A person with no recorded roster history: both lists come back
// empty, and the surface must state that absence rather than render
// nothing or a zero.
export const playerProfileFixtureNoStats = {
  personId: 'p-2',
  displayName: 'Goleador Dos',
  nationality: 'AR',
  age: 24,
  competitionHistory: [],
  careerStatistics: [],
};

// Tournament-scoped drilldown for the "top-scorers" layout — the
// tournament total keeps the composite `cards` (Y/R Cards) column, but each
// match row carries only the collector-kind `goals` cell, never `cards`.
export const topScorersStatisticsFixture = {
  layoutCode: 'top-scorers',
  label: 'Top Scorers',
  columns: [
    { code: 'player', header: 'Player', format: 'text' },
    { code: 'goals', header: 'Goals', format: 'number' },
    { code: 'cards', header: 'Y/R Cards', format: 'fraction' },
  ],
  tournamentTotal: {
    player: { formatted: 'Goleador Uno' },
    goals: { raw: 9, formatted: '9' },
    cards: { formatted: '4/5', numerator: 4, denominator: 5 },
  },
  matches: [
    {
      stageNumber: 1,
      matchNumber: 1,
      scheduledAt: '2026-01-01T00:00:00.000Z',
      side: 'home' as const,
      opponentName: 'Independiente',
      opponentAbbreviation: 'IND',
      ownScore: 2,
      opponentScore: 1,
      cells: { goals: { raw: 5, formatted: '5' } },
    },
    {
      stageNumber: 1,
      matchNumber: 2,
      scheduledAt: '2026-01-05T21:00:00.000Z',
      side: 'away' as const,
      opponentName: 'San Martín',
      opponentAbbreviation: 'SMT',
      ownScore: 4,
      opponentScore: 3,
      cells: { goals: { raw: 4, formatted: '4' } },
    },
  ],
};

// A second declared person-granularity layout, for the layout-selector test.
export const disciplineDrilldownStatisticsFixture = {
  layoutCode: 'discipline-drilldown',
  label: 'Discipline Drilldown',
  columns: [
    { code: 'player', header: 'Player', format: 'text' },
    { code: 'assists', header: 'Assists', format: 'number' },
  ],
  tournamentTotal: { player: { formatted: 'Goleador Uno' }, assists: { raw: 3, formatted: '3' } },
  matches: [
    {
      stageNumber: 1,
      matchNumber: 1,
      scheduledAt: '2026-01-01T00:00:00.000Z',
      side: 'home' as const,
      opponentName: 'Independiente',
      opponentAbbreviation: 'IND',
      ownScore: 2,
      opponentScore: 1,
      cells: { assists: { raw: 3, formatted: '3' } },
    },
  ],
};

// p-2 has no recorded roster appearance in this tournament: no tournament
// total, no inferred zero-valued match rows.
export const playerStatisticsFixtureNoStats = {
  layoutCode: 'top-scorers',
  label: 'Top Scorers',
  columns: [
    { code: 'player', header: 'Player', format: 'text' },
    { code: 'goals', header: 'Goals', format: 'number' },
    { code: 'cards', header: 'Y/R Cards', format: 'fraction' },
  ],
  matches: [],
};

// p-3 played matches with unrecorded event collectors and zero-denominator fractions.
export const playerStatisticsFixtureZeroes = {
  layoutCode: 'top-scorers',
  label: 'Player Statistics',
  columns: [
    { code: 'pj', header: 'Matches played', shortHeader: 'MP', format: 'number' },
    { code: 'g', header: 'Goals', shortHeader: 'G', format: 'number' },
    { code: 'fd', header: 'Direct free kicks', shortHeader: 'DFK', format: 'fraction' },
    { code: 'az', header: 'Blue cards', shortHeader: 'BC', format: 'number' },
    {
      code: 'azpp',
      header: 'Blue cards per match',
      shortHeader: 'BCpm',
      format: 'decimal-2',
      zeroDisplay: '-',
    },
  ],
  tournamentTotal: {
    pj: { raw: 4, formatted: '4' },
    g: { raw: undefined, formatted: '' },
    fd: { raw: undefined, formatted: '', numerator: 0, denominator: 0 },
    az: { raw: undefined, formatted: '' },
    azpp: { raw: 0, formatted: '-' },
  },
  matches: [],
};

export const liveFixture = {
  matches: [
    {
      matchId: 'm-1',
      stageNumber: 1,
      matchNumber: 1,
      state: 'live',
      projectionVersion: 1,
      sides: [
        { entrantId: 'Talleres', name: 'Talleres', abbreviation: 'TAL', score: 2 },
        { entrantId: 'Independiente', name: 'Independiente', abbreviation: 'IND', score: 1 },
      ],
    },
  ],
};

export async function mockControlApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ tournament, stage, layouts, groupStandings, topScorers, tokenEndpoint }) => {
      window.fetch = async (input) => {
        const url = String(input);

        if (url === tokenEndpoint) {
          return Response.json({ access_token: 'e2e-access-token', expires_in: 3600 });
        }
        if (url === `${tournament}/tables`) return Response.json(layouts);
        if (url === `${stage}/tables/group-standings-default`) return Response.json(groupStandings);
        if (url === `${tournament}/tables/top-scorers`) return Response.json(topScorers);
        if (url === `${stage}/tables/group-standings-default/csv`) {
          return new Response(
            'name,gf,ga,gd,goal-average\nTalleres,12,3,9,4.00\nIndependiente,6,5,1,1.20\n',
            {
              headers: { 'content-type': 'text/csv; charset=utf-8' },
            },
          );
        }
        if (url === `${tournament}/tables/top-scorers/csv`) {
          return new Response('player,goals,cards\nGoleador Uno,9,4/5\n', {
            headers: { 'content-type': 'text/csv; charset=utf-8' },
          });
        }

        return new Response('Not found', { status: 404 });
      };
    },
    {
      tournament: TOURNAMENT,
      stage: STAGE,
      layouts: layoutsFixture,
      groupStandings: groupStandingsFixture,
      topScorers: topScorersFixture,
      tokenEndpoint: TOKEN_ENDPOINT,
    },
  );
}

/**
 * The public tournament page (B2) is server-rendered — its data fetch runs
 * inside the Astro preview process, not the browser, so `window.fetch`
 * mocking cannot reach it. A tiny local HTTP server standing in for the API
 * at the same address `COPALIBRE_API_INTERNAL_URL` defaults to is the only
 * way to control what an SSR page like this one renders in this harness.
 */
export function createStandingsApiServer(getGroupStandingsResponse: () => object): Server {
  const overview = {
    organizationAlias: ORGANIZATION,
    organizationName: 'Liga Mendocina',
    tournamentAlias: TOURNAMENT_ALIAS,
    tournamentName: 'Apertura 2026',
    seasonName: 'Apertura 2026',
    matches: [
      {
        stageNumber: 1,
        round: 1,
        matchNumber: 1,
        status: 'final',
        homeEntrantId: 'Talleres',
        homeName: 'Talleres',
        homeAbbreviation: 'TAL',
        awayEntrantId: 'Independiente',
        awayName: 'Independiente',
        awayAbbreviation: 'IND',
        homeScore: 2,
        awayScore: 1,
        scheduledAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    clubs: [
      {
        clubId: 'club-talleres',
        name: 'Club Atlético Talleres',
        abbreviation: 'TAL',
        alias: 'club-talleres',
      },
      {
        clubId: 'club-independiente',
        name: 'Club Atlético Independiente',
        alias: 'club-independiente',
      },
    ],
    ruleset: {},
  };
  const upcomingMatchForTalleres = {
    stageNumber: 1,
    round: 2,
    matchNumber: 2,
    status: 'upcoming',
    homeEntrantId: 'Talleres',
    homeName: 'Talleres',
    homeAbbreviation: 'TAL',
    awayEntrantId: 'Independiente',
    awayName: 'Independiente',
    awayAbbreviation: 'IND',
    scheduledAt: '2026-01-02T18:00:00.000Z',
    venueName: 'Estadio Central',
  };
  const disciplineDrilldownTableFixture = {
    layoutCode: 'discipline-drilldown',
    target: 'player-ranking',
    label: 'Discipline Drilldown',
    columns: [
      { code: 'rank', header: '#', format: 'number' },
      { code: 'player', header: 'Player', format: 'text' },
      { code: 'assists', header: 'Assists', format: 'number' },
    ],
    defaultSort: [{ columnCode: 'assists', direction: 'desc' }],
    rows: [
      {
        actorId: 'p-1',
        entityId: 'p-1',
        actorName: 'Goleador Uno',
        shirtNumber: 3,
        rank: 1,
        sharedRank: false,
        cells: {
          rank: { raw: 1, formatted: '1' },
          player: { formatted: 'Goleador Uno' },
          assists: { raw: 3, formatted: '3' },
        },
      },
    ],
    projectionVersion: 3,
  };
  const finishedReport = {
    organizationAlias: ORGANIZATION,
    organizationName: 'Liga Mendocina',
    tournamentAlias: TOURNAMENT_ALIAS,
    tournamentName: 'Apertura 2026',
    stageNumber: 1,
    round: 1,
    matchNumber: 1,
    status: 'final',
    homeEntrantId: 'Talleres',
    homeName: 'Talleres',
    homeAbbreviation: 'TAL',
    homeScore: 2,
    awayEntrantId: 'Independiente',
    awayName: 'Independiente',
    awayAbbreviation: 'IND',
    awayScore: 1,
    scheduledAt: '2026-01-01T00:00:00.000Z',
    venueName: 'Estadio Central',
    schedulePublished: true,
    officials: [{ name: 'Marta Referee', roles: ['referee'] }],
    rosters: {
      home: [
        {
          personId: 'person-home',
          number: 9,
          name: 'Sofía Gómez',
          roles: ['forward'],
          onField: true,
        },
      ],
      away: [],
    },
    timeline: [
      {
        eventId: 'event-goal',
        definitionCode: 'goal',
        label: 'Goal',
        occurredAt: '2026-01-01T00:10:00.000Z',
        side: 'home',
        personId: 'person-home',
        payload: {},
      },
    ],
  };
  const upcomingReport = {
    ...finishedReport,
    matchNumber: 2,
    status: 'upcoming',
    scheduledAt: '2026-01-02T18:00:00.000Z',
    officials: [],
    rosters: { home: [], away: [] },
    timeline: [],
  };

  const bracketFixture = {
    matches: [
      {
        matchId: 'm-1',
        bracket: 'winner',
        round: 1,
        position: 1,
        status: 'final',
        slots: [
          { kind: 'entrant', name: 'Talleres', abbreviation: 'TAL', score: 2 },
          { kind: 'entrant', name: 'Independiente', abbreviation: 'IND', score: 1 },
        ],
      },
      {
        matchId: 'm-2',
        bracket: 'winner',
        round: 2,
        position: 2,
        status: 'upcoming',
        slots: [
          { kind: 'winner-of', matchId: '1' },
          { kind: 'winner-of', matchId: '3' },
        ],
      },
    ],
  };

  const organizationTournaments = {
    organizationAlias: ORGANIZATION,
    organizationName: 'Liga Mendocina',
    clubs: [
      {
        clubId: 'club-talleres',
        name: 'Club Atlético Talleres',
        abbreviation: 'TAL',
        alias: 'club-talleres',
      },
      {
        clubId: 'club-independiente',
        name: 'Club Atlético Independiente',
        abbreviation: 'IND',
        alias: 'club-independiente',
      },
    ],
    tournaments: [
      {
        tournamentId: 't-live',
        alias: 'torneo-relampago-2026',
        name: 'Torneo Relámpago 2026',
        status: 'live',
        discipline: { disciplineId: 'disc-fb', name: 'Football' },
        dates: { startedAt: '2026-01-01T00:00:00.000Z' },
      },
      {
        tournamentId: 't-upcoming',
        alias: 'clausura-2026',
        name: 'Clausura 2026',
        status: 'upcoming',
        discipline: { disciplineId: 'disc-fb', name: 'Football' },
        dates: {},
      },
      {
        tournamentId: 't-finished',
        alias: 'apertura-2026',
        name: 'Apertura 2026',
        status: 'finished',
        discipline: { disciplineId: 'disc-fb', name: 'Football' },
        dates: { startedAt: '2026-01-01T00:00:00.000Z', archivedAt: '2026-02-01T00:00:00.000Z' },
        winners: [
          {
            champion: {
              entrantId: 'Talleres',
              name: 'Club Atlético Talleres',
              abbreviation: 'TAL',
            },
            runnerUp: {
              entrantId: 'Independiente',
              name: 'Club Atlético Independiente',
              abbreviation: 'IND',
            },
          },
        ],
      },
    ],
  };

  const PANAMERICANO_ALIAS = 'panamericano-clubes-2025';
  const PANAMERICANO = `/api/organizations/${ORGANIZATION}/tournaments/${PANAMERICANO_ALIAS}`;
  const PANAMERICANO_GROUPS = ['Grupo A', 'Grupo B', 'Grupo C', 'Grupo D', 'Grupo E', 'Grupo F'];
  const panamericanoOverview = {
    organizationAlias: ORGANIZATION,
    organizationName: 'Liga Mendocina',
    tournamentAlias: PANAMERICANO_ALIAS,
    tournamentName: 'Panamericano de Clubes 2025',
    seasonName: '2025',
    matches: [],
    clubs: [
      {
        clubId: 'club-talleres',
        name: 'Club Atlético Talleres',
        abbreviation: 'TAL',
        alias: 'club-talleres',
      },
      {
        clubId: 'club-independiente',
        name: 'Club Atlético Independiente',
        abbreviation: 'IND',
        alias: 'club-independiente',
      },
    ],
    ruleset: {},
  };
  const panamericanoSegments = PANAMERICANO_GROUPS.map((groupName, groupIndex) => ({
    groupId: `group-${groupIndex + 1}`,
    groupName,
    zoneName: 'Grupos',
    rows: Array.from({ length: 4 }, (_, posIndex) => {
      const seed = posIndex * 6 + groupIndex + 1;
      const bandIndex = seed <= 8 ? 0 : seed <= 16 ? 1 : 2;
      const bandLabel =
        bandIndex === 0 ? 'Copa Oro' : bandIndex === 1 ? 'Copa Plata' : 'Copa Bronce';
      const entrantName = `${groupName.replace('Grupo ', 'Equipo ')}${posIndex + 1}`;
      return {
        actorId: `p-${groupIndex}-${posIndex}`,
        entrantId: `e-${groupIndex}-${posIndex}`,
        entrantName,
        rank: posIndex + 1,
        sharedRank: false,
        promotionBandLabel: bandLabel,
        promotionBandIndex: bandIndex,
        promotionSeed: seed,
        cells: {
          rank: { raw: posIndex + 1, formatted: String(posIndex + 1) },
          name: { formatted: entrantName },
          played: { raw: 3, formatted: '3' },
          points: { raw: 9 - posIndex * 2, formatted: String(9 - posIndex * 2) },
        },
      };
    }),
  }));
  const panamericanoStandings = {
    layoutCode: 'group-standings-default',
    target: 'group-phase',
    label: { en: 'Group Standings', es: 'Tabla de posiciones' },
    columns: [
      { code: 'rank', header: '#', format: 'number' },
      { code: 'name', header: { en: 'Team', es: 'Equipo' }, format: 'text' },
      { code: 'played', header: 'PJ', format: 'number' },
      { code: 'points', header: 'Pts', format: 'number' },
    ],
    defaultSort: [{ columnCode: 'points', direction: 'desc' }],
    promotionBands: [
      { index: 0, label: 'Copa Oro', firstSeed: 1, lastSeed: 8 },
      { index: 1, label: 'Copa Plata', firstSeed: 9, lastSeed: 16 },
      { index: 2, label: 'Copa Bronce', firstSeed: 17, lastSeed: 24 },
    ],
    rows: panamericanoSegments.flatMap((segment) => segment.rows),
    segments: panamericanoSegments,
    projectionVersion: 1,
  };

  const apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === `/api/organizations/${ORGANIZATION}/public/tournaments`) {
      res.end(JSON.stringify(organizationTournaments));
      return;
    }
    if (req.url === `${PANAMERICANO}/overview`) {
      res.end(JSON.stringify(panamericanoOverview));
      return;
    }
    if (req.url === `${PANAMERICANO}/stages/1/bracket`) {
      res.end(JSON.stringify({ format: 'round-robin', zones: [] }));
      return;
    }
    if (req.url?.split('?')[0] === `${PANAMERICANO}/matches-view`) {
      res.end(JSON.stringify({ matches: [] }));
      return;
    }
    if (req.url === `${PANAMERICANO}/public/tables`) {
      res.end(JSON.stringify({ layouts: [layoutsFixture.layouts[0]] }));
      return;
    }
    if (req.url === `${PANAMERICANO}/stages/1/public/tables/group-standings-default`) {
      res.end(JSON.stringify(panamericanoStandings));
      return;
    }
    if (req.url === `${TOURNAMENT}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (req.url?.split('?')[0] === `${TOURNAMENT}/matches-view`) {
      const query = new URLSearchParams(req.url.split('?')[1] ?? '');
      const stateParam = query.get('state');
      const allMatches = [...overview.matches, upcomingMatchForTalleres];
      const filtered =
        stateParam && stateParam !== 'all'
          ? allMatches.filter((m) => m.status === stateParam)
          : allMatches;
      res.end(JSON.stringify({ matches: filtered }));
      return;
    }
    if (req.url === `${TOURNAMENT}/live`) {
      res.end(JSON.stringify(liveFixture));
      return;
    }
    if (req.url === `${TOURNAMENT}/public/tables`) {
      res.end(JSON.stringify(layoutsFixture));
      return;
    }
    if (req.url === `${STAGE}/public/tables/group-standings-default`) {
      res.end(JSON.stringify(getGroupStandingsResponse()));
      return;
    }
    if (req.url === `${TOURNAMENT}/public/tables/top-scorers`) {
      res.end(JSON.stringify(topScorersFixture));
      return;
    }
    if (req.url === `${TOURNAMENT}/public/tables/discipline-drilldown`) {
      res.end(JSON.stringify(disciplineDrilldownTableFixture));
      return;
    }
    if (req.url === `${TOURNAMENT}/public/tables/top-scorers?club=club-talleres`) {
      res.end(JSON.stringify(topScorersFixture));
      return;
    }
    if (req.url === `${TOURNAMENT}/public/tables/top-scorers?club=club-independiente`) {
      res.end(JSON.stringify(topScorersFilteredToIndependiente));
      return;
    }
    if (req.url === `${STAGE}/bracket`) {
      res.end(JSON.stringify({ zones: [{ matches: bracketFixture.matches }] }));
      return;
    }
    if (req.url === `${STAGE}/matches/1`) {
      res.end(JSON.stringify(finishedReport));
      return;
    }
    if (req.url === `${STAGE}/matches/2`) {
      res.end(JSON.stringify(upcomingReport));
      return;
    }
    if (req.url === `${TOURNAMENT}/persons/p-1/public/profile`) {
      res.end(JSON.stringify(playerProfileFixture));
      return;
    }
    if (req.url === `${TOURNAMENT}/persons/p-2/public/profile`) {
      res.end(JSON.stringify(playerProfileFixtureNoStats));
      return;
    }
    if (req.url === `${TOURNAMENT}/persons/p-3/public/profile`) {
      res.end(JSON.stringify(playerProfileFixtureNoNumber));
      return;
    }
    if (req.url === `${TOURNAMENT}/persons/p-1/public/statistics?layout=top-scorers`) {
      res.end(JSON.stringify(topScorersStatisticsFixture));
      return;
    }
    if (req.url === `${TOURNAMENT}/persons/p-1/public/statistics?layout=discipline-drilldown`) {
      res.end(JSON.stringify(disciplineDrilldownStatisticsFixture));
      return;
    }
    if (req.url === `${TOURNAMENT}/persons/p-2/public/statistics?layout=top-scorers`) {
      res.end(JSON.stringify(playerStatisticsFixtureNoStats));
      return;
    }
    if (req.url === `${TOURNAMENT}/persons/p-3/public/statistics?layout=top-scorers`) {
      res.end(JSON.stringify(playerStatisticsFixtureZeroes));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });
  return apiServer;
}
