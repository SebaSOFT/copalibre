import {
  categoricalAttribute,
  roundNumberFor,
  validateConstraint,
  type DrawConstraint,
} from '@copalibre/domain';
import type { TraceNode } from '@copalibre/rules';
import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import {
  evaluateConstraints,
  type ConstrainedEntrant,
  type ConstraintViolation,
  type DrawAssignment,
} from '../constraints/index.js';
import { DrawError } from '../errors.js';

/**
 * A constrained draw: randomised, reproducible, and total.
 *
 * A draw with constraints is not a sort — it is a constraint-satisfaction
 * problem with a random component, exactly as a real competition draw is. Three
 * properties follow, and each is deliberate:
 *
 * - **Reproducible.** Determinism is a product invariant, so the randomness runs
 *   from an explicitly recorded seed. The same seed, entrants and constraints
 *   reproduce the same draw exactly, which is what makes a draw auditable and
 *   replayable after a correction.
 * - **Bounded.** Backtracking search suffices at the scale involved (tens to low
 *   hundreds of entrants); no external solver is warranted. Search is capped, and
 *   exhausting the cap is a failure, never a silent partial result.
 * - **Explained on failure.** An impossible constraint set is diagnosed before
 *   searching where the arithmetic allows it, so the operator is told *which*
 *   constraint cannot hold and against what structural limit, rather than
 *   watching a search time out.
 */

export type DrawShape =
  | { readonly kind: 'groups'; readonly count: number }
  | { readonly kind: 'bracket'; readonly size: number };

/**
 * Scripted constraints are evaluated by `@copalibre/rules`, which owns the
 * action registry. The caller injects the evaluation so the engine keeps no
 * registry of its own and stays pure.
 */
export type ScriptConstraintEvaluator = (assignment: DrawAssignment) => {
  readonly satisfied: boolean;
  readonly reasons: readonly string[];
};

export interface DrawRequest {
  readonly entrants: readonly ConstrainedEntrant[];
  readonly constraints: readonly DrawConstraint[];
  readonly shape: DrawShape;
  /** Recorded with the result; the same seed reproduces the same draw. */
  readonly seed: number;
  /** Assignments explored before the search gives up. */
  readonly maxSteps?: number;
  readonly evaluateScripts?: ScriptConstraintEvaluator;
}

export interface DrawOutcome {
  readonly assignment: DrawAssignment;
  /** Echoed back so the caller stores what actually produced this draw. */
  readonly seed: number;
  readonly steps: number;
  readonly trace: readonly TraceNode[];
}

const DEFAULT_MAX_STEPS = 200_000;

export function runDraw(request: DrawRequest): DrawOutcome {
  for (const constraint of request.constraints) {
    const valid = validateConstraint(constraint);
    if (!valid.ok) throw new DrawError(valid.error.message, { ...valid.error.details });
  }

  assertSatisfiable(request);

  const positions = positionsFor(request.shape);
  // A bracket holds one entrant per slot; a group holds several, so only the
  // bracket case is a capacity error rather than an ordinary crowded group.
  if (request.shape.kind === 'bracket' && request.entrants.length > positions.length) {
    throw new DrawError(
      `${request.entrants.length} entrants cannot be drawn into a bracket of ${positions.length}`,
      { entrants: request.entrants.length, slots: positions.length },
    );
  }

  const order = shuffled(request.entrants, request.seed);
  const maxSteps = request.maxSteps ?? DEFAULT_MAX_STEPS;
  const taken = new Map<string, number>();
  let steps = 0;

  const place = (index: number): boolean => {
    if (index === order.length) return true;

    const entrant = order[index] as ConstrainedEntrant;
    for (const position of positions) {
      if (request.shape.kind === 'bracket' && [...taken.values()].includes(position)) continue;
      if (
        request.shape.kind === 'groups' &&
        capacityUsed(taken, position) >= groupCapacity(order.length, request.shape.count)
      ) {
        continue;
      }

      steps += 1;
      if (steps > maxSteps) {
        throw new DrawError(
          `The draw did not settle within ${maxSteps} steps; the constraint set may be unsatisfiable`,
          { maxSteps, placed: taken.size, entrants: order.length },
        );
      }

      taken.set(entrant.entrantId, position);
      if (partialHolds(request, taken) && place(index + 1)) return true;
      taken.delete(entrant.entrantId);
    }

    return false;
  };

  if (!place(0)) {
    throw new DrawError(
      'No assignment satisfies the declared constraints; the search was exhausted',
      { entrants: order.length, steps },
    );
  }

  const assignment = assignmentFrom(request.shape, taken);

  // Nothing partial ever escapes: the completed draw is re-checked against the
  // full constraint set, including the ones a partial assignment cannot judge.
  const final = evaluateConstraints(request.constraints, request.entrants, assignment);
  if (!final.satisfied) {
    throw new DrawError(
      'The completed draw breaks a constraint that a partial one could not judge',
      {
        violations: final.violations.map((violation) => violation.detail),
      },
    );
  }

  const scripted = request.evaluateScripts?.(assignment);
  if (scripted && !scripted.satisfied) {
    throw new DrawError('The completed draw was rejected by a scripted constraint', {
      reasons: [...scripted.reasons],
    });
  }

  return { assignment, seed: request.seed, steps, trace: [drawNode(request, steps)] };
}

