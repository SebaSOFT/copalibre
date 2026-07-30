import { ForbiddenException } from '@nestjs/common';
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
  if (resource.ownerParticipantId !== subject.subjectId) {
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
