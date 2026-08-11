import type { CompilationProvenance } from '@copalibre/domain';

/**
 * The explanation-trace contract. Phase 0017's Standings screen renders this
 * structure directly ("Tiebreaker Resolution Trace"), so from this phase on
 * its shape is a public contract: JSON-serializable, deterministic for
 * identical inputs (no timestamps, no randomness), stable across releases.
 */

export interface TraceNode {
  readonly kind:
    'comparator' | 'condition' | 'action' | 'rule' | 'aggregation' | 'threshold' | 'guard';
  /** Stable identifier of the element this node explains. */
  readonly id: string;
  readonly label: string;
  /** e.g. "resolved", "tied-proceed", "pass", "fail", "fired", "not-fired". */
  readonly outcome: string;
  /** The concrete values that produced the outcome, keyed by subject. */
  readonly values?: Readonly<Record<string, unknown>>;
  readonly detail?: string;
  readonly children?: readonly TraceNode[];
}

/** One complete, auditable decision evaluation. */
export interface EvaluationRecord<TOutput = unknown> {
  readonly engine: 'copalibre-rules';
  /** Versions of the configuration the decision was evaluated under. */
  readonly rulesetVersions?: CompilationProvenance;
  /** Version of the specific rule document, when one applies. */
  readonly ruleVersion?: { readonly id: string; readonly version: number };
  readonly inputFacts: unknown;
  readonly output: TOutput;
  readonly trace: readonly TraceNode[];
}

/** Asserts the record survives JSON serialization without loss. */
export function roundTripsAsJson(record: EvaluationRecord): boolean {
  return JSON.stringify(JSON.parse(JSON.stringify(record))) === JSON.stringify(record);
}
