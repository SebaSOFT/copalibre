import type { EntrantValues, TiebreakPipeline, TraceNode } from '@copalibre/rules';
import { resolveTiebreak } from '@copalibre/rules';
import { slotsOf, type GeneratedMatch } from '../types.js';
import type {
  DisciplineDescriptor,
  RecordedOutcome,
  StatisticDefinition,
  SeriesDeclaration,
  SeriesAccountingGrain,
  SeriesTraceNode,
} from '@copalibre/domain';
import { resolveSeries } from '@copalibre/domain';

/**
 * Standings assembly. This module computes *accounting parameters* only and
 * delegates every comparison to `@copalibre/rules`, so the explanation trace the
 * A5 screen renders the trace produced by the pipeline that
 * actually ran — not a parallel ranking implementation that could drift from it.
 */

export interface PointsRules {
  readonly win: number;
  readonly draw: number;
  readonly loss: number;
}

export const DEFAULT_POINTS: PointsRules = { win: 3, draw: 1, loss: 0 };

/**
 * The statistics the engine can derive from a duel outcome — *if* the bound
 * discipline declares them. A discipline that never names `points` gets no
 * `points` value, which is the whole point of the vocabulary is the
 * module's, and the engine may only fill in codes the module asked for.
 *
 * `played` is deliberately absent: a statistic declared with `count`
 * aggregation already counts the outcomes its entrant appeared in, whatever
 * the discipline calls it (`played`, `heats`, `rounds`).
 */
export const DERIVABLE_STATISTICS = {
  wins: 'wins',
  draws: 'draws',
  losses: 'losses',
  points: 'points',
} as const;

export interface EntrantAccounting {
  readonly entrantId: string;
  /** Exactly the statistics the descriptor declares — no more, no fewer. */
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
  /**
   * The grain this calculation actually accounted in. `match` whenever the
   * stage's series declares no grain — never left unstated, per
   * `match-series`' "neither SHALL be assumed" requirement.
   */
  readonly grain: SeriesAccountingGrain;
}

interface StatisticAccumulator {
  sum: number;
  count: number;
  max: number;
  min: number;
}

interface EntrantAccumulator {
  stats: Record<string, StatisticAccumulator>;
}

/**
 * Groups outcomes by the fixture they belong to. Membership is carried
 * explicitly on the outcome — a persisted match id is an opaque UUIDv7 and
 * cannot be parsed back into the fixture it settles. Shared by the accounting
 * fold below and by `seriesAccountingTrace`, so the two never disagree about
 * which outcomes make up one series.
 */
function groupOutcomesByFixture(
  outcomes: readonly RecordedOutcome[],
): ReadonlyMap<string, readonly RecordedOutcome[]> {
  const fixtures = new Map<string, RecordedOutcome[]>();
  for (const outcome of outcomes) {
    const fixtureId = outcome.fixtureId ?? outcome.matchId;
    const existing = fixtures.get(fixtureId) ?? [];
    existing.push(outcome);
    fixtures.set(fixtureId, existing);
  }
  return fixtures;
}

/** A fixture's outcomes reshaped into the games `resolveSeries` reads. */
function seriesMatchesOf(fixtureOutcomes: readonly RecordedOutcome[]): Parameters<
  typeof resolveSeries
>[0]['matches'] {
  return fixtureOutcomes.map((out, idx) => {
    const matchNumberMatch = out.matchId.match(/-([0-9]+)$/);
    const number = matchNumberMatch && matchNumberMatch[1] ? Number(matchNumberMatch[1]) : idx + 1;
    return {
      number,
      status: 'finalized' as const,
      result: {
        winnerEntrantId: out.winnerEntrantId,
        sides: out.sides.map((s) => ({ entrantId: s.entrantId, statistics: s.statistics })),
        recordedAt: '',
      },
    };
  });
}