/**
 * Pigeonhole checks the search would otherwise discover slowly and report
 * vaguely. Where the arithmetic settles it, say so exactly: *5 entrants carry
 * region=san-juan but only 4 sub-brackets could separate them*.
 */
function assertSatisfiable(request: DrawRequest): void {
  for (const constraint of request.constraints) {
    if (constraint.kind === 'separation') {
      const largest = largestSharedValue(request.entrants, constraint.attribute);
      if (!largest) continue;

      const capacity = separationCapacity(request.shape, constraint.scope);
      if (capacity !== undefined && largest.count > capacity) {
        throw new DrawError(
          `Unsatisfiable: ${largest.count} entrants carry ${constraint.attribute}=${largest.value}, ` +
            `but only ${capacity} ${request.shape.kind === 'groups' ? 'group(s)' : 'sub-bracket(s)'} could separate them`,
          {
            constraint: 'separation',
            attribute: constraint.attribute,
            value: largest.value,
            carriers: largest.count,
            capacity,
          },
        );
      }
    }

    if (constraint.kind === 'distribution' && constraint.min !== undefined) {
      if (request.shape.kind !== 'groups') continue;
      const carriers = request.entrants.filter(
        (entrant) =>
          categoricalAttribute(entrant.attributes, constraint.attribute) === constraint.value,
      ).length;
      const required = constraint.min * request.shape.count;

      if (carriers < required) {
        throw new DrawError(
          `Unsatisfiable: ${request.shape.count} groups need at least ${constraint.min} entrant(s) ` +
            `with ${constraint.attribute}=${constraint.value} each (${required} in total), but only ${carriers} exist`,
          {
            constraint: 'distribution',
            attribute: constraint.attribute,
            value: constraint.value,
            carriers,
            required,
          },
        );
      }
    }
  }
}

/** How many mutually-separating containers this shape offers. */
function separationCapacity(
  shape: DrawShape,
  scope: 'group' | { readonly beforeRound: string },
): number | undefined {
  if (scope === 'group') return shape.kind === 'groups' ? shape.count : undefined;
  if (shape.kind !== 'bracket') return undefined;

  const limit = roundNumberFor(scope.beforeRound, shape.size);
  if (!limit.ok) throw new DrawError(limit.error.message, { ...limit.error.details });

  // Entrants that must not meet before round R have to sit in different
  // sub-brackets of size 2^(R-1); there are size / 2^(R-1) of those.
  return shape.size / 2 ** (limit.value - 1);
}

