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

export interface RawStageStatusCount {
  readonly stageId: string;
  readonly stageNumber: number;
  readonly stageName: string;
  readonly status: string | null;
  readonly count: number;
}

export interface StageCompletionSummary {
  readonly stageId: string;
  readonly stageNumber: number;
  readonly stageName: string;
  readonly totalMatches: number;
  readonly resolvedMatches: number;
  readonly liveMatches: number;
  readonly scheduledMatches: number;
  readonly finalizedMatches: number;
  readonly forfeitedMatches: number;
}

export interface TournamentCompletionSummary {
  readonly totalMatches: number;
  readonly resolvedMatches: number;
  readonly liveMatches: number;
  readonly scheduledMatches: number;
  readonly finalizedMatches: number;
  readonly forfeitedMatches: number;
  readonly stages: readonly StageCompletionSummary[];
}

/**
 * Folds grouped match-status rows into per-stage completion counts and a tournament-wide rollup.
 * Reuses the platform definition: resolved = finalized + forfeited.
 * Not-required matches (anulled series games) are omitted from total and active counts.
 */
export function foldTournamentCompletion(
  stageCounts: readonly RawStageStatusCount[],
): TournamentCompletionSummary {
  const stageMap = new Map<
    string,
    {
      stageId: string;
      stageNumber: number;
      stageName: string;
      totalMatches: number;
      resolvedMatches: number;
      liveMatches: number;
      scheduledMatches: number;
      finalizedMatches: number;
      forfeitedMatches: number;
    }
  >();

  for (const row of stageCounts) {
    let entry = stageMap.get(row.stageId);
    if (!entry) {
      entry = {
        stageId: row.stageId,
        stageNumber: row.stageNumber,
        stageName: row.stageName,
        totalMatches: 0,
        resolvedMatches: 0,
        liveMatches: 0,
        scheduledMatches: 0,
        finalizedMatches: 0,
        forfeitedMatches: 0,
      };
      stageMap.set(row.stageId, entry);
    }

    const cnt = Math.max(0, row.count);
    if (cnt > 0 && row.status) {
      if (row.status === 'finalized') {
        entry.finalizedMatches += cnt;
        entry.resolvedMatches += cnt;
        entry.totalMatches += cnt;
      } else if (row.status === 'forfeited') {
        entry.forfeitedMatches += cnt;
        entry.resolvedMatches += cnt;
        entry.totalMatches += cnt;
      } else if (row.status === 'live' || row.status === 'in-progress') {
        entry.liveMatches += cnt;
        entry.totalMatches += cnt;
      } else if (row.status === 'scheduled') {
        entry.scheduledMatches += cnt;
        entry.totalMatches += cnt;
      }
    }
  }

  const stages = Array.from(stageMap.values()).sort((a, b) => a.stageNumber - b.stageNumber);

  let totalMatches = 0;
  let resolvedMatches = 0;
  let liveMatches = 0;
  let scheduledMatches = 0;
  let finalizedMatches = 0;
  let forfeitedMatches = 0;

  for (const s of stages) {
    totalMatches += s.totalMatches;
    resolvedMatches += s.resolvedMatches;
    liveMatches += s.liveMatches;
    scheduledMatches += s.scheduledMatches;
    finalizedMatches += s.finalizedMatches;
    forfeitedMatches += s.forfeitedMatches;
  }

  return {
    totalMatches,
    resolvedMatches,
    liveMatches,
    scheduledMatches,
    finalizedMatches,
    forfeitedMatches,
    stages,
  };
}
