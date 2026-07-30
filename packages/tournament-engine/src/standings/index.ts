import type { EntrantValues, TiebreakPipeline, TraceNode } from '@copalibre/rules';
import { resolveTiebreak } from '@copalibre/rules';
import type { GeneratedMatch } from '../types.js';

/**
 * Standings assembly. This module computes *accounting parameters* only and
 * delegates every comparison to `@copalibre/rules`, so the explanation trace the
 * A5 screen (phase 0017) renders is the trace produced by the pipeline that
 * actually ran — not a parallel ranking implementation that could drift from it.
 */

export interface RecordedOutcome {
  readonly matchId: string;
  /** Absent for a draw. */
  readonly winnerEntrantId?: string;
  readonly scores: readonly { readonly entrantId: string; readonly score: number }[];
}

export interface PointsRules {
  readonly win: number;
  readonly draw: number;
  readonly loss: number;
}

export const DEFAULT_POINTS: PointsRules = { win: 3, draw: 1, loss: 0 };

export interface EntrantAccounting {
  readonly entrantId: string;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly scoreFor: number;
  readonly scoreAgainst: number;
  readonly scoreDifference: number;
  readonly points: number;
}

export interface StandingsRow extends EntrantAccounting {
  /** 1-based; entrants sharing a rank were not separated by the pipeline. */
  readonly rank: number;
  readonly sharedRank: boolean;
}

export interface Standings {
  readonly rows: readonly StandingsRow[];
  /** The pipeline's trace, verbatim. Never a bare ranking number. */
  readonly trace: readonly TraceNode[];
  readonly fullyResolved: boolean;
}

/** Per-entrant accounting derived from recorded outcomes. */
export function computeAccounting(
  entrantIds: readonly string[],
  outcomes: readonly RecordedOutcome[],
  points: PointsRules = DEFAULT_POINTS,
): readonly EntrantAccounting[] {
  const base = new Map<
    string,
    {
      played: number;
      won: number;
      drawn: number;
      lost: number;
      scoreFor: number;
      scoreAgainst: number;
    }
  >(
    entrantIds.map((id) => [
      id,
      { played: 0, won: 0, drawn: 0, lost: 0, scoreFor: 0, scoreAgainst: 0 },
    ]),
  );

  for (const outcome of outcomes) {
    // Only two-sided outcomes contribute; a bye is not a played match.
    const sides = outcome.scores.filter((side) => base.has(side.entrantId));
    if (sides.length !== 2) continue;
    const [first, second] = sides as [
      { entrantId: string; score: number },
      { entrantId: string; score: number },
    ];

    for (const [side, opponent] of [
      [first, second],
      [second, first],
    ] as const) {
      const row = base.get(side.entrantId);
      if (!row) continue;
      row.played += 1;
      row.scoreFor += side.score;
      row.scoreAgainst += opponent.score;
      if (outcome.winnerEntrantId === undefined) row.drawn += 1;
      else if (outcome.winnerEntrantId === side.entrantId) row.won += 1;
      else row.lost += 1;
    }
  }

  return entrantIds.map((entrantId) => {
    const row = base.get(entrantId) ?? {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      scoreFor: 0,
      scoreAgainst: 0,
    };
    return {
      entrantId,
      ...row,
      scoreDifference: row.scoreFor - row.scoreAgainst,
      points: row.won * points.win + row.drawn * points.draw + row.lost * points.loss,
    };
  });
}

/** Accounting reshaped into the `EntrantValues` the comparator pipeline reads. */
export function toEntrantValues(accounting: readonly EntrantAccounting[]): EntrantValues {
  return Object.fromEntries(
    accounting.map((row) => [
      row.entrantId,
      {
        points: row.points,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        'score-for': row.scoreFor,
        'score-against': row.scoreAgainst,
        'score-difference': row.scoreDifference,
      },
    ]),
  );
}

export function computeStandings(
  entrantIds: readonly string[],
  outcomes: readonly RecordedOutcome[],
  pipeline: TiebreakPipeline,
  points: PointsRules = DEFAULT_POINTS,
): Standings {
  const accounting = computeAccounting(entrantIds, outcomes, points);
  const byId = new Map(accounting.map((row) => [row.entrantId, row]));
  const resolution = resolveTiebreak(pipeline, entrantIds, toEntrantValues(accounting));

  const rows: StandingsRow[] = [];
  let rank = 1;
  for (const group of resolution.rankedGroups) {
    for (const entrantId of group) {
      const row = byId.get(entrantId);
      if (!row) continue;
      rows.push({ ...row, rank, sharedRank: group.length > 1 });
    }
    rank += group.length;
  }

  return { rows, trace: resolution.trace, fullyResolved: resolution.fullyResolved };
}

/** Entrant ids appearing in a fixture graph, in first-appearance order. */
export function entrantsInGraph(matches: readonly GeneratedMatch[]): readonly string[] {
  const ids: string[] = [];
  for (const match of matches) {
    for (const slot of [match.slotA, match.slotB]) {
      if (slot.kind === 'entrant' && !ids.includes(slot.entrantId)) ids.push(slot.entrantId);
    }
  }
  return ids;
}
