import {
  bindCapabilities,
  type BindOptions,
  type UnsatisfiedCapabilityError,
} from '../capabilities/binder.js';
import type { DisciplineDescriptor, RuleScript } from '../descriptors/discipline-descriptor.js';
import { RulesetCompilationError, type PolicyViolation } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import { compileEffectiveRuleset } from '../rulesets/compiler.js';
import type { MatchRuleset } from '../rulesets/match-ruleset.js';
import type { StageConfiguration, TournamentRuleset } from '../rulesets/tournament-ruleset.js';
import type { TournamentProfile } from './tournament-profile.js';

/**
 * Compiles a tournament profile against a discipline: binds capabilities,
 * validates the win-condition override against the discipline's field policy,
 * and produces the effective ruleset with the binding frozen onto it.
 *
 * This is the single path a tournament takes from "a published profile" to
 * "configuration this competition runs under", and its output is what gets
 * persisted so the competition outlives its modules.
 */
export function compileProfile(
  descriptor: DisciplineDescriptor,
  profile: TournamentProfile,
  ruleset?: TournamentRuleset,
  stage?: StageConfiguration,
  options?: BindOptions,
): Result<MatchRuleset, RulesetCompilationError | UnsatisfiedCapabilityError> {
  const binding = bindCapabilities(descriptor, profile, options);
  if (!binding.ok) return err(binding.error);

  const winConditionViolation = checkWinConditionOverride(descriptor, profile);
  if (winConditionViolation) {
    return err(new RulesetCompilationError([winConditionViolation]));
  }

  const compiled = compileEffectiveRuleset(descriptor, ruleset, stage);
  if (!compiled.ok) return err(compiled.error);

  return ok({ ...compiled.value, binding: binding.value });
}

/**
 * A profile may replace the win condition only where the discipline's field
 * policy permits it — reusing the override mechanism rather than inventing a
 * second one.
 */
function checkWinConditionOverride(
  descriptor: DisciplineDescriptor,
  profile: TournamentProfile,
): PolicyViolation | undefined {
  if (profile.winConditionOverride === undefined) return undefined;

  const policy = descriptor.fieldPolicies.winCondition;
  if (!policy) {
    return {
      field: 'winCondition',
      reason: 'unknown-field',
      message: 'Profile overrides the win condition, but the discipline declares no policy for it',
    };
  }
  if (policy.permission.kind === 'forbidden' || policy.permission.kind === 'inherited') {
    return {
      field: 'winCondition',
      reason: policy.permission.kind === 'forbidden' ? 'forbidden-override' : 'inherited-field',
      message: `Discipline "${descriptor.name}" does not permit its win condition to be replaced`,
    };
  }
  return undefined;
}

/** The win condition in force: the profile's where permitted, else the discipline's. */
export function effectiveWinCondition(
  descriptor: DisciplineDescriptor,
  profile?: TournamentProfile,
): RuleScript {
  if (!profile?.winConditionOverride) return descriptor.winCondition;
  const policy = descriptor.fieldPolicies.winCondition;
  return policy?.permission.kind === 'replaced' || policy?.permission.kind === 'merged'
    ? profile.winConditionOverride
    : descriptor.winCondition;
}
