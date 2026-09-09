/**
 * The canonical review fixtures.
 *
 * One competition, told consistently, so the live match, the standings that
 * follow from it, the correction that amended it and the bracket it feeds are
 * the same story rather than four unrelated screenshots. A reviewer comparing
 * two compositions is then comparing presentation, not wondering why the scores
 * disagree.
 *
 * These are demonstrations, not records. They never reach a production surface:
 * the compositions that consume them (`0223`) read real projections, and the
 * workbench labels every value here as fixture data.
 *
 * Identifiers follow the repository's contract — UUIDv7 for entities, kebab-case
 * for aliases, and match display numbers (`M01`) as labels rather than as
 * anything a URL resolves.
 */
import type { BracketMatch } from './bracket.js';
import type { LiveDashboard } from './live-state.js';
import type { OverviewMatch, StandingsRowView } from './overview.js';
import type { PublicSeriesState } from './series.js';

/** Best-of-five projection; the production series helper supplies segment states. */
export function referenceSeries(): PublicSeriesState {
  return {
    span: 5,
    resolutionClass: 'best-of',
    games: [
      { number: 1, status: 'finalized', winner: 'home', scores: [16, 12] },
      { number: 2, status: 'finalized', winner: 'away', scores: [10, 16] },
      { number: 3, status: 'finalized', winner: 'home', scores: [16, 14] },
      { number: 4, status: 'in-progress' },
      { number: 5, status: 'scheduled' },
    ],
    homeGamesWon: 2,
    awayGamesWon: 1,
    status: 'undecided',
    explanation: 'Demonstration: first to three game wins; game four is in progress.',
  };
}

/** The eight entrants every fixture below draws from. */
export const REFERENCE_ENTRANTS = [
  {
    id: '01936f4a-0001-7000-8000-000000000001',
    name: 'Meridian Seven',
    abbreviation: 'MER',
    alias: 'meridian-seven',
  },
  {
    id: '01936f4a-0002-7000-8000-000000000002',
    name: 'Ironclad Five',
    abbreviation: 'IRO',
    alias: 'ironclad-five',
  },
  {
    id: '01936f4a-0003-7000-8000-000000000003',
    name: 'Obsidian Rift',
    abbreviation: 'OBS',
    alias: 'obsidian-rift',
  },
  {
    id: '01936f4a-0004-7000-8000-000000000004',
    name: 'Echo Squadron',
    abbreviation: 'ECH',
    alias: 'echo-squadron',
  },
  {
    id: '01936f4a-0005-7000-8000-000000000005',
    name: 'Vermilion Wolves',
    abbreviation: 'VER',
    alias: 'vermilion-wolves',
  },
  {
    id: '01936f4a-0006-7000-8000-000000000006',
    name: 'Aurora Vanguard',
    abbreviation: 'AUR',
    alias: 'aurora-vanguard',
  },
  {
    id: '01936f4a-0007-7000-8000-000000000007',
    name: 'Neon Syndicate',
    abbreviation: 'NEO',
    alias: 'neon-syndicate',
  },
  {
    id: '01936f4a-0008-7000-8000-000000000008',
    name: 'Solaris Prime',
    abbreviation: 'SOL',
    alias: 'solaris-prime',
  },
] as const;

/**
 * The live match: Meridian Seven leading Ironclad Five 3:1, part-way through.
 *
 * Stage 2, not stage 1 — the group above already records these two meeting, and
 * one pairing cannot hold two different results at once.
 *
 * `usingLastKnown` is false because this fixture represents a connected stream;
 * a stale variant is the composition's own state to render, not a second story.
 */
