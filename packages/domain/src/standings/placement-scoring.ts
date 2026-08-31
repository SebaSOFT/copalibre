import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { OutcomeValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { RecordedOutcome } from './outcome.js';

/**
 * Turning finishing positions into points the standings can add up.
 *
 * The award is emitted as an **ordinary declared statistic**, not as a special
 * kind of value: the comparator pipeline, the qualification cut and the
 * standings table then read it with no special case, exactly as they read
 * `frags` or `goals-for`. That is the whole reason placement scoring belongs
 * here rather than in the ranking code — accounting folds
 * what the discipline declares, and this declares one more thing.
 */

/**
 * Fills in each side's placement points, leaving every other statistic alone.
 *
 * A value the recorder already supplied wins, on the same principle
 * applied to derived statistics: a discipline that computes its own placement
 * points has a reason, and the engine does not second-guess a recorded fact.
 */
export function applyPlacementScoring(
  descriptor: DisciplineDescriptor,
  outcome: RecordedOutcome,
): Result<RecordedOutcome, OutcomeValidationError> {
  const scoring = descriptor.placementScoring;
  if (!scoring) return ok(outcome);

  const declared = descriptor.statistics.some(
    (statistic) => statistic.code === scoring.statisticCode,
  );
  if (!declared) {
    return err(
      new OutcomeValidationError(
        `Placement scoring awards "${scoring.statisticCode}", which discipline "${descriptor.name}" does not declare`,
        { descriptorId: descriptor.descriptorId, code: scoring.statisticCode },
      ),
    );
  }

  const unplaced = outcome.sides.find((side) => side.placement === undefined);
  if (unplaced) {
    return err(
      new OutcomeValidationError(
        `Placement scoring needs every side placed; "${unplaced.entrantId}" has no placement`,
        { matchId: outcome.matchId, entrantId: unplaced.entrantId },
      ),
    );
  }

  return ok({
    ...outcome,
    sides: outcome.sides.map((side) => ({
      ...side,
      statistics: {
        [scoring.statisticCode]: pointsFor(descriptor, side.placement as number),
        ...side.statistics,
      },
    })),
  });
}

/**
 * Points for a finishing position. A position the table does not name is worth
 * `beyondTable` — zero unless the discipline says otherwise, which is what a
 * battle royale that scores only its top ten actually means.
 */
export function pointsFor(descriptor: DisciplineDescriptor, placement: number): number {
  const scoring = descriptor.placementScoring;
  if (!scoring) return 0;
  const row = scoring.table.find((entry) => entry.placement === placement);
  return row ? row.points : (scoring.beyondTable ?? 0);
}

/**
 * Two sides sharing a position share the position's points, rather than the
 * runner-up's. Whether the following position is then skipped is the
 * discipline-dependent question; awarding the tied position's
 * own value is the part every convention agrees on.
 */
export function validatePlacementTable(
  descriptor: DisciplineDescriptor,
): Result<true, OutcomeValidationError> {
  const scoring = descriptor.placementScoring;
  if (!scoring) return ok(true);

  const seen = new Set<number>();
  for (const entry of scoring.table) {
    if (!Number.isInteger(entry.placement) || entry.placement < 1) {
      return err(
        new OutcomeValidationError(
          `A placement points table needs 1-based positions, not ${entry.placement}`,
          { descriptorId: descriptor.descriptorId, placement: entry.placement },
        ),
      );
    }
    if (seen.has(entry.placement)) {
      return err(
        new OutcomeValidationError(
          `Placement ${entry.placement} appears more than once in the points table`,
          { descriptorId: descriptor.descriptorId, placement: entry.placement },
        ),
      );
    }
    seen.add(entry.placement);
  }
  return ok(true);
}
