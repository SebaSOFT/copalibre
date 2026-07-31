import type { RuleScript } from '../descriptors/discipline-descriptor.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * What an operator may impose on a draw (0010-stage-qualification-and-seeding).
 *
 * *Always put one Buenos Aires club in each group*; *never draw two San Juan
 * clubs against each other in the round of 16, because their level is far above
 * the rest*. Neither is expressible as an ordering — they are constraints over
 * attributes the operator knows and the system does not.
 *
 * Constraints attach to named **hook points** rather than being a seeding-only
 * feature, so phase 12's scheduling conflicts and the eligibility guards can
 * attach to this surface instead of each growing a private one. This phase
 * defines the taxonomy and implements the `draw.*` and `seed.*` hooks.
 */

export const CONSTRAINT_HOOK_POINTS = [
  /** Placing an entrant into a group. */
  'draw.assign-group',
  /** Pairing two entrants within a round. */
  'draw.pair-round',
  /** Deciding seed order. */
  'seed.order',
  /** Phase 12: rest rules and venue conflicts. */
  'schedule.assign-slot',
  /** Roster and check-in rules. */
  'entrant.eligibility',
  /** Qualification-cut admissibility. */
  'stage.advance',
] as const;

export type ConstraintHookPoint = (typeof CONSTRAINT_HOOK_POINTS)[number];

/** Hooks this phase evaluates; the rest are declared here and used later. */
export const IMPLEMENTED_HOOK_POINTS: readonly ConstraintHookPoint[] = [
  'draw.assign-group',
  'draw.pair-round',
  'seed.order',
];

/**
 * Entrants sharing an attribute value must be kept apart — in different groups,
 * or out of each other's path until a named round.
 *
 * The round is named rather than assumed to be the first: an operator may not
 * mind two strong clubs meeting in the final and mind very much in the round of
 * 16. The constraint is about *where in the bracket* two entrants can meet.
 */
export interface SeparationConstraint {
  readonly kind: 'separation';
  readonly hook: 'draw.assign-group' | 'draw.pair-round';
  readonly attribute: string;
  readonly scope: 'group' | { readonly beforeRound: string };
}

/** Each group must hold at least/at most N entrants carrying a value. */
export interface DistributionConstraint {
  readonly kind: 'distribution';
  readonly hook: 'draw.assign-group';
  readonly attribute: string;
  readonly value: string;
  readonly min?: number;
  readonly max?: number;
}

/**
 * The escape hatch: a rule script over the core-owned constraint action
 * registry, on the boundary 0009 established for win conditions — a module
 * composes vocabulary, it does not introduce it. This keeps a constraint nobody
 * anticipated expressible without a core release, without giving up the
 * vetted-action guarantee.
 */
export interface ScriptConstraint {
  readonly kind: 'script';
  readonly hook: ConstraintHookPoint;
  readonly script: RuleScript;
}

export type DrawConstraint = SeparationConstraint | DistributionConstraint | ScriptConstraint;

export class DrawConstraintError extends DomainError {
  readonly code = 'DRAW_CONSTRAINT_INVALID';
}

export function validateConstraint(
  constraint: DrawConstraint,
): Result<DrawConstraint, DrawConstraintError> {
  if (!CONSTRAINT_HOOK_POINTS.includes(constraint.hook)) {
    return err(
      new DrawConstraintError(
        `Unknown constraint hook point "${String(constraint.hook)}". ` +
          `Known hooks: ${CONSTRAINT_HOOK_POINTS.join(', ')}`,
        { hook: constraint.hook },
      ),
    );
  }

  if (constraint.kind !== 'script' && !IMPLEMENTED_HOOK_POINTS.includes(constraint.hook)) {
    return err(
      new DrawConstraintError(
        `Hook point "${constraint.hook}" is declared but not evaluated yet; ` +
          'it lands with the phase that owns it',
        { hook: constraint.hook },
      ),
    );
  }

  if (constraint.kind === 'distribution') {
    if (constraint.min === undefined && constraint.max === undefined) {
      return err(
        new DrawConstraintError('A distribution constraint needs at least one of min or max', {
          attribute: constraint.attribute,
        }),
      );
    }
    if (
      constraint.min !== undefined &&
      constraint.max !== undefined &&
      constraint.min > constraint.max
    ) {
      return err(
        new DrawConstraintError(
          `A distribution constraint cannot require at least ${constraint.min} and at most ${constraint.max}`,
          { attribute: constraint.attribute, min: constraint.min, max: constraint.max },
        ),
      );
    }
  }

  if (constraint.kind === 'separation' && typeof constraint.scope === 'object') {
    if (constraint.scope.beforeRound.trim() === '') {
      return err(
        new DrawConstraintError('A separation scope must name the round it applies before'),
      );
    }
  }

  return ok(constraint);
}

/**
 * Conventional knockout round names, resolved against a bracket size because
 * "the round of 16" is round 1 of a 16-entrant bracket and round 2 of a 32-one.
 * A name the caller does not use never needs to be understood.
 */
const ROUND_NAMES: Readonly<Record<string, number>> = {
  final: 2,
  'semi-final': 4,
  'quarter-final': 8,
  'round-of-16': 16,
  'round-of-32': 32,
  'round-of-64': 64,
};

/**
 * The 1-based round in a bracket of `size` at which `name` is played, or an
 * error when the name is unknown or the bracket never reaches it.
 */
export function roundNumberFor(name: string, size: number): Result<number, DrawConstraintError> {
  const entrantsInRound = ROUND_NAMES[name];
  if (entrantsInRound === undefined) {
    return err(
      new DrawConstraintError(
        `Unknown round name "${name}". Known names: ${Object.keys(ROUND_NAMES).join(', ')}`,
        { name },
      ),
    );
  }
  if (entrantsInRound > size) {
    return err(
      new DrawConstraintError(
        `A bracket of ${size} never plays "${name}", which needs ${entrantsInRound} entrants`,
        { name, size },
      ),
    );
  }
  return ok(Math.log2(size) - Math.log2(entrantsInRound) + 1);
}
