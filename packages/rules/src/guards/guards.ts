import type { MatchRuleset, Person, Player, RecordedEvent, Result } from '@copalibre/domain';
import type { GuardEvaluationError, ScriptValidationError } from '../errors.js';
import { evaluateGuard, type GuardDecision } from '../evaluation/guard-evaluator.js';
import type { RulesRegistry, RuleScript } from '../registry/rules-registry.js';

/**
 * Typed guard entry points. Both delegate to the shared harness; they differ
 * only in the fact shape they accept, which keeps callers honest about what
 * each guard may consider.
 */

export interface EligibilityFacts {
  readonly person?: Person;
  /** The team's squad: the memberships pointing at it. */
  readonly squad?: readonly Player[];
  readonly roster?: readonly string[];
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
  return evaluateGuard(registry, { script, ruleVersion, context: facts });
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
  return evaluateGuard(registry, { script, ruleVersion, context: facts });
}
