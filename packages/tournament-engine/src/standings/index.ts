import type { EntrantValues, TiebreakPipeline, TraceNode } from '@copalibre/rules';
import { resolveTiebreak } from '@copalibre/rules';
import { slotsOf, type GeneratedMatch } from '../types.js';
import type { DisciplineDescriptor, RecordedOutcome, StatisticDefinition } from '@copalibre/domain';

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

interface StatisticAccumulator {
  sum: number;
  count: number;
  max: number;
  min: number;
}

interface EntrantAccumulator {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  stats: Record<string, StatisticAccumulator>;
}

/**
 * Per-entrant accounting derived from recorded outcomes.
 *
 * The statistic vocabulary is the descriptor's, never the engine's: whatever
 * the bound discipline declares is folded by that statistic's own aggregation
 * mode, and nothing else is emitted. Every side of every outcome is processed,
 * so an eight-lane heat accounts as readily as a duel.
 */
export function computeAccounting(
  descriptor: DisciplineDescriptor,
  entrantIds: readonly string[],
  outcomes: readonly RecordedOutcome[],
  points: PointsRules = DEFAULT_POINTS,
): readonly EntrantAccounting[] {
  const accumulators = new Map<string, EntrantAccumulator>(
    entrantIds.map((id) => [id, emptyAccumulator(descriptor)]),
  );

  for (const outcome of outcomes) {
    // A lone side is a bye or walkover record, not a contest — nobody played
    // anyone. Beyond that no arity is assumed: two sides and eight are folded
    // by the same path.
    if (outcome.sides.length < 2) continue;

    for (const side of outcome.sides) {
      const acc = accumulators.get(side.entrantId);
      if (!acc) continue;
      acc.played += 1;

      if (outcome.winnerEntrantId === undefined) acc.drawn += 1;
      else if (outcome.winnerEntrantId === side.entrantId) acc.won += 1;
      else acc.lost += 1;

      for (const stat of descriptor.statistics) {
        const value = side.statistics[stat.code];
        const statAcc = acc.stats[stat.code];
        if (typeof value !== 'number' || !statAcc) continue;
        statAcc.sum += value;
        statAcc.count += 1;
        statAcc.max = Math.max(statAcc.max, value);
        statAcc.min = Math.min(statAcc.min, value);
      }
    }
  }

  return entrantIds.map((entrantId) => {
    const acc = accumulators.get(entrantId) ?? emptyAccumulator(descriptor);
    const statistics: Record<string, number> = {};

    for (const stat of descriptor.statistics) {
      const statAcc = acc.stats[stat.code];
      statistics[stat.code] = statAcc ? fold(stat.aggregation, statAcc) : 0;
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

function emptyAccumulator(descriptor: DisciplineDescriptor): EntrantAccumulator {
  const stats: Record<string, StatisticAccumulator> = {};
  for (const stat of descriptor.statistics) {
    stats[stat.code] = { sum: 0, count: 0, max: -Infinity, min: Infinity };
  }
  return { played: 0, won: 0, drawn: 0, lost: 0, stats };
}

/**
 * Folds one statistic per the descriptor's own declaration. An entrant with no
 * recorded value for it reads 0 rather than `null`: standings comparators
 * distinguish "worst" from "absent" through their own `missingValue` policy,
 * and accounting has no business pre-empting that decision.
 */
function fold(aggregation: StatisticDefinition['aggregation'], acc: StatisticAccumulator): number {
  if (acc.count === 0) return 0;
  switch (aggregation) {
    case 'sum':
      return acc.sum;
    case 'count':
      return acc.count;
    case 'max':
      return acc.max;
    case 'min':
      return acc.min;
    case 'average':
      return acc.sum / acc.count;
  }
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

/**
 * Entrant ids appearing in a fixture graph, in first-appearance order. Reads
 * every slot whatever the match shape: an eight-lane heat contributes eight
 * entrants to the stage table exactly as four duels contribute eight.
 */
export function entrantsInGraph(matches: readonly GeneratedMatch[]): readonly string[] {
  const ids: string[] = [];
  for (const match of matches) {
    for (const slot of slotsOf(match)) {
      if (slot.kind === 'entrant' && !ids.includes(slot.entrantId)) ids.push(slot.entrantId);
    }
  }
  return ids;
}
