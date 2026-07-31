import {
  endsAt,
  gapMinutes,
  overlaps,
  validateWindow,
  type ResourceAssignment,
  type TimeWindow,
  type Venue,
} from './resource.js';
import { DomainError } from '../errors.js';

/**
 * Three ways a schedule can be wrong, and one way of saying so
 * (0012-resource-scheduling-and-conflicts).
 *
 * Detection is pure and total: it returns every conflict rather than throwing
 * on the first, because the caller runs it twice for different reasons — once
 * as a preview an operator reads, and once inside the transaction that commits.
 * Those must be the same computation or the preview is a guess. A preview that
 * can disagree with the commit is worse than no preview, which is the same
 * conclusion 0010 reached for the stage transition.
 */

export type ConflictKind = 'venue-double-booked' | 'official-double-booked' | 'rest-rule';

export interface ScheduleConflict {
  readonly kind: ConflictKind;
  /** The assignment being placed, and the one it clashes with. */
  readonly fixtureId: string;
  readonly conflictsWithFixtureId: string;
  /** Venue, official or entrant the clash is about. */
  readonly resourceId: string;
  readonly detail: string;
}

export class ScheduleConflictError extends DomainError {
  readonly code = 'SCHEDULE_CONFLICT';

  constructor(readonly conflicts: readonly ScheduleConflict[]) {
    super(
      `The schedule has ${conflicts.length} conflict(s): ${conflicts
        .map((conflict) => conflict.detail)
        .join('; ')}`,
      { conflicts },
    );
  }
}

/** A rest rule as the discipline or profile configures it. */
export interface RestRule {
  /** Minimum minutes between an entrant's consecutive fixtures. */
  readonly minimumMinutes: number;
}

export interface ScheduleContext {
  /** Assignments already committed, which a new one must not clash with. */
  readonly existing: readonly ResourceAssignment[];
  /** Which entrants play which fixture — a rest rule is about people, not slots. */
  readonly entrantsByFixture: ReadonlyMap<string, readonly string[]>;
  readonly venues: ReadonlyMap<string, Venue>;
  readonly restRule?: RestRule;
}

/**
 * Every conflict a batch of assignments would create — against what is already
 * scheduled and against each other.
 *
 * Checking the batch against itself matters: two fixtures published together
 * can double-book a venue just as easily as one published after the other, and
 * an implementation that only checked against committed state would let a
 * single publish create the very conflict it exists to prevent.
 */
export function detectConflicts(
  proposed: readonly ResourceAssignment[],
  context: ScheduleContext,
): readonly ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (const [index, assignment] of proposed.entries()) {
    const invalid = validateWindow(assignment.window);
    if (!invalid.ok) {
      conflicts.push({
        kind: 'venue-double-booked',
        fixtureId: assignment.fixtureId,
        conflictsWithFixtureId: assignment.fixtureId,
        resourceId: assignment.venueId ?? 'unknown',
        detail: invalid.error.message,
      });
      continue;
    }

    // Committed assignments, then the rest of this batch — a fixture never
    // conflicts with its own earlier version within one publish.
    const others = [
      ...context.existing.filter((other) => other.fixtureId !== assignment.fixtureId),
      ...proposed.slice(index + 1),
    ];

    // Venue capacity is a question about a set, so it is asked once per
    // assignment against everything it overlaps — not pair by pair, which
    // cannot tell a third concurrent fixture from a fourth.
    conflicts.push(...venueClash(assignment, others, context));

    for (const other of others) {
      conflicts.push(...officialClash(assignment, other));
      conflicts.push(...restClash(assignment, other, context));
    }
  }

  return conflicts;
}

/**
 * A venue is double-booked when more fixtures want it at one moment than it can
 * hold. A club with three courts hosting three at once is fine; the fourth is
 * the conflict — so the check counts everything overlapping, committed and
 * proposed alike, rather than asking about one other fixture at a time.
 */
function venueClash(
  assignment: ResourceAssignment,
  others: readonly ResourceAssignment[],
  context: ScheduleContext,
): readonly ScheduleConflict[] {
  const venueId = assignment.venueId;
  if (!venueId) return [];

  const concurrent = others.filter(
    (other) => other.venueId === venueId && overlaps(assignment.window, other.window),
  );
  const capacity = context.venues.get(venueId)?.concurrentCapacity ?? 1;
  if (concurrent.length + 1 <= capacity) return [];

  const [first] = concurrent;
  return [
    {
      kind: 'venue-double-booked',
      fixtureId: assignment.fixtureId,
      conflictsWithFixtureId: (first as ResourceAssignment).fixtureId,
      resourceId: venueId,
      detail:
        `Venue "${venueId}" hosts ${capacity} fixture(s) at once, and ${concurrent.length + 1} ` +
        `overlap there including "${assignment.fixtureId}" and "${(first as ResourceAssignment).fixtureId}"`,
    },
  ];
}

/**
 * An official is a person. Capacity is one, and no configuration changes that —
 * which is why officials are checked without consulting anything.
 */
function officialClash(
  assignment: ResourceAssignment,
  other: ResourceAssignment,
): readonly ScheduleConflict[] {
  if (!overlaps(assignment.window, other.window)) return [];

  const shared = (assignment.officialIds ?? []).filter((officialId) =>
    (other.officialIds ?? []).includes(officialId),
  );

  return shared.map((officialId) => ({
    kind: 'official-double-booked' as const,
    fixtureId: assignment.fixtureId,
    conflictsWithFixtureId: other.fixtureId,
    resourceId: officialId,
    detail:
      `Official "${officialId}" is assigned to "${assignment.fixtureId}" and "${other.fixtureId}", ` +
      'which overlap',
  }));
}

/**
 * Rest is about an entrant, not a slot: the same team playing twice in twenty
 * minutes is the problem, wherever those matches are and whoever officiates.
 */
function restClash(
  assignment: ResourceAssignment,
  other: ResourceAssignment,
  context: ScheduleContext,
): readonly ScheduleConflict[] {
  const rule = context.restRule;
  if (!rule) return [];

  const here = context.entrantsByFixture.get(assignment.fixtureId) ?? [];
  const there = context.entrantsByFixture.get(other.fixtureId) ?? [];
  const shared = here.filter((entrantId) => there.includes(entrantId));
  if (shared.length === 0) return [];

  const gap = gapMinutes(assignment.window, other.window);
  if (gap >= rule.minimumMinutes) return [];

  return shared.map((entrantId) => ({
    kind: 'rest-rule' as const,
    fixtureId: assignment.fixtureId,
    conflictsWithFixtureId: other.fixtureId,
    resourceId: entrantId,
    detail: overlaps(assignment.window, other.window)
      ? `Entrant "${entrantId}" would play "${assignment.fixtureId}" and "${other.fixtureId}" at the same time`
      : `Entrant "${entrantId}" gets ${gap} minute(s) between "${assignment.fixtureId}" and ` +
        `"${other.fixtureId}"; ${rule.minimumMinutes} are required`,
  }));
}

/** The window a fixture occupies, for a caller reporting a schedule. */
export function describeWindow(window: TimeWindow): { start: number; end: number } {
  return { start: window.startsAt, end: endsAt(window) };
}
