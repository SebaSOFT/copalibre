import { MutationBlockedError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { FixtureRef, MutationDecision } from '../rulesets/mutation.js';

/**
 * What kind of change a reschedule is (0012-resource-scheduling-and-conflicts).
 *
 * `evaluateMutation` classifies a change to a *configuration field* against the
 * policy a discipline declared for it. A reschedule has no field and no policy:
 * what decides it is state — whether the schedule was ever published, and
 * whether the match has already been played. So the reasoning differs, and the
 * three classes deliberately do not, because a caller that already knows how to
 * handle `safe`, `requires_rebuild` and `blocked_after_results` should not learn
 * a second vocabulary for the same three answers.
 */

export interface ScheduleMutationContext {
  /** The schedule this change replaces was visible to the public surface. */
  readonly published: boolean;
  /** The match has begun, whether or not it has a result yet. */
  readonly matchStarted?: boolean;
  /** A result exists for the match. */
  readonly matchConcluded?: boolean;
  /** Already-published fixtures the change would move, which must be re-previewed. */
  readonly affectedPublishedFixtures?: readonly FixtureRef[];
}

/**
 * A reschedule is:
 *
 * - **blocked** once the match started, because a fixture that is being played
 *   or has been played has a time and a place *as a fact*, not as a plan. The
 *   audited correction workflow is the only path, exactly as it is for a result.
 * - **safe** while the schedule is a draft nobody has seen. Nothing downstream
 *   can be surprised by a change to something never published.
 * - **requires_rebuild** once published, reporting which fixtures move — because
 *   a spectator holding a time, a notification already sent, and a downstream
 *   view all referenced the old slot.
 */
export function classifyScheduleMutation(
  context: ScheduleMutationContext,
): Result<MutationDecision, MutationBlockedError> {
  if (context.matchConcluded === true || context.matchStarted === true) {
    return err(
      new MutationBlockedError(
        context.matchConcluded === true
          ? 'This match has been played; its schedule is a record now. Use the audited correction workflow.'
          : 'This match has started; use the audited correction workflow to change when or where it was played.',
        {
          matchStarted: context.matchStarted === true,
          matchConcluded: context.matchConcluded === true,
        },
      ),
    );
  }

  if (!context.published) {
    return ok({ allowed: true, mutationClass: 'safe' });
  }

  return ok({
    allowed: true,
    mutationClass: 'requires_rebuild',
    invalidates: context.affectedPublishedFixtures ?? [],
  });
}
