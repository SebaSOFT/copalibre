import type { LocalizedLabel } from '@copalibre/domain';
import type { TraceNode } from '../trace/explanation-trace.js';

/**
 * Tiebreak comparator pipeline, per the tournament-engine decision record's
 * "Scoring and tiebreakers": an ordered sequence of declared, auditable
 * accounting parameters evaluated "in sequence until it resolves the tie".
 * Definitions are serializable data (versioned configuration); evaluation is
 * deterministic and produces the trace phase 0017 renders.
 */

export type ComparisonDirection =
  'higher_wins' | 'lower_wins' | { readonly orderedValues: readonly string[] };

export type MissingValueBehavior = 'treat-as-worst' | 'treat-as-zero' | 'invalid';

/**
 * A comparator computed from two statistics rather than read from one: K/D
 * ratio, points per game, goals per match. Declared because the ratio is not a
 * recorded statistic — 0009 keeps derived values out of accounting deliberately,
 * so they are expressed here, where the comparator machinery already lives.
 */
export interface RatioDefinition {
  readonly numerator: string;
  readonly denominator: string;
  /**
   * What a zero denominator means. A player with zero deaths does not have an
   * infinite K/D, and the two honest answers are "rank on frags alone at this
   * tier" or "this is not a comparable value". Declared, never assumed.
   */
  readonly zeroDenominator: 'numerator-only' | 'treat-as-worst';
}

export interface TiebreakParameterDefinition {
  /** Stable identifier, e.g. "points", "score-difference", "head-to-head". */
  readonly id: string;
  /**
   * When present, the comparator divides these two values instead of reading
   * `id` from the entrant's values.
   */
  readonly ratio?: RatioDefinition;
  /**
   * Set when this comparator came from a capability that the binding could not
   * resolve. Evaluation still runs (and degrades per `missingValue`), but the
   * trace records why it discriminated nothing — otherwise an operator reading
   * an archived standing would see a comparator that silently did nothing.
   */
  readonly unboundCapability?: string;
  readonly label: string | LocalizedLabel;
  readonly valueType: 'number' | 'ordered-value';
  readonly direction: ComparisonDirection;
  readonly missingValue: MissingValueBehavior;
  readonly source: 'calculated' | 'operator-entered' | 'match-derived';
}

export interface TiebreakPipeline {
  readonly id: string;
  readonly version: number;
  readonly parameters: readonly TiebreakParameterDefinition[];
}

/** Accounting values per entrant, keyed by parameter id. */
export type EntrantValues = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export interface TiebreakResolution {
  /** Entrant ids best-first; entrants inside one group remain tied. */
  readonly rankedGroups: readonly (readonly string[])[];
  /** True when every group has exactly one entrant. */
  readonly fullyResolved: boolean;
  readonly trace: readonly TraceNode[];
}

/**
 * Resolves the ordering of a tied group of entrants. Comparators run in
 * declared order; each one splits still-tied groups where it discriminates;
 * evaluation stops as soon as no ties remain. A fully exhausted pipeline with
 * surviving ties returns `fullyResolved: false` — the explicit unresolved-tie
 * result (callers decide the product behavior, e.g. shared placement).
 */
