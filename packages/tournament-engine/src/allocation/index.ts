import {
  assertSlotCount,
  numericAttribute,
  type EntrantAttribute,
  type SeedDirection,
  type SeedPlacement,
  type StageAllocation,
} from '@copalibre/domain';
import type { TraceNode } from '@copalibre/rules';
import { AllocationError } from '../errors.js';
import type { SeededEntrant } from '../types.js';

export { drawGroups, drawZones } from './draw.js';

/**
 * Turning "who advanced" into "who plays whom" — the seam between stages.
 *
 * Phase 7 takes a seed order and asks nothing about it. This module produces
 * that order from one of the three declared modes, and explains itself on the
 * same trace contract standings and win conditions already use: an operator who
 * disputes a bracket needs to see which rule put an entrant on seed 3, not a
 * bare number.
 *
 * Allocation is pure. Persisting the resulting seeds — and recording who
 * ordered a manual placement — is the caller's audited write.
 */

export interface AllocationEntrant {
  readonly entrantId: string;
  readonly attributes?: readonly EntrantAttribute[];
}

export interface AllocationOutcome {
  /** Seed order, 1-based and contiguous, ready for `generateFixtures`. */
  readonly seeds: readonly SeededEntrant[];
  readonly trace: readonly TraceNode[];
}

export interface AllocationInput {
  readonly allocation: StageAllocation;
  /** Entrants eligible for this stage, with whatever attributes they carry. */
  readonly entrants: readonly AllocationEntrant[];
  /**
   * Automatic mode: entrant ids in qualification-cut order, best first. Ignored
   * by the other modes.
   */
  readonly qualified?: readonly string[];
  /** Manual mode: the operator's explicit placements. */
  readonly placements?: readonly SeedPlacement[];
  /** When set, the resulting seed count must match the stage's slot count. */
  readonly slots?: number;
}

export function allocateSeeds(input: AllocationInput): AllocationOutcome {
  const seeds = seedsFor(input);

  if (input.slots !== undefined) {
    const fits = assertSlotCount(seeds.length, input.slots);
    if (!fits.ok) {
      throw new AllocationError(fits.error.message, { ...fits.error.details });
    }
  }

  return { seeds, trace: [traceFor(input.allocation, seeds)] };
}

function seedsFor(input: AllocationInput): readonly SeededEntrant[] {
  switch (input.allocation.mode) {
    case 'automatic':
      return fromQualificationOrder(input);
    case 'manual':
      return fromPlacements(input);
    case 'weighted':
      return fromAttribute(input, input.allocation.attributeKey, input.allocation.direction);
  }
}

/** Cut order is seed order: the entrant who topped the cut takes seed 1. */
function fromQualificationOrder(input: AllocationInput): readonly SeededEntrant[] {
  const qualified = input.qualified ?? [];
  if (qualified.length === 0) {
    throw new AllocationError(
      'Automatic allocation needs the prior stage qualification cut, which is empty',
      { mode: 'automatic' },
    );
  }

  const eligible = new Set(input.entrants.map((entrant) => entrant.entrantId));
  const unknown = qualified.filter((entrantId) => !eligible.has(entrantId));
  if (unknown.length > 0) {
    throw new AllocationError(
      `The qualification cut names ${unknown.length} entrant(s) not in this stage`,
      { unknown },
    );
  }

  return qualified.map((entrantId, index) => ({ entrantId, seed: index + 1 }));
}

/**
 * Manual placement is exact: every entrant placed, every seed filled, no gaps.
 * A partial placement would leave the engine inventing the rest, which is the
 * opposite of what an operator asking for manual control wants.
 */
function fromPlacements(input: AllocationInput): readonly SeededEntrant[] {
  const placements = input.placements ?? [];
  const expected = input.entrants.length;

  if (placements.length !== expected) {
    throw new AllocationError(
      `Manual allocation needs a placement for every entrant: ${placements.length} of ${expected} placed`,
      { placed: placements.length, expected },
    );
  }

  const eligible = new Set(input.entrants.map((entrant) => entrant.entrantId));
  const seen = new Set<number>();
  for (const placement of placements) {
    if (!eligible.has(placement.entrantId)) {
      throw new AllocationError(
        `Manual placement names entrant "${placement.entrantId}", which is not in this stage`,
        { entrantId: placement.entrantId },
      );
    }
    if (!Number.isInteger(placement.seed) || placement.seed < 1 || placement.seed > expected) {
      throw new AllocationError(`Seed ${placement.seed} is outside 1..${expected}`, {
        entrantId: placement.entrantId,
        seed: placement.seed,
      });
    }
    if (seen.has(placement.seed)) {
      throw new AllocationError(`Seed ${placement.seed} is assigned to more than one entrant`, {
        seed: placement.seed,
      });
    }
    seen.add(placement.seed);
  }

  return [...placements]
    .sort((a, b) => a.seed - b.seed)
    .map((placement) => ({ entrantId: placement.entrantId, seed: placement.seed }));
}

/**
 * Ranking-weighted seeding, which exists because qualification order is not
 * strength order. Ties break on entrant id — arbitrary, but deterministic, and
 * determinism is the product invariant here.
 */
function fromAttribute(
  input: AllocationInput,
  key: string,
  direction: SeedDirection,
): readonly SeededEntrant[] {
  const ranked = input.entrants.map((entrant) => {
    const value = numericAttribute(entrant.attributes ?? [], key);
    if (value === undefined) {
      throw new AllocationError(
        `Weighted allocation on "${key}" requires it on every entrant; "${entrant.entrantId}" has no value`,
        { key, entrantId: entrant.entrantId },
      );
    }
    return { entrantId: entrant.entrantId, value };
  });

  ranked.sort((a, b) =>
    a.value === b.value
      ? a.entrantId.localeCompare(b.entrantId)
      : direction === 'higher-first'
        ? b.value - a.value
        : a.value - b.value,
  );

  return ranked.map((entry, index) => ({ entrantId: entry.entrantId, seed: index + 1 }));
}

function traceFor(allocation: StageAllocation, seeds: readonly SeededEntrant[]): TraceNode {
  const order = Object.fromEntries(seeds.map((seed) => [seed.entrantId, seed.seed]));
  return {
    kind: 'action',
    id: `allocation:${allocation.mode}`,
    label: `Seed allocation (${allocation.mode})`,
    outcome: 'allocated',
    values: order,
    detail:
      allocation.mode === 'weighted'
        ? `Seeded by attribute "${allocation.attributeKey}", ${allocation.direction}`
        : allocation.mode === 'automatic'
          ? 'Seeded in qualification-cut order'
          : 'Seeded by explicit operator placement',
  };
}
