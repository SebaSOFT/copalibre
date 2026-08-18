import type { TiebreakPipeline, TraceNode } from '@copalibre/rules';
import { resolveTiebreak } from '@copalibre/rules';
import { QualificationError } from '../errors.js';
import { toEntrantValues, type EntrantAccounting } from '../standings/index.js';

/**
 * The cut: which entrants leave a stage for the next one.
 *
 * Qualification criteria — "the 16 with the most frags and fewest deaths, or by
 * K/D" — are a comparator sequence, so this is the phase-3 tiebreak pipeline
 * applied as a cut rather than as an ordering. Reusing it is not an economy, it
 * is the point: capability binding comes free, so `frags` reads as whatever the
 * bound discipline calls it; the explanation trace comes free, so a participant
 * who missed the cut gets the same comparator-by-comparator account the
 * standings produce; and the pipeline already distinguishes "resolved" from
 * "tied-proceed", which is exactly what a cut needs to avoid inventing a winner.
 *
 * The cut reads **stage standings, never match results**. Swimming settles it:
 * qualification is by time across all heats, not by position within a heat, so
 * winning a slow heat qualifies nobody (0010 design).
 */

export interface QualificationInput {
  /** Aggregated stage accounting — the standings, not the matches. */
  readonly accounting: readonly EntrantAccounting[];
  readonly pipeline: TiebreakPipeline;
  /** How many entrants advance. */
  readonly advance: number;
}

/** Entrants the comparators could not separate across the cut line. */
export interface ContestedCut {
  /** The tied entrants, in no meaningful order — that is the problem. */
  readonly entrantIds: readonly string[];
  /** 1-based places they are contesting, e.g. [4, 5] for the last slot. */
  readonly places: readonly number[];
  /** How many of them can advance. */
  readonly slots: number;
}

export interface QualificationOutcome {
  /** Entrants that advance, best first. Empty while a cut is contested. */
  readonly qualified: readonly string[];
  readonly eliminated: readonly string[];
  /** Set when the comparators exhausted across the cut line. */
  readonly contested?: ContestedCut;
  readonly resolved: boolean;
  readonly trace: readonly TraceNode[];
}

/**
 * How a contested cut was settled. Both paths are audited by the caller; the
 * engine only distinguishes "the tournament declared this in advance" from "an
 * operator decided it now", because the audit trail must not conflate them.
 */
export type CutResolution =
  | {
      /** A playoff, a coin toss, a drawing of lots — decided by the rules. */
      readonly kind: 'declared';
      readonly method: string;
      /** The contested entrants in the order the method produced. */
      readonly order: readonly string[];
    }
  | {
      readonly kind: 'operator-override';
      readonly actor: string;
      readonly reason: string;
      readonly order: readonly string[];
    };

export function evaluateQualification(input: QualificationInput): QualificationOutcome {
  const entrantIds = input.accounting.map((row) => row.entrantId);

  if (!Number.isInteger(input.advance) || input.advance < 1) {
    throw new QualificationError('A cut must advance at least one entrant', {
      advance: input.advance,
    });
  }
  if (input.advance > entrantIds.length) {
    throw new QualificationError(
      `A cut cannot advance ${input.advance} of ${entrantIds.length} entrant(s)`,
      { advance: input.advance, entrants: entrantIds.length },
    );
  }

  const resolution = resolveTiebreak(input.pipeline, entrantIds, toEntrantValues(input.accounting));

  const ordered: string[] = [];
  let contested: ContestedCut | undefined;

  for (const group of resolution.rankedGroups) {
    const before = ordered.length;
    if (before + group.length <= input.advance || before >= input.advance) {
      // Wholly above or wholly below the line: no ambiguity either way.
      ordered.push(...group);
      continue;
    }

    // The line falls inside this group. Selecting any of them would be
    // inventing a result the comparators explicitly did not produce.
    contested = {
      entrantIds: [...group],
      places: group.map((_entrantId, index) => before + index + 1),
      slots: input.advance - before,
    };
    ordered.push(...group);
  }

  const trace = [...resolution.trace, cutNode(input.advance, contested)];
  if (contested) {
    return { qualified: [], eliminated: [], contested, resolved: false, trace };
  }

  return {
    qualified: ordered.slice(0, input.advance),
    eliminated: ordered.slice(input.advance),
    resolved: true,
    trace,
  };
}

/**
 * Applies a resolution to a contested cut. The resolution must order exactly
 * the contested entrants — settling a tie the cut did not have, or leaving one
 * of them out, is a different decision than the one being audited.
 */
export function applyCutResolution(
  outcome: QualificationOutcome,
  input: QualificationInput,
  resolution: CutResolution,
): QualificationOutcome {
  const contested = outcome.contested;
  if (!contested) {
    throw new QualificationError('This cut is not contested; there is nothing to resolve', {});
  }

  const expected = [...contested.entrantIds].sort();
  const supplied = [...resolution.order].sort();
  if (expected.length !== supplied.length || expected.some((id, index) => id !== supplied[index])) {
    throw new QualificationError(
      'A cut resolution must order exactly the contested entrants, no more and no fewer',
      { contested: contested.entrantIds, supplied: resolution.order },
    );
  }

  const entrantIds = input.accounting.map((row) => row.entrantId);
  const base = resolveTiebreak(input.pipeline, entrantIds, toEntrantValues(input.accounting));

  const ordered: string[] = [];
  for (const group of base.rankedGroups) {
    const isContested =
      group.length === contested.entrantIds.length &&
      group.every((entrantId) => contested.entrantIds.includes(entrantId));
    ordered.push(...(isContested ? resolution.order : group));
  }

  return {
    qualified: ordered.slice(0, input.advance),
    eliminated: ordered.slice(input.advance),
    resolved: true,
    trace: [...outcome.trace, resolutionNode(resolution, contested)],
  };
}

export {
  evaluateGroupPromotion,
  type GroupPromotionOutcome,
  type PromotionPlan,
  type QualifiedEntrant,
} from './promotion.js';

function cutNode(advance: number, contested?: ContestedCut): TraceNode {
  if (!contested) {
    return {
      kind: 'threshold',
      id: 'qualification-cut',
      label: `Qualification cut (top ${advance})`,
      outcome: 'resolved',
      values: { advance },
      detail: `The comparators separated every entrant across the cut line`,
    };
  }
  return {
    kind: 'threshold',
    id: 'qualification-cut',
    label: `Qualification cut (top ${advance})`,
    outcome: 'unresolved-tie',
    values: {
      advance,
      contested: [...contested.entrantIds],
      places: [...contested.places],
      slots: contested.slots,
    },
    detail:
      `${contested.entrantIds.length} entrants are tied for ${contested.slots} of the ` +
      `remaining place(s); the cut requires a declared resolution or an authorized override`,
  };
}

function resolutionNode(resolution: CutResolution, contested: ContestedCut): TraceNode {
  return {
    kind: 'action',
    id: `cut-resolution:${resolution.kind}`,
    label: resolution.kind === 'declared' ? 'Declared cut resolution' : 'Operator cut override',
    outcome: 'resolved',
    values: {
      order: [...resolution.order],
      contested: [...contested.entrantIds],
      ...(resolution.kind === 'declared'
        ? { method: resolution.method }
        : { actor: resolution.actor, reason: resolution.reason }),
    },
    detail:
      resolution.kind === 'declared'
        ? `Settled by the declared method "${resolution.method}"`
        : `Settled by ${resolution.actor}: ${resolution.reason}`,
  };
}
