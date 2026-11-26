import { createServer, type Server } from 'node:http';
import { expect, gotoTv, test } from './support/tv-ready.js';

/**
 * Competition context labels across public tournament surfaces and TV:
 * multi-cup stage (`panamericano-clubes-2025` shape in Spanish, `America/Argentina/San_Juan`)
 * verifying context lines, stakes, zone-scoped placement wording, synchronized undecided side
 * forms, drawn knockout advancement (`Avanza`), bracket schedule/qualifier origin/order, and
 * localized TV bracket/pinned headers.
 */

const ORGANIZATION = 'fsp-san-juan';
const TOURNAMENT = 'panamericano-clubes-2025';
const TIME_ZONE = 'America/Argentina/San_Juan';
const BASE = `/api/organizations/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const ES_TOURNAMENT = `/es/${ORGANIZATION}/tournaments/${TOURNAMENT}`;
const TV_TOURNAMENT = `/tv/${ORGANIZATION}/tournaments/${TOURNAMENT}`;

type BracketSide =
  | {
      readonly kind: 'entrant';
      readonly entrantId: string;
      readonly name: string;
      readonly abbreviation: string;
      readonly score?: number;
      readonly from?: { readonly matchId: string; readonly outcome: 'winner' | 'loser' };
      readonly source?: unknown;
    }
  | {
      readonly kind: 'winner-of' | 'loser-of';
      readonly matchId: string;
      readonly nodeKey: string;
      readonly round: number;
      readonly position: number;
    };

function makeEntrantSlot(input: {
  readonly id: string;
  readonly name: string;
  readonly abbr: string;
  readonly score?: number;
  readonly from?: { readonly matchId: string; readonly outcome: 'winner' | 'loser' };
  readonly source?: unknown;
}): BracketSide {
  return {
    kind: 'entrant',
    entrantId: input.id,
    name: input.name,
    abbreviation: input.abbr,
    ...(input.score === undefined ? {} : { score: input.score }),
    ...(input.from === undefined ? {} : { from: input.from }),
    ...(input.source === undefined ? {} : { source: input.source }),
  };
}

function makeFeederSlot(
  kind: 'winner-of' | 'loser-of',
  matchId: string,
  nodeKey: string,
  round: number,
  position: number,
): BracketSide {
  return { kind, matchId, nodeKey, round, position };
}

interface CupConfig {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly offset: number;
  readonly prefix: string;
  readonly qfEntrants: readonly [
    readonly [string, string, string, string],
    readonly [string, string, string, string],
    readonly [string, string, string, string],
    readonly [string, string, string, string],
  ];
  readonly upcomingKeys: ReadonlySet<string>;
}

function buildCupZone(cup: CupConfig) {
  const { zoneId, zoneName, offset, prefix, qfEntrants, upcomingKeys } = cup;
  const id = (key: string) => `${prefix}-${key}`;
  const num = (n: number) => offset + n;
  const isUpcoming = (key: string) => upcomingKeys.has(key);

  const qf1HomeSource = {
    kind: 'qualifier' as const,
    position: 1,
    qualifierLabel: { kind: 'group-rank' as const, rank: 1, groupName: 'Grupo C' },
  };
  const qf1AwaySource = {
    kind: 'qualifier' as const,
    position: 2,
    qualifierLabel: { kind: 'group-rank' as const, rank: 2, groupName: 'Grupo B' },
  };

  const qf2HomeId = prefix === 'oro' ? 'e-uvt' : `e-${prefix}-uvt`;
  const qf2AwayId = prefix === 'oro' ? 'e-huracan' : `e-${prefix}-huracan`;

  const qf1 = {
    matchId: id('SE-R1-M1'),
    nodeKey: 'SE-R1-M1',
    bracket: 'winners',
    round: 1,
    position: 1,
    matchNumber: num(1),
    status: 'finalized',
    winnerEntrantId: `e-${prefix}-1`,
    homeSource: qf1HomeSource,
    awaySource: qf1AwaySource,
    slots: [
      makeEntrantSlot({
        id: `e-${prefix}-1`,
        name: qfEntrants[0][0],
        abbr: qfEntrants[0][1],
        score: 4,
      }),
      makeEntrantSlot({
        id: `e-${prefix}-2`,
        name: qfEntrants[0][2],
        abbr: qfEntrants[0][3],
        score: 2,
      }),
    ],
  };

  const qf2 = {
    matchId: id('SE-R1-M2'),
    nodeKey: 'SE-R1-M2',
    bracket: 'winners',
    round: 1,
    position: 2,
    matchNumber: num(2),
    status: 'finalized',
    winnerEntrantId: qf2AwayId,
    slots: [
      makeEntrantSlot({
        id: qf2HomeId,
        name: qfEntrants[1][0],
        abbr: qfEntrants[1][1],
        score: 3,
      }),
      makeEntrantSlot({
        id: qf2AwayId,
        name: qfEntrants[1][2],
        abbr: qfEntrants[1][3],
        score: 3,
      }),
    ],
  };

  const qf3 = {
    matchId: id('SE-R1-M3'),
    nodeKey: 'SE-R1-M3',
    bracket: 'winners',
    round: 1,
    position: 3,
    matchNumber: num(3),
    status: 'finalized',
    winnerEntrantId: `e-${prefix}-5`,
    slots: [
      makeEntrantSlot({
        id: `e-${prefix}-5`,
        name: qfEntrants[2][0],
        abbr: qfEntrants[2][1],
        score: 5,
      }),
      makeEntrantSlot({
        id: `e-${prefix}-6`,
        name: qfEntrants[2][2],
        abbr: qfEntrants[2][3],
        score: 1,
      }),
    ],
  };

  const qf4 = {
    matchId: id('SE-R1-M4'),
    nodeKey: 'SE-R1-M4',
    bracket: 'winners',
    round: 1,
    position: 4,
    matchNumber: num(4),
    status: 'finalized',
    winnerEntrantId: `e-${prefix}-7`,
    slots: [
      makeEntrantSlot({
        id: `e-${prefix}-7`,
        name: qfEntrants[3][0],
        abbr: qfEntrants[3][1],
        score: 2,
      }),
      makeEntrantSlot({
        id: `e-${prefix}-8`,
        name: qfEntrants[3][2],
        abbr: qfEntrants[3][3],
        score: 0,
      }),
    ],
  };

  const sf1Upcoming = isUpcoming('SE-R2-M1');
  const sf1 = {
    matchId: id('SE-R2-M1'),
    nodeKey: 'SE-R2-M1',
    bracket: 'winners',
    round: 2,
    position: 1,
    matchNumber: num(7),
    status: sf1Upcoming ? 'scheduled' : 'finalized',
    ...(sf1Upcoming ? {} : { winnerEntrantId: `e-${prefix}-1` }),
    homeSource: makeFeederSlot('winner-of', qf1.matchId, 'SE-R1-M1', 1, 1),
    awaySource: makeFeederSlot('winner-of', qf2.matchId, 'SE-R1-M2', 1, 2),
    slots: [
      makeEntrantSlot({
        id: `e-${prefix}-1`,
        name: qfEntrants[0][0],
        abbr: qfEntrants[0][1],
        ...(sf1Upcoming ? {} : { score: 3 }),
        from: { matchId: qf1.matchId, outcome: 'winner' },
      }),
      makeEntrantSlot({
        id: qf2AwayId,
        name: qfEntrants[1][2],
        abbr: qfEntrants[1][3],
        ...(sf1Upcoming ? {} : { score: 1 }),
        from: { matchId: qf2.matchId, outcome: 'winner' },
      }),
    ],
  };

  const sf2Upcoming = isUpcoming('SE-R2-M2');
  const sf2 = {
    matchId: id('SE-R2-M2'),
    nodeKey: 'SE-R2-M2',
    bracket: 'winners',
    round: 2,
    position: 2,
    matchNumber: num(8),
    status: sf2Upcoming ? 'scheduled' : 'finalized',
    ...(sf2Upcoming ? {} : { winnerEntrantId: `e-${prefix}-5` }),
    homeSource: makeFeederSlot('winner-of', qf3.matchId, 'SE-R1-M3', 1, 3),
    awaySource: makeFeederSlot('winner-of', qf4.matchId, 'SE-R1-M4', 1, 4),
    slots: [
      makeEntrantSlot({
        id: `e-${prefix}-5`,
        name: qfEntrants[2][0],
        abbr: qfEntrants[2][1],
        ...(sf2Upcoming ? {} : { score: 2 }),
        from: { matchId: qf3.matchId, outcome: 'winner' },
      }),
      makeEntrantSlot({
        id: `e-${prefix}-7`,
        name: qfEntrants[3][0],
        abbr: qfEntrants[3][1],
        ...(sf2Upcoming ? {} : { score: 0 }),
        from: { matchId: qf4.matchId, outcome: 'winner' },
      }),
    ],
  };

  const finalNode = {
    matchId: id('SE-R3-M1'),
    nodeKey: 'SE-R3-M1',
    bracket: 'winners',
    round: 3,
    position: 1,
    matchNumber: num(12),
    status: 'scheduled',
    homeSource: makeFeederSlot('winner-of', sf1.matchId, 'SE-R2-M1', 2, 1),
    awaySource: makeFeederSlot('winner-of', sf2.matchId, 'SE-R2-M2', 2, 2),
    slots: [
      makeFeederSlot('winner-of', sf1.matchId, 'SE-R2-M1', 2, 1),
      makeFeederSlot('winner-of', sf2.matchId, 'SE-R2-M2', 2, 2),
    ],
  };

  const pl5m1Upcoming = isUpcoming('PL5-R1-M1');
  const pl5m1 = {
    matchId: id('PL5-R1-M1'),
    nodeKey: 'PL5-R1-M1',
    bracket: 'placement',
    round: 1,
    position: 1,
    matchNumber: num(5),
    role: 'places-5-8',
    status: pl5m1Upcoming ? 'scheduled' : 'finalized',
    homeSource: makeFeederSlot('loser-of', qf1.matchId, 'SE-R1-M1', 1, 1),
    awaySource: makeFeederSlot('loser-of', qf2.matchId, 'SE-R1-M2', 1, 2),
    slots: [
      makeEntrantSlot({
        id: `e-${prefix}-2`,
        name: qfEntrants[0][2],
        abbr: qfEntrants[0][3],
        ...(pl5m1Upcoming ? {} : { score: 2 }),
        from: { matchId: qf1.matchId, outcome: 'loser' },
      }),
      makeEntrantSlot({
        id: qf2HomeId,
        name: qfEntrants[1][0],
        abbr: qfEntrants[1][1],
        ...(pl5m1Upcoming ? {} : { score: 1 }),
        from: { matchId: qf2.matchId, outcome: 'loser' },
      }),
    ],
  };

  const pl5m2Upcoming = isUpcoming('PL5-R1-M2');
  const pl5m2 = {
    matchId: id('PL5-R1-M2'),
    nodeKey: 'PL5-R1-M2',
    bracket: 'placement',
    round: 1,
    position: 2,
    matchNumber: num(6),
    role: 'places-5-8',
    status: pl5m2Upcoming ? 'scheduled' : 'finalized',
    homeSource: makeFeederSlot('loser-of', qf3.matchId, 'SE-R1-M3', 1, 3),
    awaySource: makeFeederSlot('loser-of', qf4.matchId, 'SE-R1-M4', 1, 4),
    slots: [
      makeEntrantSlot({
        id: `e-${prefix}-6`,
        name: qfEntrants[2][2],
        abbr: qfEntrants[2][3],
        ...(pl5m2Upcoming ? {} : { score: 3 }),
      }),
      makeEntrantSlot({
        id: `e-${prefix}-8`,
        name: qfEntrants[3][2],
        abbr: qfEntrants[3][3],
        ...(pl5m2Upcoming ? {} : { score: 2 }),
      }),
    ],
  };

  const pl3Upcoming = isUpcoming('placement-3');
  const pl3 = {
    matchId: id('placement-3'),
    nodeKey: 'placement-3',
    bracket: 'placement',
    round: 2,
    position: 1,
    matchNumber: num(9),
    role: 'place-3',
    status: pl3Upcoming ? 'scheduled' : 'finalized',
    homeSource: makeFeederSlot('loser-of', sf1.matchId, 'SE-R2-M1', 2, 1),
    awaySource: makeFeederSlot('loser-of', sf2.matchId, 'SE-R2-M2', 2, 2),
    slots: pl3Upcoming
      ? [
          makeFeederSlot('loser-of', sf1.matchId, 'SE-R2-M1', 2, 1),
          makeFeederSlot('loser-of', sf2.matchId, 'SE-R2-M2', 2, 2),
        ]
      : [
          makeEntrantSlot({
            id: qf2AwayId,
            name: qfEntrants[1][2],
            abbr: qfEntrants[1][3],
            score: 4,
          }),
          makeEntrantSlot({
            id: `e-${prefix}-7`,
            name: qfEntrants[3][0],
            abbr: qfEntrants[3][1],
            score: 2,
          }),
        ],
  };

  const pl5Upcoming = isUpcoming('placement-5');
  const pl5 = {
    matchId: id('placement-5'),
    nodeKey: 'placement-5',
    bracket: 'placement',
    round: 2,
    position: 2,
    matchNumber: num(10),
    role: 'place-5',
    status: pl5Upcoming ? 'scheduled' : 'finalized',
    homeSource: makeFeederSlot('winner-of', pl5m1.matchId, 'PL5-R1-M1', 1, 1),
    awaySource: makeFeederSlot('winner-of', pl5m2.matchId, 'PL5-R1-M2', 1, 2),
    slots: [
      makeFeederSlot('winner-of', pl5m1.matchId, 'PL5-R1-M1', 1, 1),
      makeFeederSlot('winner-of', pl5m2.matchId, 'PL5-R1-M2', 1, 2),
    ],
  };

  const pl7Upcoming = isUpcoming('placement-7');
  const pl7 = {
    matchId: id('placement-7'),
    nodeKey: 'placement-7',
    bracket: 'placement',
    round: 2,
    position: 3,
    matchNumber: num(11),
    role: 'place-7',
    status: pl7Upcoming ? 'scheduled' : 'finalized',
    homeSource: makeFeederSlot('loser-of', pl5m1.matchId, 'PL5-R1-M1', 1, 1),
    awaySource: makeFeederSlot('loser-of', pl5m2.matchId, 'PL5-R1-M2', 1, 2),
    slots: pl7Upcoming
      ? [
          makeFeederSlot('loser-of', pl5m1.matchId, 'PL5-R1-M1', 1, 1),
          makeFeederSlot('loser-of', pl5m2.matchId, 'PL5-R1-M2', 1, 2),
        ]
      : [
          makeEntrantSlot({
            id: qf2HomeId,
            name: qfEntrants[1][0],
            abbr: qfEntrants[1][1],
            score: 1,
          }),
          makeEntrantSlot({
            id: `e-${prefix}-8`,
            name: qfEntrants[3][2],
            abbr: qfEntrants[3][3],
            score: 0,
          }),
        ],
  };

  // Deliberately emit placement nodes out of order to verify deterministic placement sorting.
  const bracketMatches =
    prefix === 'oro'
      ? [qf1, qf2, qf3, qf4, sf1, sf2, finalNode, pl7, pl5m2, pl3, pl5, pl5m1]
      : [qf1, qf2, qf3, qf4, sf1, sf2, finalNode, pl5, pl7, pl5m1, pl3, pl5m2];

  const scheduleTimes: Record<string, string> = {
    'SE-R1-M1': '2025-11-22T15:00:00.000Z',
    'SE-R1-M2': '2025-11-22T17:00:00.000Z',
    'SE-R1-M3': '2025-11-22T19:00:00.000Z',
    'SE-R1-M4': '2025-11-22T21:00:00.000Z',
    'PL5-R1-M1': '2025-11-23T17:00:00.000Z',
    'PL5-R1-M2': '2025-11-23T19:00:00.000Z',
    'SE-R2-M1': '2025-11-23T21:00:00.000Z',
    'SE-R2-M2': '2025-11-23T23:00:00.000Z',
    'placement-3': '2025-11-24T16:45:00.000Z',
    'placement-5': prefix === 'plata' ? '2025-11-23T15:00:00.000Z' : '2025-11-24T18:30:00.000Z',
    'placement-7': '2025-11-24T20:15:00.000Z',
    'SE-R3-M1': '2025-11-24T22:30:00.000Z',
  };

  const toMatchesViewRow = (node: (typeof bracketMatches)[number]) => {
    const s0 = node.slots[0];
    const s1 = node.slots[1];
    return {
      matchId: node.matchId,
      stageNumber: 2,
      stageName: 'Copas',
      zoneName,
      matchNumber: node.matchNumber,
      round: node.round,
      nodeKey: node.nodeKey,
      branch: node.bracket,
      status: node.status === 'finalized' ? ('final' as const) : ('upcoming' as const),
      scheduledAt: scheduleTimes[node.nodeKey],
      venueName: 'Aldo Cantoni',
      ...(node.homeSource ? { homeSource: node.homeSource } : {}),
      ...(node.awaySource ? { awaySource: node.awaySource } : {}),
      ...(s0.kind === 'entrant'
        ? {
            homeEntrantId: s0.entrantId,
            homeName: s0.name,
            homeAbbreviation: s0.abbreviation,
            ...(s0.score === undefined ? {} : { homeScore: s0.score }),
          }
        : {}),
      ...(s1.kind === 'entrant'
        ? {
            awayEntrantId: s1.entrantId,
            awayName: s1.name,
            awayAbbreviation: s1.abbreviation,
            ...(s1.score === undefined ? {} : { awayScore: s1.score }),
          }
        : {}),
    };
  };

  const toReport = (node: (typeof bracketMatches)[number]) => {
    const s0 = node.slots[0];
    const s1 = node.slots[1];
    return {
      organizationAlias: ORGANIZATION,
      organizationName: 'Federación Sanjuanina de Patín',
      organizationTimeZone: TIME_ZONE,
      tournamentAlias: TOURNAMENT,
      tournamentName: 'Panamericano de Clubes 2025',
      stageNumber: 2,
      stageName: 'Copas',
      zoneName,
      stageFormat: 'single-elimination',
      matchNumber: node.matchNumber,
      round: node.round,
      nodeKey: node.nodeKey,
      branch: node.bracket,
      status: node.status === 'finalized' ? ('final' as const) : ('upcoming' as const),
      ...('winnerEntrantId' in node && node.winnerEntrantId !== undefined
        ? { winnerEntrantId: node.winnerEntrantId }
        : {}),
      ...(node.homeSource ? { homeSource: node.homeSource } : {}),
      ...(node.awaySource ? { awaySource: node.awaySource } : {}),
      ...(s0.kind === 'entrant'
        ? {
            homeEntrantId: s0.entrantId,
            homeName: s0.name,
            homeAbbreviation: s0.abbreviation,
            ...(s0.score === undefined ? {} : { homeScore: s0.score }),
          }
        : {}),
      ...(s1.kind === 'entrant'
        ? {
            awayEntrantId: s1.entrantId,
            awayName: s1.name,
            awayAbbreviation: s1.abbreviation,
            ...(s1.score === undefined ? {} : { awayScore: s1.score }),
          }
        : {}),
      scheduledAt: scheduleTimes[node.nodeKey],
      venueName: 'Aldo Cantoni',
      schedulePublished: true,
      officials: [],
      rosters: { home: [], away: [] },
      timeline: [],
    };
  };

  return {
    zone: { zoneId, zoneName, format: 'single-elimination', matches: bracketMatches },
    matchesViewRows: bracketMatches.map(toMatchesViewRow),
    reportsByMatchNumber: new Map(bracketMatches.map((node) => [node.matchNumber, toReport(node)])),
  };
}

const oroCup = buildCupZone({
  zoneId: 'zone-oro',
  zoneName: 'Copa Oro',
  offset: 0,
  prefix: 'oro',
  qfEntrants: [
    ['Concepción', 'CPC', 'Valenciano', 'VAL'],
    ['Uvt', 'UVT', 'Huracán', 'HUR'],
    ['Banco Hispano', 'BHI', 'San Lorenzo', 'SLO'],
    ['Olimpia', 'OLI', 'Estudiantil', 'EST'],
  ],
  // 8 upcoming in Copa Oro
  upcomingKeys: new Set([
    'PL5-R1-M1',
    'PL5-R1-M2',
    'SE-R2-M1',
    'SE-R2-M2',
    'placement-3',
    'placement-5',
    'placement-7',
    'SE-R3-M1',
  ]),
});

const plataCup = buildCupZone({
  zoneId: 'zone-plata',
  zoneName: 'Copa Plata',
  offset: 12,
  prefix: 'plata',
  qfEntrants: [
    ['Andes Talleres', 'TAL', 'Leonardo Murialdo', 'MUR'],
    ['Casa de Italia', 'CDI', 'Palmira', 'PAL'],
    ['Petroleros', 'PET', 'IMPSA', 'IMP'],
    ['Maipú Giol', 'GIO', 'San Martín', 'SMA'],
  ],
  // 2 upcoming in Copa Plata (`placement-5` = match 22, `SE-R3-M1` = match 24)
  upcomingKeys: new Set(['placement-5', 'SE-R3-M1']),
});

const bronceCup = buildCupZone({
  zoneId: 'zone-bronce',
  zoneName: 'Copa Bronce',
  offset: 24,
  prefix: 'bronce',
  qfEntrants: [
    ['Lomas de Rivadavia', 'LOM', 'Social San Juan', 'SSJ'],
    ['Sarmiento', 'SAR', 'Richet Zapata', 'RIC'],
    ['Abernathy', 'ABE', 'Barrio Rivadavia', 'BRI'],
    ['Huarpes', 'HUA', 'Colón Junior', 'COL'],
  ],
  // 2 upcoming in Copa Bronce (`PL5-R1-M1` = match 29, `SE-R3-M1` = match 36)
  upcomingKeys: new Set(['PL5-R1-M1', 'SE-R3-M1']),
});

const groupMatch1Row = {
  matchId: 'group-1-m1',
  stageNumber: 1,
  stageName: 'Fase de grupos',
  zoneName: 'Grupos',
  groupName: 'Grupo A',
  matchNumber: 1,
  round: 1,
  status: 'final' as const,
  homeEntrantId: 'e-oro-1',
  homeName: 'Concepción',
  homeAbbreviation: 'CPC',
  homeScore: 4,
  awayEntrantId: 'e-oro-2',
  awayName: 'Valenciano',
  awayAbbreviation: 'VAL',
  awayScore: 2,
  scheduledAt: '2025-11-20T21:00:00.000Z',
  venueName: 'Aldo Cantoni',
};

const groupMatch1Report = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Federación Sanjuanina de Patín',
  organizationTimeZone: TIME_ZONE,
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Panamericano de Clubes 2025',
  stageNumber: 1,
  stageName: 'Fase de grupos',
  groupName: 'Grupo A',
  stageFormat: 'round-robin',
  matchNumber: 1,
  round: 1,
  status: 'final' as const,
  homeEntrantId: 'e-oro-1',
  homeName: 'Concepción',
  homeAbbreviation: 'CPC',
  homeScore: 4,
  awayEntrantId: 'e-oro-2',
  awayName: 'Valenciano',
  awayAbbreviation: 'VAL',
  awayScore: 2,
  scheduledAt: '2025-11-20T21:00:00.000Z',
  venueName: 'Aldo Cantoni',
  schedulePublished: true,
  officials: [],
  rosters: { home: [], away: [] },
  timeline: [],
};

const stage2AllMatchesViewRows = [
  ...oroCup.matchesViewRows,
  ...plataCup.matchesViewRows,
  ...bronceCup.matchesViewRows,
];

const allMatchesViewRows = [groupMatch1Row, ...stage2AllMatchesViewRows];

const stage2Reports = new Map([
  ...oroCup.reportsByMatchNumber,
  ...plataCup.reportsByMatchNumber,
  ...bronceCup.reportsByMatchNumber,
]);

const organizations = [
  {
    organizationId: '01900000-0000-7000-8000-000000000001',
    alias: ORGANIZATION,
    name: 'Federación Sanjuanina de Patín',
    primaryLanguage: 'es',
    timezone: TIME_ZONE,
  },
];

// Put stage 2 live match first, earliest upcoming = Copa Plata `placement-5` (match 22),
// and include Copa Oro sibling nodes so TV overview context computes zone-scoped placement labels.
const overview = {
  organizationAlias: ORGANIZATION,
  organizationName: 'Federación Sanjuanina de Patín',
  organizationTimeZone: TIME_ZONE,
  tournamentAlias: TOURNAMENT,
  tournamentName: 'Panamericano de Clubes 2025',
  seasonName: '2025',
  status: 'live' as const,
  clubs: [],
  ruleset: {},
  matches: [
    // Live match in stage 2 (featured by TV default stage selection)
    {
      matchId: 'oro-SE-R2-M1',
      stageNumber: 2,
      stageOrdinal: 7,
      stageName: 'Copas',
      zoneName: 'Copa Oro',
      matchNumber: 1,
      round: 2,
      nodeKey: 'SE-R2-M1',
      status: 'live' as const,
      homeEntrantId: 'e-oro-1',
      homeName: 'Concepción',
      homeAbbreviation: 'CPC',
      homeScore: 1,
      awayEntrantId: 'e-huracan',
      awayName: 'Huracán',
      awayAbbreviation: 'HUR',
      awayScore: 1,
      scheduledAt: '2025-11-23T21:00:00.000Z',
      venueName: 'Aldo Cantoni',
    },
    // Copa Plata 5th-place game: earliest upcoming match -> lands in overview "Ahora" strip
    ...plataCup.matchesViewRows
      .filter((row) => row.matchNumber === 22)
      .map((row) => ({
        ...row,
        stageOrdinal: row.matchNumber,
        matchNumber: 1,
      })),
    // Remaining Copa Oro matches (so pinned match 5 has full `zoneNodeKeys` and `sourceFinalRound`)
    ...oroCup.matchesViewRows
      .filter((row) => row.matchNumber !== 7)
      .map((row) => ({
        ...row,
        stageOrdinal: row.matchNumber,
        matchNumber: 1,
      })),
  ],
};

const completion = {
  totalMatches: allMatchesViewRows.length,
  resolvedMatches: allMatchesViewRows.filter((m) => m.status === 'final').length,
  liveMatches: 1,
  scheduledMatches: allMatchesViewRows.filter((m) => m.status === 'upcoming').length,
  finalizedMatches: allMatchesViewRows.filter((m) => m.status === 'final').length,
  forfeitedMatches: 0,
  stages: [
    {
      stageNumber: 1,
      stageName: 'Fase de grupos',
      totalMatches: 1,
      resolvedMatches: 1,
      liveMatches: 0,
      scheduledMatches: 0,
      finalizedMatches: 1,
      forfeitedMatches: 0,
    },
    {
      stageNumber: 2,
      stageName: 'Copas',
      totalMatches: stage2AllMatchesViewRows.length,
      resolvedMatches: stage2AllMatchesViewRows.filter((m) => m.status === 'final').length,
      liveMatches: 1,
      scheduledMatches: stage2AllMatchesViewRows.filter((m) => m.status === 'upcoming').length,
      finalizedMatches: stage2AllMatchesViewRows.filter((m) => m.status === 'final').length,
      forfeitedMatches: 0,
    },
  ],
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const [path, query] = (req.url ?? '').split('?');
    if (path === '/api/organizations') {
      res.end(JSON.stringify(organizations));
      return;
    }
    if (path === `${BASE}/overview`) {
      res.end(JSON.stringify(overview));
      return;
    }
    if (path === `${BASE}/completion`) {
      res.end(JSON.stringify(completion));
      return;
    }
    if (path === `${BASE}/live`) {
      res.end(JSON.stringify({ matches: [] }));
      return;
    }
    if (path === `${BASE}/public/tables`) {
      res.end(JSON.stringify({ layouts: [] }));
      return;
    }
    if (path === `${BASE}/matches-view`) {
      const params = new URLSearchParams(query);
      const stageParam = params.get('stageNumber');
      const stateParam = params.get('state');
      let rows =
        stageParam === '1'
          ? [groupMatch1Row]
          : stageParam === '2'
            ? stage2AllMatchesViewRows
            : allMatchesViewRows;
      if (stateParam && stateParam !== 'all') {
        rows = rows.filter((row) => row.status === stateParam);
      }
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
    if (path === `${BASE}/stages/2/bracket`) {
      res.end(
        JSON.stringify({
          format: 'single-elimination',
          zones: [oroCup.zone, plataCup.zone, bronceCup.zone],
        }),
      );
      return;
    }
    if (path === `${BASE}/stages/1/matches/1`) {
      res.end(JSON.stringify(groupMatch1Report));
      return;
    }
    const stage2Match = new RegExp(`^${BASE}/stages/2/matches/(\\d+)$`).exec(path ?? '');
    if (stage2Match) {
      const report = stage2Reports.get(Number(stage2Match[1]));
      if (report) {
        res.end(JSON.stringify(report));
        return;
      }
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test.describe('public competition context labels', () => {
  test('match reports show distinct context lines, organizer stage breadcrumbs, and stakes across cups and group stage', async ({
    page,
  }) => {
    await page.goto(`${ES_TOURNAMENT}/stages/2/matches/12`);
    await expect(page.locator('.cl-page-header__description')).toContainText(
      'Copas · Copa Oro · Final · Partido 12',
    );
    await expect(page.locator('.cl-breadcrumb')).toContainText('Copas');
    await expect(page.locator('.cl-breadcrumb')).toContainText('Copa Oro · Final · Partido 12');
    await expect(page.locator('.cl-match-stakes')).toContainText('Define el campeón de Copa Oro');

    await page.goto(`${ES_TOURNAMENT}/stages/2/matches/36`);
    await expect(page.locator('.cl-page-header__description')).toContainText(
      'Copas · Copa Bronce · Final · Partido 36',
    );
    await expect(page.locator('.cl-breadcrumb')).toContainText('Copas');
    await expect(page.locator('.cl-breadcrumb')).toContainText('Copa Bronce · Final · Partido 36');
    await expect(page.locator('.cl-match-stakes')).toContainText(
      'Define el campeón de Copa Bronce',
    );

    // Group match: organizer stage name + explicit group, implicit zone "Grupos" omitted.
    await page.goto(`${ES_TOURNAMENT}/stages/1/matches/1`);
    const groupDesc = await page.locator('.cl-page-header__description').textContent();
    expect(groupDesc).toContain('Fase de grupos · Grupo A · Ronda 1 · Partido 1');
    expect(groupDesc).not.toContain('Grupos · Grupo A');
    await expect(page.locator('.cl-breadcrumb')).toContainText('Fase de grupos');
    await expect(page.locator('.cl-breadcrumb')).toContainText('Grupo A · Ronda 1 · Partido 1');
    await expect(page.locator('.cl-match-stakes')).toHaveCount(0);
  });

  test('placement cards and overview strip show distinct feeders, single form, zone-scoped ranges, and zone prefix outside zone sections', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ES_TOURNAMENT}/matches?stageNumber=2&state=upcoming&view=cards`);

    // 5th-place card in Copa Oro has distinct feeder sides (1) and (2).
    const fifthCard = page.locator('.cl-match-card[data-match="oro-placement-5"]');
    await expect(fifthCard).toBeVisible();
    const fifthSides = fifthCard.locator('.cl-match-card__side [data-testid="entrant-name"]');
    await expect(fifthSides).toHaveText([
      'Ganador de 5º al 8º puesto (1)',
      'Ganador de 5º al 8º puesto (2)',
    ]);

    // Copa Oro Final card uses one consistent form on both undecided sides (both long or both short).
    const finalCard = page.locator('.cl-match-card[data-match="oro-SE-R3-M1"]');
    await expect(finalCard).toBeVisible();
    const finalSideTexts = (
      await finalCard.locator('.cl-match-card__side [data-testid="entrant-name"]').allInnerTexts()
    ).map((text) => text.trim());
    expect(
      finalSideTexts[0] === 'Ganador de Semifinal 1' &&
        finalSideTexts[1] === 'Ganador de Semifinal 2'
        ? 'both-long'
        : finalSideTexts[0] === 'G Semi 1' && finalSideTexts[1] === 'G Semi 2'
          ? 'both-short'
          : finalSideTexts,
    ).toMatch(/^both-(?:long|short)$/);

    // Copa Bronce 5th-8th semi-final counts places within Copa Bronce only ("5º al 8º puesto", never "5–16").
    const broncePl5Card = page.locator('.cl-match-card[data-match="bronce-PL5-R1-M1"]');
    await expect(broncePl5Card.locator('.cl-match-card__heading')).toContainText('5º al 8º puesto');
    await expect(broncePl5Card).not.toContainText('5–16');
    await expect(broncePl5Card).not.toContainText('5º al 16º');

    // Copa Bronce 5th-8th semi-final match report subtitle.
    await page.goto(`${ES_TOURNAMENT}/stages/2/matches/29`);
    await expect(page.locator('.cl-page-header__description')).toContainText(
      'Copas · Copa Bronce · Semifinal 5º al 8º puesto · Partido 29',
    );

    // Outside a zone's own section (overview "Ahora" strip), Copa Plata 5th-place carries zone prefix.
    await page.goto(ES_TOURNAMENT);
    const nowStrip = page.locator('.cl-overview-now');
    await expect(
      nowStrip.locator('.cl-match-card[data-match="plata-placement-5"] .cl-match-card__heading'),
    ).toContainText('Copa Plata · 5º puesto');
  });

  test('drawn knockout match shows Avanza on the advancing side in bracket and match report, with stakes on quarter-finals', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ES_TOURNAMENT}/stages/2`);

    const fullCanvas = page.locator('.cl-bracket-stage__canvas[data-density="full"]').first();

    // Uvt 3–3 Huracán: Huracán gets "Avanza", Uvt is marked eliminated.
    const drawnNode = fullCanvas.locator('[data-match="2"]');
    const huracanSlot = drawnNode.locator('li', { hasText: 'Huracán' });
    const uvtSlot = drawnNode.locator('li', { hasText: 'Uvt' });
    await expect(huracanSlot.locator('.cl-advancing-badge')).toHaveText('Avanza');
    const desktopHurNameBox = await huracanSlot
      .locator('[data-testid="entrant-name"]')
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(desktopHurNameBox.scrollWidth).toBeLessThanOrEqual(desktopHurNameBox.clientWidth);
    await expect(uvtSlot).toHaveClass(/cl-slot--eliminated/);
    await expect(uvtSlot.locator('.cl-advancing-badge')).toHaveCount(0);

    // Score-win match (4–2) shows no "Avanza" badge.
    const scoreWinNode = fullCanvas.locator('[data-match="1"]');
    await expect(scoreWinNode.locator('.cl-advancing-badge')).toHaveCount(0);

    // On a 390px phone viewport, compact cards show the advancing icon, accessible label, eliminated muted state, and "G Semi 1" without clipping or squishing "HUR".
    await page.setViewportSize({ width: 390, height: 844 });
    const compactCanvas = page.locator('.cl-bracket-stage__canvas[data-density="compact"]').first();
    await expect(compactCanvas).toBeVisible();
    const compactDrawnCard = compactCanvas.locator('.cl-match-compact[data-match="2"]');
    await expect(compactDrawnCard).toHaveAttribute('aria-label', /Avanza/);
    const compactHurRow = compactDrawnCard.locator('li', { hasText: 'HUR' });
    const compactUvtRow = compactDrawnCard.locator('li', { hasText: 'UVT' });
    await expect(compactHurRow.locator('.cl-match-compact__advancing')).toBeVisible();
    await expect(compactUvtRow).toHaveClass(/cl-match-compact__eliminated/);
    await expect(compactUvtRow.locator('.cl-match-compact__advancing')).toHaveCount(0);
    const hurNameBox = await compactHurRow
      .locator('.cl-match-compact__name')
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(hurNameBox.scrollWidth).toBeLessThanOrEqual(hurNameBox.clientWidth);
    const drawnCardClip = await compactDrawnCard.evaluate((card) => ({
      scrollHeight: card.scrollHeight,
      clientHeight: card.clientHeight,
    }));
    expect(drawnCardClip.scrollHeight).toBeLessThanOrEqual(drawnCardClip.clientHeight + 1);
    const compactFinalSides = compactCanvas.locator(
      '.cl-match-compact[data-match="12"] .cl-match-compact__name',
    );
    await expect(compactFinalSides).toHaveText(['G Semi 1', 'G Semi 2']);
    const pendingNameChecks = await compactFinalSides.evaluateAll((els) =>
      els.map((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })),
    );
    for (const check of pendingNameChecks) {
      expect(check.scrollWidth).toBeLessThanOrEqual(check.clientWidth + 1);
    }

    // Drawn match report hero shows "Avanza" on Huracán and eliminated state on Uvt.
    await page.goto(`${ES_TOURNAMENT}/stages/2/matches/2`);
    const hero = page.locator('.cl-match-hero');
    await expect(hero.locator('.cl-scoreboard__side--away .cl-advancing-badge')).toHaveText(
      'Avanza',
    );
    await expect(hero.locator('.cl-scoreboard__side--home')).toHaveClass(
      /cl-scoreboard__side--eliminated/,
    );
    await expect(hero.locator('.cl-scoreboard__side--home .cl-advancing-badge')).toHaveCount(0);

    // Quarter-final 1 (4–2): no "Avanza" badge, and shows both winner and loser stakes with scheduled times.
    await page.goto(`${ES_TOURNAMENT}/stages/2/matches/1`);
    await expect(page.locator('.cl-match-hero .cl-advancing-badge')).toHaveCount(0);
    const stakes = page.locator('.cl-match-stakes__item');
    await expect(stakes).toHaveCount(2);
    await expect(stakes.nth(0)).toContainText('El ganador juega Copa Oro · Semifinal, ');
    await expect(stakes.nth(0)).toContainText('18:00');
    await expect(stakes.nth(1)).toContainText(
      'El perdedor juega Copa Oro · Semifinal 5º al 8º puesto, ',
    );
    await expect(stakes.nth(1)).toContainText('14:00');
  });

  test('names each cup zone in the bracket, with schedule, venue and qualifier origin on its nodes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ES_TOURNAMENT}/stages/2`);

    const canvases = page.locator('.cl-bracket-stage__canvas[data-density="full"]');
    await expect(canvases).toHaveCount(3);
    await expect(canvases.nth(0).locator('.cl-bracket-stage__band')).toHaveText('Copa Oro');
    await expect(canvases.nth(1).locator('.cl-bracket-stage__band')).toHaveText('Copa Plata');
    await expect(canvases.nth(2).locator('.cl-bracket-stage__band')).toHaveText('Copa Bronce');
    await expect(
      page.locator('.cl-bracket-stage__band', { hasText: 'Cuadro principal' }),
    ).toHaveCount(0);

    // Upcoming semi-final node in Copa Oro shows date/time in America/Argentina/San_Juan (18:00) and venue.
    const oroSf1 = canvases.nth(0).locator('[data-match="7"]');
    const sf1Schedule = oroSf1.locator('.cl-match-node__schedule');
    await expect(sf1Schedule).toContainText('23-nov');
    await expect(sf1Schedule).toContainText('18:00');
    await expect(sf1Schedule).toContainText('Aldo Cantoni');

    // Decided qualifier slot in QF1 shows secondary origin label "1.° Grupo C".
    const oroQf1 = canvases.nth(0).locator('[data-match="1"]');
    await expect(oroQf1.locator('.cl-slot__origin').first()).toHaveText('1.° Grupo C');

    // Bracket Final node with two pending feeders keeps both sides in the same form (never mixed).
    const oroFinalNode = canvases.nth(0).locator('[data-match="12"]');
    await expect(oroFinalNode.locator('astro-island[ssr]')).toHaveCount(0);
    const finalNodeSides = (
      await oroFinalNode.locator('[data-testid="entrant-name"]').allInnerTexts()
    ).map((text) => text.trim());
    expect(
      finalNodeSides[0] === 'Ganador de Semifinal 1' &&
        finalNodeSides[1] === 'Ganador de Semifinal 2'
        ? 'both-long'
        : finalNodeSides[0] === 'G Semi 1' && finalNodeSides[1] === 'G Semi 2'
          ? 'both-short'
          : finalNodeSides,
    ).toMatch(/^both-(?:long|short)$/);

    // Deterministic placement order across Copa Oro and Copa Plata despite shuffled API arrays.
    const expectedOrder = ['3º puesto', '5º al 8º puesto', '5º puesto', '7º puesto'];
    const placementLists = page.locator('.cl-placement-games');
    await expect(placementLists).toHaveCount(3);
    for (const index of [0, 1]) {
      await expect(placementLists.nth(index).locator('.cl-placement-games__role')).toHaveText(
        expectedOrder,
      );
    }
  });

  test('TV bracket renders localized Spanish headings without raw branch codes, and pinned header uses competition context', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoTv(page, `${TV_TOURNAMENT}/stages/2/matches/5?lang=es`);

    // Pinned spotlight header reads competition context with secondary match number, never "Etapa 2 · Partido 5".
    const spotlightStage = page.locator('.tv-match-spotlight__stage');
    await expect(spotlightStage).toContainText('Copas · Copa Oro · Semifinal 5º al 8º puesto');
    await expect(spotlightStage.locator('.tv-match-spotlight__match-number')).toHaveText(
      'Partido 5',
    );
    await expect(spotlightStage).not.toContainText('Etapa 2');

    // Open the TV bracket tab and inspect localized branch & round headings.
    await page.getByRole('button', { name: 'Llaves' }).click();
    const tvBracket = page.getByTestId('tv-bracket');
    await expect(tvBracket).toBeVisible();
    await expect(tvBracket.getByRole('heading', { name: 'Copa Oro', exact: true })).toBeVisible();
    await expect(tvBracket.getByText('Copa Oro · Cuartos de final').first()).toBeVisible();
    await expect(
      tvBracket.getByText('Partidos de clasificación · 5º al 8º puesto').first(),
    ).toBeVisible();
    const bracketText = await tvBracket.textContent();
    expect(bracketText).not.toMatch(/\bwinners\b/i);
    expect(bracketText).not.toMatch(/\bplacement\b/i);
  });
});
