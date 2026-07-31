import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * How a stage's seed order is decided (0010-stage-qualification-and-seeding).
 *
 * Phase 7 generates fixtures from a caller-supplied seed order and never asks
 * where it came from. This declares where: the prior stage's qualification cut,
 * an operator's explicit placement, or a numeric entrant attribute.
 */

export type SeedDirection = 'higher-first' | 'lower-first';

/**
 * Seed order is the prior stage's cut order.
 *
 * The default, and the wrong answer often enough to need the alternatives
 * below: two entrants emerging first and second from one strong group are not
 * the tournament's first and second best, and seeding them as such defeats the
 * bracket pairing phase 7 performs.
 */
export interface AutomaticAllocation {
  readonly mode: 'automatic';
}

/** The operator places entrants into seed positions directly. */
export interface ManualAllocation {
  readonly mode: 'manual';
}

/**
 * Seed order comes from a numeric entrant attribute. `direction` is required
 * and never inferred: a ranking where 1 is best sorts `lower-first`, an Elo
 * where higher is better sorts `higher-first`, and guessing from the values
 * would silently invert a bracket.
 */
export interface WeightedAllocation {
  readonly mode: 'weighted';
  readonly attributeKey: string;
  readonly direction: SeedDirection;
}

export type StageAllocation = AutomaticAllocation | ManualAllocation | WeightedAllocation;

export const ALLOCATION_MODES: readonly StageAllocation['mode'][] = [
  'automatic',
  'manual',
  'weighted',
];

export class StageAllocationError extends DomainError {
  readonly code = 'STAGE_ALLOCATION_INVALID';
}

/** One operator-assigned seed position. */
export interface SeedPlacement {
  readonly entrantId: string;
  /** 1-based seed position within the stage. */
  readonly seed: number;
}

export function validateAllocation(
  allocation: StageAllocation,
): Result<StageAllocation, StageAllocationError> {
  if (!ALLOCATION_MODES.includes(allocation.mode)) {
    return err(
      new StageAllocationError(`Unknown allocation mode "${String(allocation.mode)}"`, {
        mode: allocation.mode,
      }),
    );
  }
  if (allocation.mode === 'weighted' && allocation.attributeKey.trim() === '') {
    return err(
      new StageAllocationError('Weighted allocation requires the attribute key to rank on'),
    );
  }
  return ok(allocation);
}

/**
 * A stage advances a declared number of entrants into a fixed number of seed
 * slots, and a mismatch is a configuration error rather than something to
 * resolve at draw time — an operator who advances 9 into an 8-slot bracket
 * needs to hear it while configuring, not while the draw runs.
 */
export function assertSlotCount(
  advancing: number,
  slots: number,
): Result<true, StageAllocationError> {
  if (advancing === slots) return ok(true);
  return err(
    new StageAllocationError(
      `A stage advancing ${advancing} entrant(s) cannot fill ${slots} seed slot(s)`,
      { advancing, slots },
    ),
  );
}