/**
 * A `SeriesTraceNode` (the domain's own vocabulary) reshaped into a
 * `TraceNode` (the rules engine's), so a series-resolution trace can sit
 * inside `Standings.trace` beside the tiebreak pipeline's own nodes. Every
 * field but `kind` carries over unchanged — `lineOf` never renders `kind` — so
 * the rendered text stays the engine's own. `kind: 'series'` has no
 * `TraceNode` counterpart and becomes `'aggregation'`, the closest existing
 * vocabulary entry for "a fold decided something."
 */
function toTraceNode(node: SeriesTraceNode): TraceNode {
  const kind: TraceNode['kind'] = node.kind === 'series' ? 'aggregation' : node.kind;
  return {
    kind,
    id: node.id,
    label: node.label,
    outcome: node.outcome,
    ...(node.values === undefined ? {} : { values: node.values }),
    ...(node.detail === undefined ? {} : { detail: node.detail }),
    ...(node.children === undefined ? {} : { children: node.children.map(toTraceNode) }),
  };
}

/**
 * The series-resolution trace for every fixture of a series-grain stage, one
 * node per fixture, `values` naming the entrants it settled so
 * `traceForEntrant` (`@copalibre/rules`) surfaces it on both rows a decided
 * or drawn series touches.
 *
 * Re-derives `resolveSeries`'s own decision per fixture rather than having
 * `computeAccounting` thread it out: the accounting fold and this trace are
 * both deterministic functions of the same outcomes and declaration, so
 * re-deriving cannot disagree with the fold, and a caller that only wants
 * accounting numbers (`zones-groups.controller.ts`'s promotion preview) pays
 * nothing for a trace it never asked for.
 */
