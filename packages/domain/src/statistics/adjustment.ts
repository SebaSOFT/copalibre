import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import { isActorGranularity, type ActorGranularity } from './hierarchies.js';

/**
 * A number moved by hand or by declaration, recorded as a fact (0016).
 *
 * The tempting implementation is an increment against a stored total. It works
 * until the first correction, at which point recomputation from the log erases
 * the increment and nobody can say whether that was a bug or the point — the
 * total no longer has facts behind it, only history.
 *
 * So an adjustment is a fact like any other: it is folded, not applied, and a
 * replay of the same facts produces the same total. Which costs one row and
 * buys the invariant this whole capability rests on — **every number is a
 * fold**.
 *
 * It carries a name and a reason because a hand correction with neither is
 * indistinguishable from a bug, and the person asking about it six months later
 * is a referee, not an engineer.
 */
export interface StatisticAdjustment {
  readonly collectorCode: string;
  /** Which axis the subject sits on; the fold files the delta there. */
  readonly actorGranularity: ActorGranularity;
  readonly actorId: string;
  readonly delta: number;
  /** Why, in the operator's words; a script supplies its rule's reason. */
  readonly reason: string;
  /** Who, as `user:<id>` for a person or `script:<id>` for a declaration. */
  readonly actor: string;
}

export class AdjustmentError extends DomainError {
  readonly code = 'ADJUSTMENT_INVALID';
}

/**
 * Validates an adjustment before it becomes a fact.
 *
 * Refused rather than stored-and-ignored: a fact the fold silently skips is a
 * number an operator believes they moved.
 */
export function checkAdjustment(
  adjustment: StatisticAdjustment,
): Result<StatisticAdjustment, AdjustmentError> {
  if (!isActorGranularity(adjustment.actorGranularity)) {
    return err(
      new AdjustmentError(
        `Adjustment names actor granularity "${adjustment.actorGranularity}", which is not published`,
        { granularity: adjustment.actorGranularity },
      ),
    );
  }

  if (!Number.isFinite(adjustment.delta) || adjustment.delta === 0) {
    return err(
      new AdjustmentError('An adjustment moves a total by a finite, non-zero amount', {
        delta: adjustment.delta,
      }),
    );
  }

  if (adjustment.reason.trim() === '') {
    return err(
      new AdjustmentError(
        'An adjustment carries a reason: a hand correction without one is indistinguishable from a bug',
        { collectorCode: adjustment.collectorCode },
      ),
    );
  }

  if (adjustment.actor.trim() === '') {
    return err(
      new AdjustmentError('An adjustment carries who made it', {
        collectorCode: adjustment.collectorCode,
      }),
    );
  }

  return ok(adjustment);
}
