import { ForbiddenException } from '@nestjs/common';
import {
  authorizeMatchCommand,
  type AuthorityDecision,
  type MatchAssignment,
  type MatchCapability,
  type MatchContext,
} from '@copalibre/domain';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import type { SecurityPlane } from '../auth/security-plane.js';

/**
 * Authorization: may this subject act on THIS resource? Separate from the guard
 * (which only answers "is the token valid") because that separation is what lets
 * a participant token and an organizer token be identical at the transport layer
 * and differ entirely here.
 *
 * Fine-grained permissions deliberately live in this layer and not in token
 * claims: "Do not place secrets, personal data, or large mutable permission
 * matrices in the token."
 */

export interface ResourceRef {
  /** Organization owning the resource; every CopaLibre resource is org-scoped. */
  readonly organizationId: string;
  /** For participant self-service, the participant the resource belongs to. */
  readonly ownerParticipantId?: string;
}

export type PolicyDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export function allow(): PolicyDecision {
  return { allowed: true };
}

export function deny(reason: string): PolicyDecision {
  return { allowed: false, reason };
}

/** Public reads never consult a subject; they only ever see published data. */
export function evaluatePublicRead(): PolicyDecision {
  return allow();
}

/**
 * Participant self-service. "A participant's scope is their own records, never
 * another participant's or an operator's tools."
 */
export function evaluateAuthenticatedInteraction(
  subject: AuthenticatedSubject,
  resource: ResourceRef,
): PolicyDecision {
  if (!subject.organizationId || subject.organizationId !== resource.organizationId) {
    return deny('subject is not scoped to this organization');
  }
  if (resource.ownerParticipantId === undefined) {
    return deny('resource has no participant owner; not reachable on this plane');
  }
  if (resource.ownerParticipantId !== subject.participantPersonId) {
    return deny('subject may only act on their own records');
  }
  return allow();
}

/** Organizer/official consoles: org-scoped, and destructive acts need intent. */
export function evaluateAdminControl(
  subject: AuthenticatedSubject,
  resource: ResourceRef,
  options?: { readonly destructive?: boolean; readonly confirmed?: boolean },
): PolicyDecision {
  if (!subject.organizationId || subject.organizationId !== resource.organizationId) {
    return deny('subject is not scoped to this organization');
  }
  if (options?.destructive && !options.confirmed) {
    // "explicit confirmation for destructive actions" is a policy requirement,
    // not a UI nicety — the API refuses an unconfirmed destructive command.
    return deny('destructive action requires explicit confirmation');
  }
  return allow();
}

/**
 * Integration clients (OAuth clients, API keys, webhooks, MCP). The shape exists
 * now so phases adding integrations inherit it; full OAuth-client and webhook
 * support is a later phase, so this only enforces org scope plus narrow scopes.
 */
export function evaluateIntegration(
  subject: AuthenticatedSubject,
  resource: ResourceRef,
  requiredScopes: readonly string[] = [],
): PolicyDecision {
  if (!subject.organizationId || subject.organizationId !== resource.organizationId) {
    return deny('subject is not scoped to this organization');
  }
  const missing = requiredScopes.filter((scope) => !subject.scopes.includes(scope));
  if (missing.length > 0) {
    return deny(`integration token lacks scope: ${missing.join(', ')}`);
  }
  return allow();
}

export interface PolicyRequest {
  readonly plane: SecurityPlane;
  readonly subject?: AuthenticatedSubject;
  readonly resource: ResourceRef;
  readonly destructive?: boolean;
  readonly confirmed?: boolean;
  readonly requiredScopes?: readonly string[];
}

/** Single entry point so controllers never branch on plane themselves. */
export function evaluatePolicy(request: PolicyRequest): PolicyDecision {
  if (request.plane === 'public-read') {
    return evaluatePublicRead();
  }
  if (!request.subject) {
    return deny('authenticated plane reached without a verified subject');
  }
  switch (request.plane) {
    case 'authenticated-interaction':
      return evaluateAuthenticatedInteraction(request.subject, request.resource);
    case 'admin-control':
      return evaluateAdminControl(request.subject, request.resource, {
        destructive: request.destructive,
        confirmed: request.confirmed,
      });
    case 'integration':
      return evaluateIntegration(request.subject, request.resource, request.requiredScopes);
  }
}

/**
 * Throws 403 on denial. Authentication already succeeded by the time policy
 * runs, so an authorization failure is never a 401.
 */
export function enforcePolicy(request: PolicyRequest): void {
  const decision = evaluatePolicy(request);
  if (!decision.allowed) {
    throw new ForbiddenException(decision.reason);
  }
}

/**
 * Submitting a report or dispute for a match.
 *
 * Ownership here is not "the resource already belongs to this subject" the
 * way a registration does — it is "the subject is a party to the match this
 * submission names." `evaluateAuthenticatedInteraction` alone cannot express
 * that (it compares a resource's existing owner to the subject; a report
 * being submitted has no owner yet), so this composes the same org-scope
 * check with an explicit party-to-match gate rather than inventing a second,
 * unrelated authorization concept. "A roster is match-scoped and does not
 * grant participant ownership by itself" — the party check is a real query
 * (`EnrollmentRepository.isParticipantPartyToMatch`), not a roster lookup.
 */
export interface ReportSubmissionRequest {
  readonly subject?: AuthenticatedSubject;
  readonly organizationId: string;
  readonly matchId: string;
  readonly isPartyToMatch: (
    organizationId: string,
    personId: string,
    matchId: string,
  ) => Promise<boolean>;
}

export async function enforceReportSubmission(request: ReportSubmissionRequest): Promise<string> {
  if (!request.subject) {
    throw new ForbiddenException('report/dispute submission requires a verified subject');
  }
  const personId = request.subject.participantPersonId;
  enforcePolicy({
    plane: 'authenticated-interaction',
    subject: request.subject,
    resource: { organizationId: request.organizationId, ownerParticipantId: personId },
  });
  // enforcePolicy already denied an undefined personId (an operator token has
  // none, so `ownerParticipantId` above was undefined too) — narrowed here
  // only so the caller gets a real string to query and record as submitter.
  if (personId === undefined) {
    throw new ForbiddenException('report/dispute submission requires a participant subject');
  }

  const isParty = await request.isPartyToMatch(request.organizationId, personId, request.matchId);
  if (!isParty) {
    throw new ForbiddenException('subject is not a party to this match');
  }
  return personId;
}

/**
 * Operating a match is a second question, asked after the first.
 *
 * Organization scope says the subject belongs here; it never says they are the
 * one standing at *this* table. So a match command passes the org check and
 * then a capability check over the appointments that cover this match — and
 * being an organizer grants neither, deliberately: the decision record asks for
 * these to be separate permissions rather than a consequence of a role.
 */
export function enforceMatchCommand(
  request: PolicyRequest & {
    readonly assignments: readonly MatchAssignment[];
    readonly capability: MatchCapability;
    readonly match: MatchContext;
  },
): AuthorityDecision {
  enforcePolicy(request);

  const subjectId = request.subject?.subjectId;
  if (!subjectId) {
    throw new ForbiddenException('match commands require a verified subject');
  }

  const authorized = authorizeMatchCommand(request.assignments, {
    subjectId,
    capability: request.capability,
    match: request.match,
  });
  if (!authorized.ok) {
    throw new ForbiddenException(authorized.error.message);
  }

  // Returned so the caller can record *which* appointment allowed the command:
  // an audit row saying only "allowed" cannot answer a disputed result.
  return authorized.value;
}
