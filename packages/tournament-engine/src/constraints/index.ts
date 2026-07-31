import {
  categoricalAttribute,
  roundNumberFor,
  validateConstraint,
  type DistributionConstraint,
  type DrawConstraint,
  type EntrantAttribute,
  type SeparationConstraint,
} from '@copalibre/domain';
import type { TraceNode } from '@copalibre/rules';
import { DrawError } from '../errors.js';

/**
 * Checking a proposed draw against what the operator imposed.
 *
 * Evaluation is pure and total: it reports every violation of an assignment
 * rather than throwing on the first, because the solver (see `../draw`) uses it
 * to decide whether a partial assignment can still be completed, and an
 * operator facing an impossible constraint set needs to be told everything that
 * is wrong, not the first thing.
 */

export interface ConstrainedEntrant {
  readonly entrantId: string;
  readonly attributes: readonly EntrantAttribute[];
}

/** A proposed draw: entrants placed into groups, or into bracket seed slots. */
export interface DrawAssignment {
  /** Group scope: entrant id → 1-based group number. */
  readonly groups?: Readonly<Record<string, number>>;
  /** Bracket scope: entrant id → 1-based seed slot, plus the bracket size. */
  readonly slots?: Readonly<Record<string, number>>;
  readonly bracketSize?: number;
}

export interface ConstraintViolation {
  readonly constraint: DrawConstraint['kind'];
  readonly hook: DrawConstraint['hook'];
  readonly attribute: string;
  /** The entrants whose placement breaks it. */
  readonly entrantIds: readonly string[];
  readonly detail: string;
}

export interface ConstraintEvaluation {
  readonly satisfied: boolean;
  readonly violations: readonly ConstraintViolation[];
  readonly trace: readonly TraceNode[];
}

export function evaluateConstraints(
  constraints: readonly DrawConstraint[],
  entrants: readonly ConstrainedEntrant[],
  assignment: DrawAssignment,
): ConstraintEvaluation {
  const violations: ConstraintViolation[] = [];

  for (const constraint of constraints) {
    const valid = validateConstraint(constraint);
    if (!valid.ok) throw new DrawError(valid.error.message, { ...valid.error.details });

    if (constraint.kind === 'separation') {
      violations.push(...checkSeparation(constraint, entrants, assignment));
    } else if (constraint.kind === 'distribution') {
      violations.push(...checkDistribution(constraint, entrants, assignment));
    }
    // Script constraints are evaluated by @copalibre/rules, which owns the
    // action registry; the solver passes them there rather than here.
  }

  return {
    satisfied: violations.length === 0,
    violations,
    trace: violations.map(violationNode),
  };
}

/** Entrants grouped by the value they carry for one attribute. */
function byAttributeValue(
  entrants: readonly ConstrainedEntrant[],
  attribute: string,
): ReadonlyMap<string, readonly string[]> {
  const groups = new Map<string, string[]>();
  for (const entrant of entrants) {
    const value = categoricalAttribute(entrant.attributes, attribute);
    if (value === undefined) continue;
    const list = groups.get(value) ?? [];
    list.push(entrant.entrantId);
    groups.set(value, list);
  }
  return groups;
}

function checkSeparation(
  constraint: SeparationConstraint,
  entrants: readonly ConstrainedEntrant[],
  assignment: DrawAssignment,
): readonly ConstraintViolation[] {
  const sharing = byAttributeValue(entrants, constraint.attribute);
  const violations: ConstraintViolation[] = [];

  for (const [value, ids] of sharing) {
    if (ids.length < 2) continue;

    for (const [left, right] of pairs(ids)) {
      const clash =
        constraint.scope === 'group'
          ? sameGroup(assignment, left, right)
          : meetsBefore(assignment, left, right, constraint.scope.beforeRound);

      if (clash !== undefined) {
        violations.push({
          constraint: 'separation',
          hook: constraint.hook,
          attribute: constraint.attribute,
          entrantIds: [left, right],
          detail:
            constraint.scope === 'group'
              ? `"${left}" and "${right}" both carry ${constraint.attribute}=${value} and share group ${clash}`
              : `"${left}" and "${right}" both carry ${constraint.attribute}=${value} and would meet in round ${clash}, before ${constraint.scope.beforeRound}`,
        });
      }
    }
  }

  return violations;
}