export function resolveTiebreak(
  pipeline: TiebreakPipeline,
  entrantIds: readonly string[],
  values: EntrantValues,
): TiebreakResolution {
  let groups: (readonly string[])[] = [entrantIds];
  const trace: TraceNode[] = [];

  for (const [index, parameter] of pipeline.parameters.entries()) {
    if (groups.every((group) => group.length === 1)) break;

    const nextGroups: (readonly string[])[] = [];
    const groupOutcomes: string[] = [];
    const observed: Record<string, unknown> = {};

    for (const group of groups) {
      if (group.length === 1) {
        nextGroups.push(group);
        continue;
      }
      const split = splitByParameter(group, parameter, values, observed);
      nextGroups.push(...split);
      groupOutcomes.push(
        split.length === group.length
          ? 'resolved'
          : split.length > 1
            ? 'partially-resolved'
            : 'tied-proceed',
      );
    }

    groups = nextGroups;
    const resolvedAll = groups.every((group) => group.length === 1);
    trace.push({
      kind: 'comparator',
      id: parameter.id,
      label: `Rule ${index + 1} (${parameter.label})`,
      outcome: resolvedAll
        ? 'resolved'
        : groupOutcomes.includes('resolved') || groupOutcomes.includes('partially-resolved')
          ? 'partially-resolved'
          : 'tied-proceed',
      values: observed,
      detail: parameter.unboundCapability
        ? `Capability "${parameter.unboundCapability}" is not provided by this discipline; ` +
          `comparator discriminated nothing (${parameter.missingValue})`
        : resolvedAll
          ? `${parameter.label} resolved the tie`
          : `Tie not fully resolved by ${parameter.label}; proceed to next comparator`,
    });

    if (resolvedAll) break;
  }

  const fullyResolved = groups.every((group) => group.length === 1);
  if (!fullyResolved) {
    trace.push({
      kind: 'comparator',
      id: 'pipeline-exhausted',
      label: 'Pipeline exhausted',
      outcome: 'unresolved-tie',
      detail: 'Every declared comparator was evaluated and a tie survives',
    });
  }

  return { rankedGroups: groups, fullyResolved, trace };
}

function splitByParameter(
  group: readonly string[],
  parameter: TiebreakParameterDefinition,
  values: EntrantValues,
  observed: Record<string, unknown>,
): (readonly string[])[] {
  const scored = group.map((entrantId) => {
    const raw = parameter.ratio
      ? ratioValue(values[entrantId] ?? {}, parameter.ratio)
      : values[entrantId]?.[parameter.id];
    observed[entrantId] = raw === undefined ? null : raw;
    return { entrantId, sortKey: sortKeyFor(raw, parameter) };
  });

  // Best-first, stable within equal keys (input order preserved for ties).
  const ordered = [...scored].sort((a, b) => b.sortKey - a.sortKey);

  const result: string[][] = [];
  let currentKey: number | undefined;
  for (const { entrantId, sortKey } of ordered) {
    if (currentKey === undefined || sortKey !== currentKey) {
      result.push([entrantId]);
      currentKey = sortKey;
    } else {
      (result[result.length - 1] as string[]).push(entrantId);
    }
  }
  return result;
}

/**
 * Computes a declared ratio. A missing input is `undefined` rather than zero:
 * "no frags recorded" and "zero frags" are different claims, and the
 * comparator's own `missingValue` policy decides what absence means.
 */
function ratioValue(
  entrantValues: Readonly<Record<string, unknown>>,
  ratio: RatioDefinition,
): number | undefined {
  const numerator = entrantValues[ratio.numerator];
  const denominator = entrantValues[ratio.denominator];
  if (typeof numerator !== 'number' || typeof denominator !== 'number') return undefined;

  if (denominator === 0) {
    return ratio.zeroDenominator === 'numerator-only' ? numerator : undefined;
  }
  return numerator / denominator;
}

/** Higher sort key = better placement, regardless of direction semantics. */
function sortKeyFor(raw: unknown, parameter: TiebreakParameterDefinition): number {
  if (raw === undefined || raw === null) {
    // 'invalid' and 'treat-as-worst' both rank the entrant last here; the
    // difference is a product/validation concern surfaced upstream.
    return parameter.missingValue === 'treat-as-zero' ? directionalKey(0, parameter) : -Infinity;
  }

  if (typeof parameter.direction === 'object') {
    const index = parameter.direction.orderedValues.indexOf(String(raw));
    return index === -1 ? -Infinity : parameter.direction.orderedValues.length - index;
  }

  return typeof raw === 'number' ? directionalKey(raw, parameter) : -Infinity;
}

function directionalKey(value: number, parameter: TiebreakParameterDefinition): number {
  return parameter.direction === 'lower_wins' ? -value : value;
}
