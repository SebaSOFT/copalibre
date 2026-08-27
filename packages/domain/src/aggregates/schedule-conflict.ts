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
 * Three ways a schedule can be wrong, and one way of saying so.
 *
 * Detection is pure and total: it returns every conflict rather than throwing
 * on the first, because the caller runs it twice for different reasons — once
 * as a preview an operator reads, and once inside the transaction that commits.
 * Those must be the same computation or the preview is a guess. A preview that
 * can disagree with the commit is worse than no preview, which is the same
 * conclusion reached for the stage transition.
 */

export type ConflictKind =
  'venue-double-booked' | 'official-double-booked' | 'rest-rule' | 'match-finalized';

export interface ScheduleConflict {
  readonly kind: ConflictKind;
  /** The match being placed, and the one it clashes with. */
  readonly matchId: string;
  readonly conflictsWithMatchId: string;
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
  /** Minimum minutes between an entrant's consecutive matches. */
  readonly minimumMinutes: number;
}

export interface SlotInfo {
  readonly slotId: string;
  readonly venueId: string;
  readonly window: TimeWindow;
}

export interface ScheduleContext {
  /** Assignments already committed, which a new one must not clash with. */
  readonly existing: readonly ResourceAssignment[];
  /** Available slots providing venue and time window. */
  readonly slots: ReadonlyMap<string, SlotInfo>;
  /** Which entrants play which match — a rest rule is about people, not slots. */
  readonly entrantsByMatch: ReadonlyMap<string, readonly string[]>;
  readonly venues: ReadonlyMap<string, Venue>;
  readonly restRule?: RestRule;
  /** Matches whose result has already finalized — a fact now, not a plan. */
  readonly finalizedMatchIds?: ReadonlySet<string>;
}

/**
 * Every conflict a batch of assignments would create — against what is already
 * scheduled and against each other.
 *
 * Checking the batch against itself matters: two matches published together
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
    const slot = context.slots.get(assignment.slotId);
    if (!slot) {
      conflicts.push({
        kind: 'venue-double-booked',
        matchId: assignment.matchId,
        conflictsWithMatchId: assignment.matchId,
        resourceId: assignment.slotId,
        detail: `Slot "${assignment.slotId}" does not exist in the schedule context`,
      });
      continue;
    }

    const invalid = validateWindow(slot.window);
    if (!invalid.ok) {
      conflicts.push({
        kind: 'venue-double-booked',
        matchId: assignment.matchId,
        conflictsWithMatchId: assignment.matchId,
        resourceId: slot.venueId,
        detail: invalid.error.message,
      });
      continue;
    }

    // A finalized match's schedule is a record, not a plan — the preview and
    // the commit must refuse it the same way they refuse a double-booking, so
    // this rides the same conflict list rather than a separate check.
    conflicts.push(...matchFinalizedClash(assignment, context));

    // Committed assignments, then the rest of this batch — a match never
    // conflicts with its own earlier version within one publish.
    const others = [
      ...context.existing.filter((other) => other.matchId !== assignment.matchId),
      ...proposed.slice(index + 1),
    ];

    conflicts.push(...venueClash(assignment, slot, others, context));

    for (const other of others) {
      const otherSlot = context.slots.get(other.slotId);
      if (!otherSlot) continue;
      conflicts.push(...officialClash(assignment, slot, other, otherSlot));
      conflicts.push(...restClash(assignment, slot, other, otherSlot, context));
    }
  }

  return conflicts;
}

/**
 * A finalized match's schedule row is a fact, not a plan. Rescheduling it here
 * would silently move the record of when and where a concluded match was
 * played — the audited correction workflow exists precisely so that never
 * happens without an actor, a reason, and a trace.
 */
function matchFinalizedClash(
  assignment: ResourceAssignment,
  context: ScheduleContext,
): readonly ScheduleConflict[] {
  if (!context.finalizedMatchIds?.has(assignment.matchId)) return [];

  return [
    {
      kind: 'match-finalized',
      matchId: assignment.matchId,
      conflictsWithMatchId: assignment.matchId,
      resourceId: assignment.matchId,
      detail:
        `Match "${assignment.matchId}" has already been finalized; its schedule is a ` +
        'record now — use the audited correction workflow, not a new publish',
    },
  ];
}

