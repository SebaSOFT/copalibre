import type { MatchRuleset, Participant, RecordedEvent, Result, Roster } from '@copalibre/domain';
import type { GuardEvaluationError, ScriptValidationError } from '../errors.js';
import { evaluateGuard, type GuardDecision } from '../evaluation/guard-evaluator.js';
import type { RulesRegistry, RuleScript } from '../registry/rules-registry.js';

/**
 * Typed guard entry points. Both delegate to the shared harness; they differ
 * only in the fact shape they accept, which keeps callers honest about what
 * each guard may consider.
 */

export interface EligibilityFacts {
  readonly participant?: Participant;
  readonly roster?: Roster;
  readonly lineup?: readonly string[];
  /** Effective configuration the eligibility rules read constraints from. */
  readonly rulesetConfig?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export function evaluateEligibility(
  registry: RulesRegistry,
  script: RuleScript,
  ruleVersion: { readonly id: string; readonly version: number },
  facts: EligibilityFacts,
): Result<GuardDecision, ScriptValidationError | GuardEvaluationError> {
  return evaluateGuard(registry, { script, ruleVersion, facts });
}

export interface AdvancementFacts {
  /** The compiled, immutable configuration the stage operates under. */
  readonly matchRuleset?: MatchRuleset;
  /** Recorded facts the guard derives progression state from. */
  readonly events?: readonly RecordedEvent[];
  /** Aggregated results view (completed counts, winners…), caller-computed. */
  readonly results?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export function evaluateAdvancement(
  registry: RulesRegistry,
  script: RuleScript,
  ruleVersion: { readonly id: string; readonly version: number },
  facts: AdvancementFacts,
): Result<GuardDecision, ScriptValidationError | GuardEvaluationError> {
  return evaluateGuard(registry, { script, ruleVersion, facts });
}
