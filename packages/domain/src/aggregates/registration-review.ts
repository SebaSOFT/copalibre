import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { EntrantStatus } from './participant.js';

/**
 * Reviewing registrations, and when team memberships stop being editable.
 *
 * The decision lives here rather than in the console because the console is a
 * *hint*: a tab left open through the check-in deadline still has yesterday's
 * buttons enabled, and the only useful place to refuse is the one the request
 * actually reaches.
 */

export type ReviewDecision = 'accepted' | 'refused' | 'withdrawn';

export class RegistrationError extends DomainError {
  readonly code = 'REGISTRATION_INVALID';
}

export interface CheckInWindow {
  /** ISO instants; absent means the organizer set no window at all. */
  readonly opensAt?: string;
  readonly closesAt?: string;
  readonly requiresCheckIn: boolean;
}

/**
 * Whether the team memberships of a checked-in entrant may still change.
 *
 * Two conditions, both required: the tournament asks for check-in, and the
 * window has closed. A tournament that never asked for check-in never locks —
 * CopaLibre enforces what *this* organizer configured, not what a competition
 * usually does.
 */
export function teamMembershipsEditable(
  window: CheckInWindow,
  status: EntrantStatus,
  now: string,
): Result<true, RegistrationError> {
  if (!window.requiresCheckIn) return ok(true);
  if (status !== 'checked-in') return ok(true);
  if (window.closesAt === undefined || now < window.closesAt) return ok(true);

  return err(
    new RegistrationError(
      'Check-in has closed for this entrant; recorded team memberships remain the eligibility basis',
      { closesAt: window.closesAt, status },
    ),
  );
}

/**
 * Whether a decision may be recorded against a registration in this state.
 *
 * Re-deciding is allowed — an organizer who refused by mistake must be able to
 * accept — but a withdrawal is the entrant's word, and overriding it from the
 * console would put somebody in a competition they left.
 */
export function canDecide(
  current: EntrantStatus,
  decision: ReviewDecision,
): Result<ReviewDecision, RegistrationError> {
  if (current === 'withdrawn' && decision !== 'withdrawn') {
    return err(
      new RegistrationError('This entrant withdrew; only they can undo that', {
        current,
        decision,
      }),
    );
  }
  return ok(decision);
}

/** The status a decision produces. */
export function statusFor(decision: ReviewDecision): EntrantStatus {
  return decision;
}

/**
 * A bulk action is a list of single decisions.
 *
 * Deliberately not one statement: each registration gets its own audit row with
 * its own before and after, because "approved 40" is not an answer to "why is
 * this team in the draw".
 */
export function planBulkReview(
  entrants: readonly { readonly entrantId: string; readonly status: EntrantStatus }[],
  selected: readonly string[],
  decision: ReviewDecision,
): {
  readonly apply: readonly { readonly entrantId: string; readonly decision: ReviewDecision }[];
  readonly refused: readonly { readonly entrantId: string; readonly reason: string }[];
} {
  const chosen = new Set(selected);
  const apply: { entrantId: string; decision: ReviewDecision }[] = [];
  const refused: { entrantId: string; reason: string }[] = [];

  for (const entrant of entrants) {
    if (!chosen.has(entrant.entrantId)) continue;
    const allowed = canDecide(entrant.status, decision);
    if (allowed.ok) apply.push({ entrantId: entrant.entrantId, decision });
    else refused.push({ entrantId: entrant.entrantId, reason: allowed.error.message });
  }

  return { apply, refused };
}

/**
 * A team-membership edit applies only to a team entrant.
 *
 * An individual entrant has no persistent team membership to reconcile — the
 * request is not a conflict with current state, it names a person id in a
 * place a team id belongs.
 */
export function teamMembershipsApply(kind: 'person' | 'team'): Result<true, RegistrationError> {
  if (kind === 'person') {
    return err(
      new RegistrationError('Team memberships apply only to a team entrant, not a person', {
        kind,
      }),
    );
  }
  return ok(true);
}

/**
 * The diff between a team's current membership and the set an edit submits.
 *
 * A team-membership edit names the *desired end state*, not an instruction —
 * the same submission adds whoever is new and removes whoever was left out,
 * and leaves everyone named in both sets alone. Diffing by id, not
 * delete-everything-then-reinsert, is what keeps an unchanged member's
 * history reading as "still here" rather than "left and rejoined."
 */
export function planRosterReconciliation(
  current: readonly string[],
  desired: readonly string[],
): {
  readonly toEnlist: readonly string[];
  readonly toRemove: readonly string[];
} {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  return {
    toEnlist: desired.filter((personId) => !currentSet.has(personId)),
    toRemove: current.filter((personId) => !desiredSet.has(personId)),
  };
}