/**
 * A venue is double-booked when more matches want it at one moment than it can
 * hold. A club with three courts hosting three at once is fine; the fourth is
 * the conflict — so the check counts everything overlapping, committed and
 * proposed alike, rather than asking about one other match at a time.
 */
function venueClash(
  assignment: ResourceAssignment,
  slot: SlotInfo,
  others: readonly ResourceAssignment[],
  context: ScheduleContext,
): readonly ScheduleConflict[] {
  const venueId = slot.venueId;
  const capacity = context.venues.get(venueId)?.concurrentCapacity ?? 1;

  const concurrent: Array<{ assignment: ResourceAssignment; slot: SlotInfo }> = [];
  for (const other of others) {
    const otherSlot = context.slots.get(other.slotId);
    if (!otherSlot) continue;
    if (otherSlot.venueId === venueId && overlaps(slot.window, otherSlot.window)) {
      concurrent.push({ assignment: other, slot: otherSlot });
    }
  }

  if (concurrent.length + 1 <= capacity) return [];

  const first = concurrent[0];
  if (!first) return [];
  return [
    {
      kind: 'venue-double-booked',
      matchId: assignment.matchId,
      conflictsWithMatchId: first.assignment.matchId,
      resourceId: venueId,
      detail:
        `Venue "${venueId}" hosts ${capacity} match(es) at once, and ${concurrent.length + 1} ` +
        `overlap there including "${assignment.matchId}" and "${first.assignment.matchId}"`,
    },
  ];
}

/**
 * An official is a person. Capacity is one, and no configuration changes that —
 * which is why officials are checked without consulting anything.
 */
function officialClash(
  assignment: ResourceAssignment,
  slot: SlotInfo,
  other: ResourceAssignment,
  otherSlot: SlotInfo,
): readonly ScheduleConflict[] {
  if (!overlaps(slot.window, otherSlot.window)) return [];

  const shared = (assignment.officialIds ?? []).filter((officialId) =>
    (other.officialIds ?? []).includes(officialId),
  );

  return shared.map((officialId) => ({
    kind: 'official-double-booked' as const,
    matchId: assignment.matchId,
    conflictsWithMatchId: other.matchId,
    resourceId: officialId,
    detail:
      `Official "${officialId}" is assigned to "${assignment.matchId}" and "${other.matchId}", ` +
      'which overlap',
  }));
}

/**
 * Rest is about an entrant, not a slot: the same team playing twice in twenty
 * minutes is the problem, wherever those matches are and whoever officiates.
 */
function restClash(
  assignment: ResourceAssignment,
  slot: SlotInfo,
  other: ResourceAssignment,
  otherSlot: SlotInfo,
  context: ScheduleContext,
): readonly ScheduleConflict[] {
  const rule = context.restRule;
  if (!rule) return [];

  const here = context.entrantsByMatch.get(assignment.matchId) ?? [];
  const there = context.entrantsByMatch.get(other.matchId) ?? [];
  const shared = here.filter((entrantId) => there.includes(entrantId));
  if (shared.length === 0) return [];

  const gap = gapMinutes(slot.window, otherSlot.window);
  if (gap >= rule.minimumMinutes) return [];

  return shared.map((entrantId) => ({
    kind: 'rest-rule' as const,
    matchId: assignment.matchId,
    conflictsWithMatchId: other.matchId,
    resourceId: entrantId,
    detail: overlaps(slot.window, otherSlot.window)
      ? `Entrant "${entrantId}" would play "${assignment.matchId}" and "${other.matchId}" at the same time`
      : `Entrant "${entrantId}" gets ${gap} minute(s) between "${assignment.matchId}" and ` +
        `"${other.matchId}"; ${rule.minimumMinutes} are required`,
  }));
}

/** The window a match occupies, for a caller reporting a schedule. */
export function describeWindow(window: TimeWindow): { start: number; end: number } {
  return { start: window.startsAt, end: endsAt(window) };
}