export function referenceLiveDashboard(): LiveDashboard {
  const [home, away] = REFERENCE_ENTRANTS;
  return {
    matches: [
      {
        matchId: '01936f4a-1001-7000-8000-000000000001',
        stageNumber: 2,
        matchNumber: 7,
        state: 'live',
        projectionVersion: 12,
        clockSeconds: 74 * 60,
        sides: [
          {
            entrantId: home.id,
            name: home.name,
            abbreviation: home.abbreviation,
            score: 3,
            state: 'live',
          },
          {
            entrantId: away.id,
            name: away.name,
            abbreviation: away.abbreviation,
            score: 1,
            state: 'live',
          },
        ],
      },
    ],
    standingsVersion: 12,
    usingLastKnown: false,
  };
}

/**
 * Four entrants whose top two are level on points.
 *
 * The tie is real arithmetic, not a screenshot's approximation: Meridian Seven
 * and Obsidian Rift both finish on 6 from 3 played, and the order between them
 * is decided by the head-to-head in `referenceGroupMatches`, not by anything the
 * presentation does.
 *
 * The totals are constrained, which is the point of computing them rather than
 * choosing them: four entrants play six matches, so at most 18 points exist and
 * one drawn match removes one of them. A tie the head-to-head can break also
 * rules out both leaders drawing — a side that lost the head-to-head cannot
 * reach seven from the two matches it has left.
 */
export function referenceStandings(): readonly StandingsRowView[] {
  const [meridian, ironclad, obsidian, echo] = REFERENCE_ENTRANTS;
  return [
    { position: 1, name: meridian.name, abbreviation: meridian.abbreviation, played: 3, points: 6 },
    { position: 2, name: obsidian.name, abbreviation: obsidian.abbreviation, played: 3, points: 6 },
    { position: 3, name: ironclad.name, abbreviation: ironclad.abbreviation, played: 3, points: 4 },
    { position: 4, name: echo.name, abbreviation: echo.abbreviation, played: 3, points: 1 },
  ];
}

/**
 * The results the standings above are computed from, including the head-to-head
 * that separates the tied leaders — Meridian Seven 2:1 Obsidian Rift.
 */
export function referenceGroupMatches(): readonly OverviewMatch[] {
  const [meridian, ironclad, obsidian, echo] = REFERENCE_ENTRANTS;
  const side = (e: (typeof REFERENCE_ENTRANTS)[number], score: number) => ({
    name: e.name,
    abbreviation: e.abbreviation,
    score,
  });
  return [
    {
      matchNumber: 1,
      stageNumber: 1,
      home: side(meridian, 2),
      away: side(obsidian, 1),
      state: 'final',
      startsAt: '2026-09-01T18:00:00.000Z',
    },
    {
      matchNumber: 2,
      stageNumber: 1,
      home: side(ironclad, 2),
      away: side(meridian, 1),
      state: 'final',
      startsAt: '2026-09-01T20:30:00.000Z',
    },
    {
      matchNumber: 3,
      stageNumber: 1,
      home: side(meridian, 3),
      away: side(echo, 0),
      state: 'final',
      startsAt: '2026-09-03T18:00:00.000Z',
    },
    {
      matchNumber: 4,
      stageNumber: 1,
      home: side(obsidian, 2),
      away: side(ironclad, 0),
      state: 'final',
      startsAt: '2026-09-03T20:30:00.000Z',
    },
    {
      matchNumber: 5,
      stageNumber: 1,
      home: side(obsidian, 1),
      away: side(echo, 0),
      state: 'final',
      startsAt: '2026-09-05T18:00:00.000Z',
    },
    {
      matchNumber: 6,
      stageNumber: 1,
      home: side(ironclad, 1),
      away: side(echo, 1),
      state: 'final',
      startsAt: '2026-09-05T20:30:00.000Z',
    },
  ];
}

/** One entry in the audited correction sequence. */
export interface ReferenceAuditEntry {
  readonly eventNumber: number;
  readonly action: 'SCORE_RECORDED' | 'SCORE_CORRECTION';
  readonly actor: string;
  readonly recordedAt: string;
  readonly matchId: string;
  /** Present only on a correction: what the record said before it. */
  readonly previous?: string;
  readonly resulting: string;
  /** Why the correction was made. A correction without one is not auditable. */
  readonly reason?: string;
}

