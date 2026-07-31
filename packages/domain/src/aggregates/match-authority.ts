import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * Who may operate a match (0014-live-match-operations-result-authority).
 *
 * The decision record asks for event entry, clock control, lineup selection and
 * finalization to be *separate permissions, not a consequence of a generic
 * organizer role*. The reason is concrete: a scorekeeper entering events is not
 * thereby entitled to declare the match over, and an organizer who administers
 * a tournament is not thereby standing at that table.
 *
 * So authority is an **assignment**: someone is put on a match, or on a stage,
 * carrying named capabilities. Nothing here reads a role; a role is what a
 * console offers when creating an assignment, and the templates below are that
 * offer written down once.
 */

export const MATCH_CAPABILITIES = [
  /** Recording discipline events against the match. */
  'match.record-event',
  /** Starting, pausing, resuming segments and timers. */
  'match.control-clock',
  /** Choosing who takes the field from the roster. */
  'match.select-lineup',
  /** Declaring the result, after which only the correction workflow may write. */
  'match.finalize',
] as const;

export type MatchCapability = (typeof MATCH_CAPABILITIES)[number];

/**
 * What an assignment covers.
 *
 * A referee appointed to a matchday should not need one row per match, so a
 * grant may name a stage and resolve downward. It never resolves *upward*: a
 * grant on one match says nothing about the next one, which is the leakage
 * this shape exists to prevent.
 */
export type AuthorityScope =
  | { readonly kind: 'match'; readonly matchId: string }
  | { readonly kind: 'stage'; readonly stageId: string };

export interface MatchAssignment {
  readonly assignmentId: string;
  readonly organizationId: string;
  /** The acting identity, as the token's `sub` names it. */
  readonly subjectId: string;
  readonly scope: AuthorityScope;
  readonly capabilities: readonly MatchCapability[];
}

/** Where a command is being attempted. */
export interface MatchContext {
  readonly organizationId: string;
  readonly matchId: string;
  readonly stageId: string;
}

/**
 * Role templates: the capability sets a console offers when appointing someone.
 *
 * A referee at a small club is also the scorer, so the templates overlap
 * deliberately rather than forcing two appointments for one person. What they
 * never do is grant `match.finalize` to a table official, because declaring a
 * match over is the act the correction workflow exists to protect.
 */
export const CAPABILITY_TEMPLATES: Readonly<Record<string, readonly MatchCapability[]>> =
  Object.freeze({
    referee: MATCH_CAPABILITIES,
    'table-official': ['match.record-event', 'match.control-clock'],
    'team-delegate': ['match.select-lineup'],
  });

export class MatchAuthorityError extends DomainError {
  readonly code = 'MATCH_AUTHORITY_DENIED';
}

export interface AuthorityDecision {
  readonly capability: MatchCapability;
  readonly grantedBy: string;
}

/**
 * Whether a subject may perform one capability on one match.
 *
 * Deny is the default and the error names what was missing, because an operator
 * refused at the table needs to know which appointment to ask for — not that
 * "something" was forbidden.
 */
export function authorizeMatchCommand(
  assignments: readonly MatchAssignment[],
  input: {
    readonly subjectId: string;
    readonly capability: MatchCapability;
    readonly match: MatchContext;
  },
): Result<AuthorityDecision, MatchAuthorityError> {
  const granting = assignments.find(
    (assignment) =>
      assignment.subjectId === input.subjectId &&
      assignment.organizationId === input.match.organizationId &&
      covers(assignment.scope, input.match) &&
      assignment.capabilities.includes(input.capability),
  );

  if (!granting) {
    return err(
      new MatchAuthorityError(
        `Subject "${input.subjectId}" holds no "${input.capability}" assignment for match "${input.match.matchId}"`,
        {
          subjectId: input.subjectId,
          capability: input.capability,
          matchId: input.match.matchId,
        },
      ),
    );
  }

  return ok({ capability: input.capability, grantedBy: granting.assignmentId });
}

function covers(scope: AuthorityScope, match: MatchContext): boolean {
  return scope.kind === 'match' ? scope.matchId === match.matchId : scope.stageId === match.stageId;
}

export function isMatchCapability(value: string): value is MatchCapability {
  return (MATCH_CAPABILITIES as readonly string[]).includes(value);
}

/** Refuses an assignment nobody could act on, before it is stored. */
export function validateAssignment(
  assignment: MatchAssignment,
): Result<MatchAssignment, MatchAuthorityError> {
  if (assignment.capabilities.length === 0) {
    return err(
      new MatchAuthorityError('An assignment granting no capability authorises nothing', {
        assignmentId: assignment.assignmentId,
      }),
    );
  }

  const unknown = assignment.capabilities.find((capability) => !isMatchCapability(capability));
  if (unknown) {
    return err(
      new MatchAuthorityError(
        `Unknown match capability "${unknown}". Known: ${MATCH_CAPABILITIES.join(', ')}`,
        { assignmentId: assignment.assignmentId, capability: unknown },
      ),
    );
  }

  return ok(assignment);
}
