/** Standings fixtures: the ranked rows, the standings table and the winner zones. */

import { type StandingsRowView } from '../overview.js';
import type { PublicTournamentWinnerZoneResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { REFERENCE_ENTRANTS } from './entrants.ts';
import { referenceGroupMatches } from './schedule.ts';

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

/** One entrant's line in the reference standings table. */
export interface ReferenceStandingsRow {
  readonly rank: number;
  readonly entrantId: string;
  readonly name: string;
  readonly abbreviation: string;
  /** True while two entrants still share a position nothing has separated. */
  readonly sharedRank: boolean;
  /** True where a comparator past the first decided this row's position. */
  readonly tieBroken: boolean;
  readonly statistics: Readonly<Record<string, number>>;
}

export interface ReferenceStandingsTable {
  /**
   * Statistic codes in the order a football descriptor declares them. Codes
   * only: the labels are the consuming surface's catalogue entries, and a
   * fixture holding English strings is a fixture that renders English in eight
   * languages.
   */
  readonly columns: readonly string[];
  readonly rows: readonly ReferenceStandingsRow[];
  /** The configured chain, in order. The first that separates two rows decides. */
  readonly tiebreakerCodes: readonly string[];
  /** Which of those actually decided this table — the head-to-head, here. */
  readonly decidingCode: string;
}

/**
 * The tied standings as a full statistical table, computed from the results.
 *
 * Derived rather than written down: every figure below is arithmetic over
 * `referenceGroupMatches()`, so a fixture result that changes changes the table
 * with it, and the two cannot drift into telling different stories. That is the
 * same rule the production surfaces hold to — the projection decides, the
 * presentation renders — applied to the demonstration data.
 *
 * `head-to-head` carries the points each level entrant took from their meeting,
 * which is what makes the decider a column a reader can see rather than a step
 * they have to reconstruct.
 */
export function referenceStandingsTable(): ReferenceStandingsTable {
  const matches = referenceGroupMatches();
  const byName = new Map<string, (typeof REFERENCE_ENTRANTS)[number]>(
    REFERENCE_ENTRANTS.map((entrant) => [entrant.name, entrant]),
  );

  const totals = new Map<
    string,
    { played: number; wins: number; draws: number; losses: number; for: number; against: number }
  >();
  const blank = (): {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    for: number;
    against: number;
  } => ({ played: 0, wins: 0, draws: 0, losses: 0, for: 0, against: 0 });

  for (const match of matches) {
    const home = match.home.score;
    const away = match.away.score;
    if (home === undefined || away === undefined) continue;
    for (const [side, own, other] of [
      [match.home.name, home, away],
      [match.away.name, away, home],
    ] as const) {
      const line = totals.get(side) ?? blank();
      line.played += 1;
      line.for += own;
      line.against += other;
      if (own > other) line.wins += 1;
      else if (own === other) line.draws += 1;
      else line.losses += 1;
      totals.set(side, line);
    }
  }

  const points = (line: ReturnType<typeof blank>): number => line.wins * 3 + line.draws;

  /** Points each entrant took from the matches between the entrants named. */
  const headToHead = (name: string, against: readonly string[]): number =>
    matches.reduce((sum, match) => {
      const home = match.home.score;
      const away = match.away.score;
      if (home === undefined || away === undefined) return sum;
      const isHome = match.home.name === name && against.includes(match.away.name);
      const isAway = match.away.name === name && against.includes(match.home.name);
      if (!isHome && !isAway) return sum;
      const own = isHome ? home : away;
      const other = isHome ? away : home;
      return sum + (own > other ? 3 : own === other ? 1 : 0);
    }, 0);

  const names = [...totals.keys()];
  const levelOn = (value: number): readonly string[] =>
    names.filter((name) => points(totals.get(name) ?? blank()) === value);

  const ordered = names
    .map((name) => {
      const line = totals.get(name) ?? blank();
      const level = levelOn(points(line));
      return {
        name,
        line,
        level,
        headToHead: level.length > 1 ? headToHead(name, level) : 0,
      };
    })
    .sort(
      (a, b) =>
        points(b.line) - points(a.line) ||
        b.headToHead - a.headToHead ||
        b.line.for - b.line.against - (a.line.for - a.line.against),
    );

  return {
    columns: [
      'played',
      'wins',
      'draws',
      'losses',
      'goals-for',
      'goals-against',
      'score-difference',
      'head-to-head',
      'points',
    ],
    tiebreakerCodes: ['points', 'head-to-head', 'score-difference'],
    decidingCode: 'head-to-head',
    rows: ordered.map((entry, index) => {
      const entrant = byName.get(entry.name);
      return {
        rank: index + 1,
        entrantId: entrant?.id ?? entry.name,
        name: entry.name,
        abbreviation: entrant?.abbreviation ?? entry.name.slice(0, 3).toUpperCase(),
        sharedRank: false,
        tieBroken: entry.level.length > 1,
        statistics: {
          played: entry.line.played,
          wins: entry.line.wins,
          draws: entry.line.draws,
          losses: entry.line.losses,
          'goals-for': entry.line.for,
          'goals-against': entry.line.against,
          'score-difference': entry.line.for - entry.line.against,
          'head-to-head': entry.headToHead,
          points: points(entry.line),
        },
      };
    }),
  };
}

/** Two zones: one decisive final and one shared title, to exercise public podium rendering. */
export function referenceWinnerZones(): PublicTournamentWinnerZoneResponse[] {
  const [meridian, ironclad, obsidian, echo, vermilion] = REFERENCE_ENTRANTS;
  return [
    {
      zoneId: '01936f4a-2001-7000-8000-000000000001',
      zoneName: 'Group A',
      champion: {
        entrantId: meridian.id,
        name: meridian.name,
        abbreviation: meridian.abbreviation,
      },
      runnerUp: {
        entrantId: ironclad.id,
        name: ironclad.name,
        abbreviation: ironclad.abbreviation,
      },
      thirdPlace: {
        entrantId: vermilion.id,
        name: vermilion.name,
        abbreviation: vermilion.abbreviation,
      },
    },
    {
      zoneId: '01936f4a-2002-7000-8000-000000000002',
      zoneName: 'Group B',
      champion: {
        entrantId: obsidian.id,
        name: obsidian.name,
        abbreviation: obsidian.abbreviation,
      },
      champions: [obsidian, echo].map((entrant) => ({
        entrantId: entrant.id,
        name: entrant.name,
        abbreviation: entrant.abbreviation,
      })),
    },
  ];
}
