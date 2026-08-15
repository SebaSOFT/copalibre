import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * Closing a stage, and what a later stage may assume once it is closed.
 *
 * Completion is **not** "every match has a result". A stage whose results are
 * all in may still be open: a correction window may be running, a result may be
 * disputed, an operator may not have reviewed the table yet. Conflating the two
 * would let the next stage's draw run on a table still capable of changing —
 * and a draw is exactly the thing that must not be redone quietly.
 *
 * So completion is an explicit, gated transition, and the gate is here rather
 * than spread across the operations that follow it.
 */

export type StageStatus = 'pending' | 'running' | 'complete';

export class StageCompletionError extends DomainError {
  readonly code = 'STAGE_COMPLETION_REFUSED';

  constructor(readonly failures: readonly string[]) {
    super(`Stage cannot be completed: ${failures.join('; ')}`, { failures });
  }
}

export class StageNotReadyError extends DomainError {
  readonly code = 'NEXT_STAGE_NOT_READY';

  constructor(readonly failures: readonly string[]) {
    super(`The next stage cannot be generated: ${failures.join('; ')}`, { failures });
  }
}

export interface StageCompletionPreconditions {
  readonly status: StageStatus;
  readonly totalMatches: number;
  readonly resolvedMatches: number;
  /** Results still inside their correction window, or under dispute. */
  readonly openCorrections?: number;
}

export function validateStageCompletion(
  preconditions: StageCompletionPreconditions,
): Result<true, StageCompletionError> {
  const failures: string[] = [];

  if (preconditions.status === 'complete') {
    failures.push('stage is already complete');
  }
  if (preconditions.status === 'pending') {
    failures.push('stage has not started');
  }
  if (preconditions.totalMatches === 0) {
    failures.push('stage has no matches');
  }
  if (preconditions.resolvedMatches < preconditions.totalMatches) {
    failures.push(
      `${preconditions.totalMatches - preconditions.resolvedMatches} of ${preconditions.totalMatches} matches are unresolved`,
    );
  }
  if ((preconditions.openCorrections ?? 0) > 0) {
    failures.push(`${preconditions.openCorrections} correction(s) are still open`);
  }

  return failures.length > 0 ? err(new StageCompletionError(failures)) : ok(true);
}

export interface NextStagePreconditions {
  readonly priorStageStatus: StageStatus;
  /** The qualification cut resolved without a contested line. */
  readonly cutResolved: boolean;
  /** Fixtures already generated for the next stage; regenerating is a rebuild. */
  readonly nextStageFixturesGenerated?: boolean;
}

/**
 * The gate before a next stage's fixtures may be generated. Both conditions
 * matter and neither implies the other: a stage can be complete with a cut
 * still contested, and a cut can resolve while the stage is still open.
 */
export function validateNextStage(
  preconditions: NextStagePreconditions,
): Result<true, StageNotReadyError> {
  const failures: string[] = [];

  if (preconditions.priorStageStatus !== 'complete') {
    failures.push(`the prior stage is ${preconditions.priorStageStatus}, not complete`);
  }
  if (!preconditions.cutResolved) {
    failures.push('the qualification cut is unresolved');
  }
  if (preconditions.nextStageFixturesGenerated) {
    failures.push('the next stage already has fixtures; regenerating them is a rebuild');
  }

  return failures.length > 0 ? err(new StageNotReadyError(failures)) : ok(true);
}
