import type { MatchResult } from './competition.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * Correcting a result.
 *
 * The decision record is unambiguous: "The MVP permits no direct overwrite of
 * an outcome." So a correction is not an update — it is a new fact that
 * supersedes an old one and keeps it, carrying who, when, why, what it was and
 * what it became.
 *
 * The mandatory reason is the load-bearing part. A result that changed without
 * one is indistinguishable from a mistake, and the surface that has to explain
 * the change to a club is the same surface that would have to say "we do not
 * know why".
 */

export interface CorrectionRequest {
  readonly matchId: string;
  readonly replacement: MatchResult;
  /** Why, in the operator's words. Never derived, never defaulted. */
  readonly reason: string;
  readonly actor: string;
  /**
   * A participant report/dispute this correction cites — retained as
   * supporting evidence in the audit trail. Citing one grants no authority of
   * its own; the operator still supplies their own `replacement` and `reason`
   * exactly as any other correction would.
   */
  readonly sourceReportId?: string;
}

export class CorrectionError extends DomainError {
  readonly code = 'CORRECTION_INVALID';
}

/**
 * What a downstream stage is doing while a correction is proposed.
 *
 * A correction that would change who qualified, after the next stage has been
 * drawn and started, cannot simply propagate: the fixtures exist and may have
 * been played. The decision record calls for the corrected fact to be recorded
 * and the propagation to be *blocked pending authorized resolution*, which is
 * what `blockedPropagation` says.
 */
export interface DownstreamState {
  readonly stageId: string;
  readonly started: boolean;
  /** Entrants the downstream stage was built from. */
  readonly qualifiedEntrantIds: readonly string[];
}

export interface CorrectionPlan {
  readonly matchId: string;
  readonly reason: string;
  readonly prior: MatchResult;
  readonly replacement: MatchResult;
  readonly sourceReportId?: string;
  /** Entrants whose recorded numbers move. */
  readonly changedEntrantIds: readonly string[];
  /**
   * Set when a started downstream stage would have been rebuilt. The correction
   * still commits — the fact is true — but nothing downstream moves until
   * somebody with the authority decides what to do.
   */
  readonly blockedPropagation?: {
    readonly stageId: string;
    readonly reason: string;
  };
}

/**
 * Validates a correction and reports exactly what committing it would move.
 *
 * The same function serves the preview and the commit, so a preview cannot
 * promise something the commit then does differently — the rule 0012 settled
 * for scheduling, applied to results.
 */
export function planCorrection(
  request: CorrectionRequest,
  prior: MatchResult | undefined,
  downstream?: DownstreamState,
): Result<CorrectionPlan, CorrectionError> {
  if (request.reason.trim() === '') {
    return err(
      new CorrectionError(
        'A correction requires a reason; a result that changed silently is a bug',
        {
          matchId: request.matchId,
        },
      ),
    );
  }

  if (!prior) {
    return err(
      new CorrectionError(
        `Match "${request.matchId}" has no result to correct; record one through finalization`,
        { matchId: request.matchId },
      ),
    );
  }

  if (request.replacement.sides.length !== prior.sides.length) {
    return err(
      new CorrectionError(
        `A correction must describe the same ${prior.sides.length} side(s) the result has`,
        { matchId: request.matchId, sides: request.replacement.sides.length },
      ),
    );
  }

  const priorById = new Map(prior.sides.map((side) => [side.entrantId, side]));
  const unknown = request.replacement.sides.find((side) => !priorById.has(side.entrantId));
  if (unknown) {
    return err(
      new CorrectionError(
        `A correction may not change who played: "${unknown.entrantId}" was not a side of this match`,
        { matchId: request.matchId, entrantId: unknown.entrantId },
      ),
    );
  }

  const changedEntrantIds = request.replacement.sides
    .filter((side) => !sameNumbers(priorById.get(side.entrantId)?.statistics, side.statistics))
    .map((side) => side.entrantId);

  const winnerChanged = request.replacement.winnerEntrantId !== prior.winnerEntrantId;
  if (changedEntrantIds.length === 0 && !winnerChanged) {
    return err(
      new CorrectionError('A correction that changes nothing is not a correction', {
        matchId: request.matchId,
      }),
    );
  }

  const blocked =
    downstream?.started === true
      ? {
          stageId: downstream.stageId,
          reason:
            `Stage "${downstream.stageId}" has already started; the corrected result is recorded ` +
            'but nothing downstream is rebuilt until an authorized resolution says so',
        }
      : undefined;

  return ok({
    matchId: request.matchId,
    reason: request.reason,
    prior,
    replacement: request.replacement,
    changedEntrantIds,
    ...(request.sourceReportId === undefined ? {} : { sourceReportId: request.sourceReportId }),
    ...(blocked ? { blockedPropagation: blocked } : {}),
  });
}

function sameNumbers(
  left: Readonly<Record<string, number>> | undefined,
  right: Readonly<Record<string, number>>,
): boolean {
  if (!left) return false;
  const codes = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const code of codes) {
    if (left[code] !== right[code]) return false;
  }
  return true;
}
