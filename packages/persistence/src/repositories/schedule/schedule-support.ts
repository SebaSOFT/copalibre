import {
  Alias,
  detectConflicts,
  type ResourceAssignment,
  type ScheduleConflict,
  type ScheduleContext,
} from '@copalibre/domain';
import { InvariantViolationError } from '../../errors.js';
import type { EventOrigin } from '../../outbox.js';

/** Why a published placement changed: a preset's code and its rendered text, or typed text. */
export interface ScheduleReason {
  readonly code?: string;
  readonly text: string;
}

export interface SchedulePlacement extends ResourceAssignment {
  /** This match's own exception reason, overriding the batch's. */
  readonly reason?: ScheduleReason;
}

export interface ScheduleWithdrawal {
  readonly matchId: string;
  readonly reason?: ScheduleReason;
}

/** One atomic schedule batch: placements and withdrawals commit together or not at all. */
export interface ScheduleBatch {
  readonly organizationId: string;
  readonly assignments: readonly SchedulePlacement[];
  readonly withdrawals?: readonly ScheduleWithdrawal[];
  /** Applies to every changed published match without its own reason. */
  readonly reason?: ScheduleReason;
  /**
   * Where the batch comes from when it is not an organizer's own publish: `import` for demo
   * loading and bulk imports, which notify nobody.
   */
  readonly origin?: EventOrigin;
}

export interface SchedulePreview {
  readonly assignments: readonly ResourceAssignment[];
  /** Matches the batch withdraws from their slots. */
  readonly withdrawn: readonly string[];
  /** Slots those withdrawals free. */
  readonly freedSlotIds: readonly string[];
  readonly conflicts: readonly ScheduleConflict[];
  /** Matches already published that this batch would move. */
  readonly affectedPublishedMatches: readonly string[];
  /** Published matches the batch changes or withdraws, each needing a reason. */
  readonly reasonRequiredMatches: readonly string[];
  readonly committable: boolean;
}

export interface SchedulePlacementHistory {
  readonly historyId: string;
  readonly matchId: string;
  readonly priorSlotId: string;
  readonly priorStartsAt: number;
  readonly priorVenueId: string;
  readonly priorOfficialIds: readonly string[];
  /** Absent when the change withdrew the match. */
  readonly resultingSlotId?: string;
  readonly reasonCode?: string;
  readonly reason: string;
  readonly actor: string;
  readonly changedAt: string;
}

export interface OrganizationScheduleEntry {
  readonly matchId: string;
  readonly status: string;
  readonly tournamentId: string;
  readonly stageId: string;
  readonly zoneId?: string;
  readonly round: number;
  readonly entrantIds: readonly string[];
  readonly slotId: string;
  readonly venueId: string;
  readonly startsAt: number;
  /** Start plus the estimated match length (or the slot length without an estimate). */
  readonly estimatedEnd: number;
  readonly published: boolean;
}

export interface ScheduleAssignmentDetail {
  readonly matchId: string;
  readonly fixtureId: string;
  readonly slotId: string;
  readonly venueId: string;
  readonly window: {
    readonly startsAt: number;
    readonly durationMinutes: number;
  };
  readonly officialIds?: readonly string[];
}

/** A match whose schedule can no longer change, and why. */
export const LOCKED_STATUSES: ReadonlyMap<string, 'finalized' | 'in-progress'> = new Map([
  ['finalized', 'finalized'],
  ['forfeited', 'finalized'],
  ['in-progress', 'in-progress'],
]);

export const MAX_ORGANIZATION_RANGE_MS = 31 * 24 * 60 * 60_000;

export interface CurrentPlacement {
  readonly matchId: string;
  readonly slotId: string;
  readonly published: boolean;
  readonly venueId: string;
  readonly startsAt: number;
  readonly officialIds: readonly string[];
}

/**
 * Published matches this batch moves to another slot, re-officiates, or withdraws — the ones
 * that need a reason and leave a history row. A first placement is not among them, and neither
 * is a published match re-sent exactly as it stands.
 */
export function changedPublishedMatches(
  batch: ScheduleBatch,
  current: ReadonlyMap<string, CurrentPlacement>,
): readonly string[] {
  const changed: string[] = [];
  for (const assignment of batch.assignments) {
    const prior = current.get(assignment.matchId);
    if (!prior?.published) continue;
    const officials = [...(assignment.officialIds ?? [])].sort();
    if (
      prior.slotId !== assignment.slotId ||
      officials.length !== prior.officialIds.length ||
      officials.some((officialId, index) => officialId !== prior.officialIds[index])
    ) {
      changed.push(assignment.matchId);
    }
  }
  for (const withdrawal of batch.withdrawals ?? []) {
    if (current.get(withdrawal.matchId)?.published) changed.push(withdrawal.matchId);
  }
  return changed;
}

export function placementState(prior: CurrentPlacement): Record<string, unknown> {
  return {
    slotId: prior.slotId,
    venueId: prior.venueId,
    startsAt: prior.startsAt,
    officialIds: [...prior.officialIds],
  };
}

export function hasText(reason: ScheduleReason | undefined): boolean {
  return reason !== undefined && reason.text.trim() !== '';
}

/** A JSON column: text on SQLite, already parsed on PostgreSQL. */
export function parseJson<T = Record<string, unknown>>(raw: unknown): T | undefined {
  if (raw === null || raw === undefined) return undefined;
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
}

export function assertVenueAlias(value: string): void {
  const alias = Alias.create('venue', value);
  if (!alias.ok) {
    throw new InvariantViolationError(alias.error.message, { alias: value });
  }
}

/**
 * Conflicts among published placements involving `scope`. A finalized or running match is a
 * record, not a proposal, so the locks that refuse moving one are not conflicts here.
 */
export function conflictsAmongPublished(
  context: ScheduleContext,
  scope: ReadonlySet<string>,
): readonly ScheduleConflict[] {
  const proposed = context.existing.filter((assignment) => scope.has(assignment.matchId));
  return detectConflicts(proposed, { ...context, lockedMatches: new Map() });
}

/** One conflict's identity, whichever of its two matches it is reported from. */
export function conflictKey(conflict: ScheduleConflict): string {
  const pair = [conflict.matchId, conflict.conflictsWithMatchId].sort().join('|');
  return `${conflict.kind}|${pair}|${conflict.resourceId}`;
}
