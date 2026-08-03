import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/** The fixed organization-local taxonomy introduced by change 0026. */
export const ORGANIZATION_ROLES = ['admin', 'referee', 'broadcaster', 'viewer'] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const ORGANIZATION_MEMBER_STATUSES = ['active', 'inactive'] as const;
export type OrganizationMemberStatus = (typeof ORGANIZATION_MEMBER_STATUSES)[number];

/** CopaLibre's stable identity, linked to an OIDC subject only after verification. */
export interface IdentityPrincipal {
  readonly principalId: string;
  readonly email: string;
  readonly oidcSubjectId?: string;
  readonly name?: string;
  readonly picture?: string;
}

/** An explicit link between an installation identity and a participant record. */
export interface ParticipantIdentityLink {
  readonly principalId: string;
  readonly organizationId: string;
  readonly personId: string;
}

/** A principal's role inside one organization. OIDC `sub` is never an authorization key. */
export interface OrganizationRoleAssignment {
  readonly assignmentId: string;
  readonly organizationId: string;
  readonly principalId: string;
  readonly email: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly deletedAt?: string;
}

/** An email-bound assignment awaiting acceptance by its verified OIDC recipient. */
export interface OrganizationInvitation {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly recipientEmail: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly expiresAt: string;
}

export class OrganizationAccessError extends DomainError {
  readonly code = 'ORGANIZATION_ACCESS_INVALID';
}

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isOrganizationRole(value: string): value is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(value);
}

export function isOrganizationMemberStatus(value: string): value is OrganizationMemberStatus {
  return (ORGANIZATION_MEMBER_STATUSES as readonly string[]).includes(value);
}

export function validateOrganizationInvitation(
  invitation: OrganizationInvitation,
): Result<OrganizationInvitation, OrganizationAccessError> {
  if (normaliseEmail(invitation.recipientEmail) === '') {
    return err(new OrganizationAccessError('An organization invitation needs a recipient email'));
  }
  if (!isOrganizationRole(invitation.role)) {
    return err(new OrganizationAccessError(`Unknown organization role "${invitation.role}"`));
  }
  if (!isOrganizationMemberStatus(invitation.status)) {
    return err(
      new OrganizationAccessError(`Unknown organization member status "${invitation.status}"`),
    );
  }
  if (!Number.isFinite(Date.parse(invitation.expiresAt))) {
    return err(new OrganizationAccessError('An organization invitation needs a valid expiry'));
  }
  return ok({ ...invitation, recipientEmail: normaliseEmail(invitation.recipientEmail) });
}

/** The first accepted organization member is always an admin. */
export function canCreateOrganizationInvitation(
  acceptedAssignmentCount: number,
  role: OrganizationRole,
): Result<true, OrganizationAccessError> {
  if (acceptedAssignmentCount === 0 && role !== 'admin') {
    return err(
      new OrganizationAccessError('The first organization invitation must assign the admin role'),
    );
  }
  return ok(true);
}