function largestSharedValue(
  entrants: readonly ConstrainedEntrant[],
  attribute: string,
): { readonly value: string; readonly count: number } | undefined {
  const counts = new Map<string, number>();
  for (const entrant of entrants) {
    const value = categoricalAttribute(entrant.attributes, attribute);
    if (value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let largest: { value: string; count: number } | undefined;
  for (const [value, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (!largest || count > largest.count) largest = { value, count };
  }
  return largest;
}

/**
 * A partial assignment is judged only by what it can already contradict: two
 * entrants sharing a group, or a maximum already exceeded. A minimum is not
 * checkable yet — a group short of its quota may still receive one.
 */
function partialHolds(request: DrawRequest, taken: ReadonlyMap<string, number>): boolean {
  const placed = request.entrants.filter((entrant) => taken.has(entrant.entrantId));
  const assignment = assignmentFrom(request.shape, taken);
  const decidable = request.constraints.filter(
    (constraint) =>
      constraint.kind === 'separation' ||
      (constraint.kind === 'distribution' && constraint.max !== undefined),
  );
  if (decidable.length === 0) return true;

  const evaluation = evaluateConstraints(decidable.map(stripMinimum), placed, assignment);
  return evaluation.satisfied;
}

/** The `min` half of a distribution cannot be judged mid-draw; drop it. */
function stripMinimum(constraint: DrawConstraint): DrawConstraint {
  return constraint.kind === 'distribution' ? { ...constraint, min: undefined } : constraint;
}

function assignmentFrom(shape: DrawShape, taken: ReadonlyMap<string, number>): DrawAssignment {
  const placement = Object.fromEntries(taken);
  return shape.kind === 'groups'
    ? { groups: placement }
    : { slots: placement, bracketSize: shape.size };
}

function positionsFor(shape: DrawShape): readonly number[] {
  const count = shape.kind === 'groups' ? shape.count : shape.size;
  if (!Number.isInteger(count) || count < 1) {
    throw new DrawError(`A draw needs at least one position, not ${count}`, { count });
  }
  if (shape.kind === 'bracket' && !Number.isInteger(Math.log2(count))) {
    throw new DrawError(`A bracket must be a power of two, not ${count}`, { size: count });
  }
  return Array.from({ length: count }, (_unused, index) => index + 1);
}

function capacityUsed(taken: ReadonlyMap<string, number>, position: number): number {
  let used = 0;
  for (const value of taken.values()) if (value === position) used += 1;
  return used;
}

function groupCapacity(entrants: number, groups: number): number {
  return Math.ceil(entrants / groups);
}

/**
 * Fisher-Yates over a seeded generator. `pure-rand` rather than a hand-rolled
 * LCG: a biased shuffle is a rigged draw, and this is precisely the kind of
 * utility the project does not write itself.
 */
function shuffled(
  entrants: readonly ConstrainedEntrant[],
  seed: number,
): readonly ConstrainedEntrant[] {
  const result = [...entrants];
  // `uniformInt` advances the generator in place, so one instance carries the
  // whole shuffle — and the same seed replays the identical sequence.
  const generator = xoroshiro128plus(seed);

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = uniformInt(generator, 0, index);
    [result[index], result[swap]] = [
      result[swap] as ConstrainedEntrant,
      result[index] as ConstrainedEntrant,
    ];
  }
  return result;
}

function drawNode(request: DrawRequest, steps: number): TraceNode {
  return {
    kind: 'action',
    id: `draw:${request.shape.kind}`,
    label: `Constrained draw (${request.shape.kind})`,
    outcome: 'drawn',
    values: {
      seed: request.seed,
      steps,
      entrants: request.entrants.length,
      constraints: request.constraints.length,
    },
    detail: `Drawn from seed ${request.seed} in ${steps} step(s); replaying that seed reproduces it`,
  };
}

/** Violations of a completed draw, for a caller that wants to inspect rather than throw. */
export function inspectDraw(
  request: Pick<DrawRequest, 'constraints' | 'entrants'>,
  assignment: DrawAssignment,
): readonly ConstraintViolation[] {
  return evaluateConstraints(request.constraints, request.entrants, assignment).violations;
}
