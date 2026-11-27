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
  | 'venue-double-booked'
  | 'official-double-booked'
  | 'rest-rule'
  | 'match-finalized'
  | 'match-in-progress';

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

/** A rest rule as a tournament declares it. */
export interface RestRule {
  /** Minimum minutes between an entrant's consecutive matches. */
  readonly minimumMinutes: number;
}

export interface SlotInfo {
  readonly slotId: string;
  readonly venueId: string;
  readonly window: TimeWindow;
  /** Minutes the venue stays held after a match here ends: its schedule's changeover. */
  readonly changeoverMinutes?: number;
}

export interface ScheduleContext {
  /** Assignments already committed, which a new one must not clash with. */
  readonly existing: readonly ResourceAssignment[];
  /** Available slots providing venue and time window. */
  readonly slots: ReadonlyMap<string, SlotInfo>;
  /** Which entrants play which match — a rest rule is about people, not slots. */
  readonly entrantsByMatch: ReadonlyMap<string, readonly string[]>;
  readonly venues: ReadonlyMap<string, Venue>;
  /**
   * Each match's tournament minimum rest, in minutes. A match absent here belongs to a
   * tournament declaring none. Two matches compare under the stricter of their two rules.
   */
  readonly restMinutesByMatch?: ReadonlyMap<string, number>;
  /**
   * How long each placed match occupies its entrants, officials and venue
   * (`estimatedMatchMinutes`). A match absent here occupies its slot's length.
   */
  readonly occupancyMinutesByMatch?: ReadonlyMap<string, number>;
  /**
   * Matches whose schedule can no longer change: a finalized result is a fact, and a match in
   * progress is being played where and when it is.
   */
  readonly lockedMatches?: ReadonlyMap<string, 'finalized' | 'in-progress'>;
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
  /** Matches the batch withdraws from their slots: refused when locked, and no longer in anyone's way. */
  withdrawn: readonly string[] = [],
): readonly ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = withdrawn.flatMap((matchId) =>
    lockedMatchClash(matchId, context),
  );
  const freed = new Set([...withdrawn, ...proposed.map((assignment) => assignment.matchId)]);

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
    conflicts.push(...lockedMatchClash(assignment.matchId, context));

    // Committed assignments, then the rest of this batch — a match never
    // conflicts with its own earlier version within one publish, and a match
    // this batch moves or withdraws no longer holds its old slot.
    const others = [
      ...context.existing.filter((other) => !freed.has(other.matchId)),
      ...proposed.slice(index + 1),
    ];

    conflicts.push(...venueClash(assignment, slot, others, context));

    const occupied = occupancyOf(assignment.matchId, slot, context);
    for (const other of others) {
      const otherSlot = context.slots.get(other.slotId);
      if (!otherSlot) continue;
      const otherOccupied = occupancyOf(other.matchId, otherSlot, context);
      conflicts.push(...officialClash(assignment, occupied, other, otherOccupied));
      conflicts.push(...restClash(assignment, occupied, other, otherOccupied, context));
    }
  }

  return conflicts;
}

/**
 * The window a placed match occupies: its slot's start plus its estimated duration, or the
 * slot's own length when the discipline gives no estimate.
 */
export function occupancyOf(matchId: string, slot: SlotInfo, context: ScheduleContext): TimeWindow {
  return {
    startsAt: slot.window.startsAt,
    durationMinutes: context.occupancyMinutesByMatch?.get(matchId) ?? slot.window.durationMinutes,
  };
}

/** The window a match holds its venue for: its occupancy plus the schedule's changeover. */
function venueHoldOf(matchId: string, slot: SlotInfo, context: ScheduleContext): TimeWindow {
  const occupied = occupancyOf(matchId, slot, context);
  return {
    ...occupied,
    durationMinutes: occupied.durationMinutes + (slot.changeoverMinutes ?? 0),
  };
}

/**
 * A finalized match's schedule row is a fact, not a plan. Rescheduling it here
 * would silently move the record of when and where a concluded match was
 * played — the audited correction workflow exists precisely so that never
 * happens without an actor, a reason, and a trace. A match in progress is
 * refused the same way: it is being played where and when it is.
 */
function lockedMatchClash(matchId: string, context: ScheduleContext): readonly ScheduleConflict[] {
  const lock = context.lockedMatches?.get(matchId);
  if (lock === undefined) return [];

  return [
    lock === 'finalized'
      ? {
          kind: 'match-finalized',
          matchId,
          conflictsWithMatchId: matchId,
          resourceId: matchId,
          detail:
            `Match "${matchId}" has already been finalized; its schedule is a ` +
            'record now — use the audited correction workflow, not a new publish',
        }
      : {
          kind: 'match-in-progress',
          matchId,
          conflictsWithMatchId: matchId,
          resourceId: matchId,
          detail: `Match "${matchId}" is in progress; it cannot be moved or withdrawn while it is played`,
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
  const held = venueHoldOf(assignment.matchId, slot, context);

  const concurrent: Array<{ assignment: ResourceAssignment; slot: SlotInfo }> = [];
  for (const other of others) {
    const otherSlot = context.slots.get(other.slotId);
    if (!otherSlot) continue;
    if (
      otherSlot.venueId === venueId &&
      overlaps(held, venueHoldOf(other.matchId, otherSlot, context))
    ) {
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
  occupied: TimeWindow,
  other: ResourceAssignment,
  otherOccupied: TimeWindow,
): readonly ScheduleConflict[] {
  if (!overlaps(occupied, otherOccupied)) return [];

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
 * Rest runs from one match's estimated end to the next one's start, under the
 * stricter of the two matches' tournament rules.
 */
function restClash(
  assignment: ResourceAssignment,
  occupied: TimeWindow,
  other: ResourceAssignment,
  otherOccupied: TimeWindow,
  context: ScheduleContext,
): readonly ScheduleConflict[] {
  const rules = [
    context.restMinutesByMatch?.get(assignment.matchId),
    context.restMinutesByMatch?.get(other.matchId),
  ].filter((minutes): minutes is number => minutes !== undefined);
  if (rules.length === 0) return [];
  const rule: RestRule = { minimumMinutes: Math.max(...rules) };

  const here = context.entrantsByMatch.get(assignment.matchId) ?? [];
  const there = context.entrantsByMatch.get(other.matchId) ?? [];
  const shared = here.filter((entrantId) => there.includes(entrantId));
  if (shared.length === 0) return [];

  const gap = gapMinutes(occupied, otherOccupied);
  if (gap >= rule.minimumMinutes) return [];

  return shared.map((entrantId) => ({
    kind: 'rest-rule' as const,
    matchId: assignment.matchId,
    conflictsWithMatchId: other.matchId,
    resourceId: entrantId,
    detail: overlaps(occupied, otherOccupied)
      ? `Entrant "${entrantId}" would play "${assignment.matchId}" and "${other.matchId}" at the same time`
      : `Entrant "${entrantId}" gets ${gap} minute(s) between "${assignment.matchId}" and ` +
        `"${other.matchId}"; ${rule.minimumMinutes} are required`,
  }));
}

/** The window a match occupies, for a caller reporting a schedule. */
export function describeWindow(window: TimeWindow): { start: number; end: number } {
  return { start: window.startsAt, end: endsAt(window) };
}
