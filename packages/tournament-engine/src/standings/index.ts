import type { EntrantValues, TiebreakPipeline, TraceNode } from '@copalibre/rules';
import { resolveTiebreak } from '@copalibre/rules';
import type { GeneratedMatch } from '../types.js';
import type { DisciplineDescriptor, RecordedOutcome } from '@copalibre/domain';

/**
 * Standings assembly. This module computes *accounting parameters* only and
 * delegates every comparison to `@copalibre/rules`, so the explanation trace the
 * A5 screen (phase 0017) renders is the trace produced by the pipeline that
 * actually ran — not a parallel ranking implementation that could drift from it.
 */

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
  readonly points: number;
  readonly statistics: Readonly<Record<string, number>>;
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
  descriptor: DisciplineDescriptor,
  entrantIds: readonly string[],
  outcomes: readonly RecordedOutcome[],
  points: PointsRules = DEFAULT_POINTS,
): readonly EntrantAccounting[] {
  const accumulators = new Map<
    string,
    {
      played: number;
      won: number;
      drawn: number;
      lost: number;
      stats: Record<string, { sum: number; count: number; max: number; min: number }>;
    }
  >();

  for (const id of entrantIds) {
    const stats: Record<string, { sum: number; count: number; max: number; min: number }> = {};
    for (const stat of descriptor.statistics) {
      stats[stat.code] = { sum: 0, count: 0, max: -Infinity, min: Infinity };
    }
    accumulators.set(id, { played: 0, won: 0, drawn: 0, lost: 0, stats });
  }

  for (const outcome of outcomes) {
    if (outcome.sides.length < 2) continue;
    const sides = outcome.sides.filter((side) => accumulators.has(side.entrantId));
    
    for (const side of sides) {
      const acc = accumulators.get(side.entrantId);
      if (!acc) continue;
      acc.played += 1;
      
      if (outcome.winnerEntrantId === undefined) acc.drawn += 1;
      else if (outcome.winnerEntrantId === side.entrantId) acc.won += 1;
      else acc.lost += 1;

      for (const stat of descriptor.statistics) {
        const val = side.statistics[stat.code];
        if (typeof val === 'number') {
          const statAcc = acc.stats[stat.code];
          if (statAcc) {
            statAcc.sum += val;
            statAcc.count += 1;
            statAcc.max = Math.max(statAcc.max, val);
            statAcc.min = Math.min(statAcc.min, val);
          }
        }
      }
    }
  }

  return entrantIds.map((entrantId) => {
    const acc = accumulators.get(entrantId)!;
    const statistics: Record<string, number> = {};
    
    for (const stat of descriptor.statistics) {
      const statAcc = acc.stats[stat.code]!;
      if (statAcc.count === 0) {
        statistics[stat.code] = 0;
        continue;
      }
      switch (stat.aggregation) {
        case 'sum':
          statistics[stat.code] = statAcc.sum;
          break;
        case 'count':
          statistics[stat.code] = statAcc.count;
          break;
        case 'max':
          statistics[stat.code] = statAcc.max;
          break;
        case 'min':
          statistics[stat.code] = statAcc.min;
          break;
        case 'average':
          statistics[stat.code] = statAcc.sum / statAcc.count;
          break;
      }
    }
    
    return {
      entrantId,
      played: acc.played,
      won: acc.won,
      drawn: acc.drawn,
      lost: acc.lost,
      points: acc.won * points.win + acc.drawn * points.draw + acc.lost * points.loss,
      statistics,
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
        ...row.statistics,
      },
    ]),
  );
}

export function computeStandings(
  descriptor: DisciplineDescriptor,
  entrantIds: readonly string[],
  outcomes: readonly RecordedOutcome[],
  pipeline: TiebreakPipeline,
  points: PointsRules = DEFAULT_POINTS,
): Standings {
  const accounting = computeAccounting(descriptor, entrantIds, outcomes, points);
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