/** The group two entrants share, or undefined when they do not share one. */
function sameGroup(assignment: DrawAssignment, left: string, right: string): number | undefined {
  const groups = assignment.groups;
  if (!groups) return undefined;
  const leftGroup = groups[left];
  return leftGroup !== undefined && leftGroup === groups[right] ? leftGroup : undefined;
}

/**
 * The round two seed slots would meet in, when that is earlier than the named
 * round. In a knockout bracket, slots `i` and `j` meet at the first round whose
 * subtree contains both — which is `log2` of the distance between their
 * sub-brackets, and is decided entirely by the draw, before a ball is kicked.
 */
function meetsBefore(
  assignment: DrawAssignment,
  left: string,
  right: string,
  beforeRound: string,
): number | undefined {
  const { slots, bracketSize } = assignment;
  if (!slots || bracketSize === undefined) return undefined;

  const leftSlot = slots[left];
  const rightSlot = slots[right];
  if (leftSlot === undefined || rightSlot === undefined) return undefined;

  const limit = roundNumberFor(beforeRound, bracketSize);
  if (!limit.ok) throw new DrawError(limit.error.message, { ...limit.error.details });

  const meeting = meetingRound(leftSlot - 1, rightSlot - 1, bracketSize);
  return meeting < limit.value ? meeting : undefined;
}

/** 1-based round at which two 0-based bracket positions meet. */
export function meetingRound(left: number, right: number, size: number): number {
  const rounds = Math.log2(size);
  for (let round = 1; round <= rounds; round += 1) {
    const span = 2 ** round;
    if (Math.floor(left / span) === Math.floor(right / span)) return round;
  }
  return rounds;
}

function checkDistribution(
  constraint: DistributionConstraint,
  entrants: readonly ConstrainedEntrant[],
  assignment: DrawAssignment,
): readonly ConstraintViolation[] {
  const groups = assignment.groups;
  if (!groups) return [];

  const carriers = new Set(
    entrants
      .filter(
        (entrant) =>
          categoricalAttribute(entrant.attributes, constraint.attribute) === constraint.value,
      )
      .map((entrant) => entrant.entrantId),
  );

  const countByGroup = new Map<number, string[]>();
  for (const [entrantId, group] of Object.entries(groups)) {
    if (!countByGroup.has(group)) countByGroup.set(group, []);
    if (carriers.has(entrantId)) (countByGroup.get(group) as string[]).push(entrantId);
  }

  const violations: ConstraintViolation[] = [];
  for (const [group, held] of [...countByGroup].sort(([a], [b]) => a - b)) {
    if (constraint.min !== undefined && held.length < constraint.min) {
      violations.push({
        constraint: 'distribution',
        hook: constraint.hook,
        attribute: constraint.attribute,
        entrantIds: held,
        detail: `Group ${group} holds ${held.length} entrant(s) with ${constraint.attribute}=${constraint.value}; at least ${constraint.min} required`,
      });
    }
    if (constraint.max !== undefined && held.length > constraint.max) {
      violations.push({
        constraint: 'distribution',
        hook: constraint.hook,
        attribute: constraint.attribute,
        entrantIds: held,
        detail: `Group ${group} holds ${held.length} entrant(s) with ${constraint.attribute}=${constraint.value}; at most ${constraint.max} permitted`,
      });
    }
  }

  return violations;
}

function pairs(ids: readonly string[]): readonly (readonly [string, string])[] {
  const result: (readonly [string, string])[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      result.push([ids[i] as string, ids[j] as string]);
    }
  }
  return result;
}

/**
 * A rejection names the constraint, the attribute and the entrants that clash —
 * "the draw failed" is not something an operator can act on.
 */
function violationNode(violation: ConstraintViolation): TraceNode {
  return {
    kind: 'condition',
    id: `constraint:${violation.constraint}:${violation.attribute}`,
    label: `${violation.constraint} on ${violation.attribute}`,
    outcome: 'violated',
    values: { hook: violation.hook, entrantIds: [...violation.entrantIds] },
    detail: violation.detail,
  };
}
