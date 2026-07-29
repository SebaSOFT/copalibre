import type { ConfigFieldPolicies } from '../descriptors/override-policy';
import { MutationBlockedError } from '../errors';
import { err, ok, type Result } from '../result';

/** A fixture (and any result on it) a rebuild would invalidate. */
export interface FixtureRef {
  readonly fixtureId: string;
  readonly stageId: string;
  readonly hasResult: boolean;
}

export interface MutationContext {
  /** True once at least one valid match result exists under the field's scope. */
  readonly hasRecordedResults: boolean;
  /** Fixtures already generated under the field's scope. */
  readonly generatedFixtures?: readonly FixtureRef[];
}

export type MutationDecision =
  | { readonly allowed: true; readonly mutationClass: 'safe' }
  | {
      readonly allowed: true;
      readonly mutationClass: 'requires_rebuild';
      /** What becomes invalid — reported, never rebuilt here (that is phase 0006's concern). */
      readonly invalidates: readonly FixtureRef[];
    }
  | { readonly allowed: true; readonly mutationClass: 'blocked_after_results' };

/**
 * Evaluates whether changing one configuration field is permitted, per the
 * decision record's contract: `safe` applies without side effects,
 * `requires_rebuild` reports which generated data becomes invalid,
 * `blocked_after_results` is unavailable once a valid result exists — the only
 * remaining path is the audited correction workflow (phase 0008).
 */
export function evaluateMutation(
  policies: ConfigFieldPolicies,
  fieldPath: string,
  context: MutationContext,
): Result<MutationDecision, MutationBlockedError> {
  const policy = policies[fieldPath];
  if (!policy) {
    return err(new MutationBlockedError(`No field policy declares "${fieldPath}"`, { fieldPath }));
  }

  switch (policy.mutationClass) {
    case 'safe':
      return ok({ allowed: true, mutationClass: 'safe' });
    case 'requires_rebuild':
      return ok({
        allowed: true,
        mutationClass: 'requires_rebuild',
        invalidates: context.generatedFixtures ?? [],
      });
    case 'blocked_after_results':
      if (context.hasRecordedResults) {
        return err(
          new MutationBlockedError(
            `Field "${fieldPath}" is blocked after results; use the audited correction workflow`,
            { fieldPath },
          ),
        );
      }
      return ok({ allowed: true, mutationClass: 'blocked_after_results' });
  }
}