function seriesAccountingTrace(
  outcomes: readonly RecordedOutcome[],
  seriesDeclaration: SeriesDeclaration,
  points: PointsRules,
): readonly TraceNode[] {
  const fixtures = groupOutcomesByFixture(outcomes);
  const nodes: TraceNode[] = [];

  for (const [fixtureId, fixtureOutcomes] of fixtures) {
    const first = fixtureOutcomes[0];
    if (!first || first.sides.length < 2 || !first.sides[0] || !first.sides[1]) continue;
    const sides: readonly [string, string] = [first.sides[0].entrantId, first.sides[1].entrantId];

    const seriesResult = resolveSeries({
      declaration: seriesDeclaration,
      sides,
      matches: seriesMatchesOf(fixtureOutcomes),
      pointsRules: points,
    });

    if (seriesResult.status !== 'decided' && seriesResult.status !== 'finished-unresolved') {
      continue;
    }

    const loser = sides.find((side) => side !== seriesResult.winnerEntrantId);
    const values: Record<string, unknown> =
      seriesResult.status === 'decided' && seriesResult.winnerEntrantId
        ? {
            [seriesResult.winnerEntrantId]: 'won',
            ...(loser === undefined ? {} : { [loser]: 'lost' }),
          }
        : { [sides[0]]: 'drawn', [sides[1]]: 'drawn' };

    nodes.push({
      kind: 'aggregation',
      id: fixtureId,
      label: `Series ${fixtureId}`,
      outcome: seriesResult.status,
      values,
      detail: seriesResult.explanation,
      children: seriesResult.trace.map(toTraceNode),
    });
  }

  return nodes;
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
  options?: { readonly seriesDeclaration?: SeriesDeclaration },
): readonly EntrantAccounting[] {
  const accumulators = new Map<string, EntrantAccumulator>(
    entrantIds.map((id) => [id, emptyAccumulator(descriptor)]),
  );

  const seriesDec = options?.seriesDeclaration;
  const isSeriesGrain = seriesDec?.standingsAccounting === 'series';

  if (isSeriesGrain && seriesDec) {
    const fixtures = groupOutcomesByFixture(outcomes);

    const foldSeriesCount = (entrantId: string): void => {
      const acc = accumulators.get(entrantId);
      if (!acc) return;
      for (const stat of descriptor.statistics) {
        if (stat.aggregation !== 'count') continue;
        const statAcc = acc.stats[stat.code];
        if (!statAcc) continue;
        statAcc.count += 1;
      }
    };

    for (const [, fixtureOutcomes] of fixtures) {
      const first = fixtureOutcomes[0];
      if (!first || first.sides.length < 2 || !first.sides[0] || !first.sides[1]) continue;
      const sides: readonly [string, string] = [first.sides[0].entrantId, first.sides[1].entrantId];

      // Fold every played match's non-count statistics: a goal scored in game
      // two was scored whatever the standings row is counted in. A
      // `count`-aggregated statistic folds once for the series as a whole,
      // below, once it is known to have resolved.
      for (const outcome of fixtureOutcomes) {
        for (const side of outcome.sides) {
          const acc = accumulators.get(side.entrantId);
          if (!acc) continue;
          for (const stat of descriptor.statistics) {
            if (
              stat.code === DERIVABLE_STATISTICS.wins ||
              stat.code === DERIVABLE_STATISTICS.losses ||
              stat.code === DERIVABLE_STATISTICS.draws ||
              stat.code === DERIVABLE_STATISTICS.points ||
              stat.aggregation === 'count'
            ) {
              continue;
            }
            const statAcc = acc.stats[stat.code];
            if (!statAcc) continue;
            const value = side.statistics[stat.code];
            if (typeof value !== 'number') continue;
            statAcc.sum += value;
            statAcc.count += 1;
            statAcc.max = Math.max(statAcc.max, value);
            statAcc.min = Math.min(statAcc.min, value);
          }
        }
      }

      // Fold 1 series outcome
      const seriesMatches = seriesMatchesOf(fixtureOutcomes);

      const seriesResult = resolveSeries({
        declaration: seriesDec,
        sides,
        matches: seriesMatches,
        pointsRules: points,
      });

      if (seriesResult.status === 'decided' && seriesResult.winnerEntrantId) {
        const winner = seriesResult.winnerEntrantId;
        const loser = sides.find((s) => s !== winner);

        const winAcc = accumulators.get(winner);
        if (winAcc) {
          addDerivedStat(winAcc, descriptor, DERIVABLE_STATISTICS.wins, 1);
          addDerivedStat(winAcc, descriptor, DERIVABLE_STATISTICS.points, points.win);
        }
        if (loser) {
          const loseAcc = accumulators.get(loser);
          if (loseAcc) {
            addDerivedStat(loseAcc, descriptor, DERIVABLE_STATISTICS.losses, 1);
            addDerivedStat(loseAcc, descriptor, DERIVABLE_STATISTICS.points, points.loss);
          }
        }
        foldSeriesCount(winner);
        if (loser) foldSeriesCount(loser);
      } else if (seriesResult.status === 'finished-unresolved') {
        for (const sideId of sides) {
          const drawAcc = accumulators.get(sideId);
          if (drawAcc) {
            addDerivedStat(drawAcc, descriptor, DERIVABLE_STATISTICS.draws, 1);
            addDerivedStat(drawAcc, descriptor, DERIVABLE_STATISTICS.points, points.draw);
          }
          foldSeriesCount(sideId);
        }
      }
    }
  } else {
    for (const outcome of outcomes) {
      if (outcome.sides.length < 2) continue;

      for (const side of outcome.sides) {
        const acc = accumulators.get(side.entrantId);
        if (!acc) continue;
        const values = {
          ...derivedFor(descriptor, outcome, side.entrantId, points),
          ...side.statistics,
        };

        for (const stat of descriptor.statistics) {
          const statAcc = acc.stats[stat.code];
          if (!statAcc) continue;

          const value = values[stat.code];
          if (typeof value !== 'number') {
            if (stat.aggregation === 'count') statAcc.count += 1;
            continue;
          }
          statAcc.sum += value;
          statAcc.count += 1;
          statAcc.max = Math.max(statAcc.max, value);
          statAcc.min = Math.min(statAcc.min, value);
        }
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

    return { entrantId, statistics };
  });
}

function addDerivedStat(
  acc: EntrantAccumulator,
  descriptor: DisciplineDescriptor,
  statCode: string,
  val: number,
): void {
  const declared = descriptor.statistics.find((s) => s.code === statCode);
  if (!declared) return;
  const statAcc = acc.stats[statCode];
  if (!statAcc) return;
  statAcc.sum += val;
  statAcc.count += 1;
  statAcc.max = Math.max(statAcc.max, val);
  statAcc.min = Math.min(statAcc.min, val);
}

/**
 * Win/draw/loss bookkeeping the engine can compute from the outcome itself.
 *
 * Only codes the descriptor declares are produced, and a value the recorder
 * already supplied always wins: a discipline whose win condition awards points
 * its own way records them, and the engine does not second-guess it.
 */
function derivedFor(
  descriptor: DisciplineDescriptor,
  outcome: RecordedOutcome,
  entrantId: string,
  points: PointsRules,
): Record<string, number> {
  const won = outcome.winnerEntrantId === entrantId;
  const drawn = outcome.winnerEntrantId === undefined;
  const declared = new Set(descriptor.statistics.map((statistic) => statistic.code));
  const derived: Record<string, number> = {};

  if (declared.has(DERIVABLE_STATISTICS.wins)) derived[DERIVABLE_STATISTICS.wins] = won ? 1 : 0;
  if (declared.has(DERIVABLE_STATISTICS.draws)) derived[DERIVABLE_STATISTICS.draws] = drawn ? 1 : 0;
  if (declared.has(DERIVABLE_STATISTICS.losses)) {
    derived[DERIVABLE_STATISTICS.losses] = !won && !drawn ? 1 : 0;
  }
  if (declared.has(DERIVABLE_STATISTICS.points)) {
    derived[DERIVABLE_STATISTICS.points] = won ? points.win : drawn ? points.draw : points.loss;
  }
  return derived;
}

function emptyAccumulator(descriptor: DisciplineDescriptor): EntrantAccumulator {
  const stats: Record<string, StatisticAccumulator> = {};
  for (const stat of descriptor.statistics) {
    stats[stat.code] = { sum: 0, count: 0, max: -Infinity, min: Infinity };
  }
  return { stats };
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

/**
 * Accounting reshaped into the `EntrantValues` the comparator pipeline reads.
 * A comparator asking for a code the discipline never declared reads nothing
 * and degrades through its own `missingValue` policy — it is not silently
 * handed an engine-invented zero.
 */
export function toEntrantValues(accounting: readonly EntrantAccounting[]): EntrantValues {
  return Object.fromEntries(accounting.map((row) => [row.entrantId, { ...row.statistics }]));
}

export function computeStandings(
  descriptor: DisciplineDescriptor,
  entrantIds: readonly string[],
  outcomes: readonly RecordedOutcome[],
  pipeline: TiebreakPipeline,
  points: PointsRules = DEFAULT_POINTS,
  options?: { readonly seriesDeclaration?: SeriesDeclaration },
): Standings {
  const accounting = computeAccounting(descriptor, entrantIds, outcomes, points, options);
  const seriesDeclaration = options?.seriesDeclaration;
  const grain: SeriesAccountingGrain =
    seriesDeclaration?.standingsAccounting === 'series' ? 'series' : 'match';
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

  // Series trace nodes lead the comparator pipeline's own — an entrant's row
  // explains what decided its result before it explains how a tie among
  // several such results was broken.
  const trace =
    grain === 'series' && seriesDeclaration
      ? [...seriesAccountingTrace(outcomes, seriesDeclaration, points), ...resolution.trace]
      : resolution.trace;

  return { rows, trace, fullyResolved: resolution.fullyResolved, grain };
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
