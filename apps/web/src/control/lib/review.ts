import { messages } from '../i18n/messages.en.js';

/**
 * The registration review table's state.
 *
 * The selection and the filter are a model rather than component state so the
 * awkward parts — "select all" after a filter, a selected row that the filter
 * then hides — are testable and answered once.
 */

export type RegistrationStatus = 'pending' | 'accepted' | 'refused' | 'withdrawn' | 'checked-in';
export type StatusFilter = 'all' | RegistrationStatus;

export interface RegistrationRow {
  readonly entrantId: string;
  readonly displayName: string;
  readonly status: RegistrationStatus;
  readonly submittedAt: string;
  /** Present for a person-kind entrant; absent for a team entrant. */
  readonly personId?: string;
  /** Present for a team-kind entrant; absent for a person entrant. */
  readonly teamId?: string;
  readonly nationality?: string;
  readonly photoObjectId?: string;
  /** Whether this person entrant already carries a participant identity link (openspec 0170). */
  readonly hasIdentityLink?: boolean;
}

export interface ReviewState {
  readonly filter: StatusFilter;
  readonly selected: readonly string[];
  readonly page: number;
  readonly pageSize: number;
  readonly expanded?: string;
}

export function initialReview(pageSize = 25): ReviewState {
  return { filter: 'all', selected: [], page: 1, pageSize };
}

export function visibleRows(
  rows: readonly RegistrationRow[],
  state: ReviewState,
): readonly RegistrationRow[] {
  const filtered = rows.filter((row) => state.filter === 'all' || row.status === state.filter);
  const start = (state.page - 1) * state.pageSize;
  return filtered.slice(start, start + state.pageSize);
}

export function pageCount(rows: readonly RegistrationRow[], state: ReviewState): number {
  const filtered = rows.filter((row) => state.filter === 'all' || row.status === state.filter);
  return Math.max(1, Math.ceil(filtered.length / state.pageSize));
}

export function toggleRow(state: ReviewState, entrantId: string): ReviewState {
  const selected = state.selected.includes(entrantId)
    ? state.selected.filter((id) => id !== entrantId)
    : [...state.selected, entrantId];
  return { ...state, selected };
}

/** Selects what is on screen — never what a filter is hiding. */
export function toggleAllVisible(
  state: ReviewState,
  rows: readonly RegistrationRow[],
): ReviewState {
  const visible = visibleRows(rows, state).map((row) => row.entrantId);
  const allSelected = visible.every((id) => state.selected.includes(id));

  return {
    ...state,
    selected: allSelected
      ? state.selected.filter((id) => !visible.includes(id))
      : [...new Set([...state.selected, ...visible])],
  };
}

/**
 * Changing the filter drops selections it hides.
 *
 * Otherwise "approve selected" acts on rows the operator cannot see, which is
 * the bulk action nobody can explain afterwards.
 */
export function setFilter(
  state: ReviewState,
  filter: StatusFilter,
  rows: readonly RegistrationRow[],
): ReviewState {
  const next: ReviewState = { ...state, filter, page: 1 };
  const visible = new Set(
    rows.filter((row) => filter === 'all' || row.status === filter).map((row) => row.entrantId),
  );
  return { ...next, selected: state.selected.filter((id) => visible.has(id)) };
}

/** Whether team-membership actions should be offered at all; the API decides finally. */
export function teamMembershipActionsEnabled(input: {
  readonly requiresCheckIn: boolean;
  readonly checkInClosesAt?: string;
  readonly status: RegistrationStatus;
  readonly now: string;
}): boolean {
  if (!input.requiresCheckIn) return true;
  if (input.status !== 'checked-in') return true;
  return input.checkInClosesAt === undefined || input.now < input.checkInClosesAt;
}

export const LOCK_EXPLANATION = messages.reviewLockExplanation;