/**
 * A correction, told as two events on one match rather than as a contradiction.
 *
 * This is a different match from the live 3:1 above, deliberately: a record that
 * is simultaneously 1:1, 2:1 and 3:1 is not a story any surface should present,
 * and the reference screenshot's apparent conflict is a screenshot artefact.
 */
export function referenceAuditTrail(): readonly ReferenceAuditEntry[] {
  const matchId = '01936f4a-1002-7000-8000-000000000002';
  return [
    {
      eventNumber: 1048,
      action: 'SCORE_RECORDED',
      actor: 'table_ref_1',
      recordedAt: '2026-09-05T16:42:10.000Z',
      matchId,
      resulting: '1 - 1',
    },
    {
      eventNumber: 1049,
      action: 'SCORE_CORRECTION',
      actor: 'tournament_director',
      recordedAt: '2026-09-05T16:45:32.000Z',
      matchId,
      previous: '1 - 1',
      resulting: '2 - 1',
      reason: 'Goal at 78′ confirmed by the match report',
    },
  ];
}

/**
 * Eight entrants, single elimination: four quarter-finals decided, two
 * semi-finals following from them, and a final still pending its sources.
 *
 * Every advancing slot names the match it came from. Nothing advances because
 * of its score alone, which is the rule the composition must not break either.
 */
export function referenceBracket(): readonly BracketMatch[] {
  const e = REFERENCE_ENTRANTS;
  const pair = (a: number, b: number) =>
    [
      { kind: 'entrant', name: e[a].name, abbreviation: e[a].abbreviation },
      { kind: 'entrant', name: e[b].name, abbreviation: e[b].abbreviation },
    ] as const;
  return [
    {
      matchNumber: 1,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: pair(0, 7),
      scores: [2, 0],
    },
    {
      matchNumber: 2,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: pair(3, 4),
      scores: [1, 3],
    },
    {
      matchNumber: 3,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: pair(2, 5),
      scores: [2, 1],
    },
    {
      matchNumber: 4,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: pair(1, 6),
      scores: [4, 2],
    },
    {
      matchNumber: 5,
      roundNumber: 2,
      branch: 'winners',
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', matchNumber: 1 },
        { kind: 'winner-of', matchNumber: 2 },
      ],
    },
    {
      matchNumber: 6,
      roundNumber: 2,
      branch: 'winners',
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', matchNumber: 3 },
        { kind: 'winner-of', matchNumber: 4 },
      ],
    },
    {
      matchNumber: 7,
      roundNumber: 3,
      branch: 'winners',
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', matchNumber: 5 },
        { kind: 'winner-of', matchNumber: 6 },
      ],
    },
  ];
}

/**
 * A basketball fixture, present so a composition cannot quietly assume football.
 *
 * Its vocabulary is its own: quarters rather than halves, a running score in the
 * dozens, and no clock label a football descriptor would produce. A composition
 * that renders `74'` or a VAR note against this data is reading the wrong
 * descriptor, and that is exactly what this fixture exists to expose.
 */
export function referenceBasketballDashboard(): LiveDashboard {
  const [home, , , , away] = REFERENCE_ENTRANTS;
  return {
    matches: [
      {
        matchId: '01936f4a-1003-7000-8000-000000000003',
        stageNumber: 1,
        matchNumber: 12,
        state: 'live',
        projectionVersion: 41,
        // Third quarter, part-way: segment-relative, not a 90-minute clock.
        clockSeconds: 6 * 60 + 12,
        sides: [
          {
            entrantId: home.id,
            name: home.name,
            abbreviation: home.abbreviation,
            score: 68,
            state: 'live',
          },
          {
            entrantId: away.id,
            name: away.name,
            abbreviation: away.abbreviation,
            score: 71,
            state: 'live',
          },
        ],
      },
    ],
    standingsVersion: 41,
    usingLastKnown: false,
  };
}
