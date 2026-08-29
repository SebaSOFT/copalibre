import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * The organization-local taxonomy. `tournament-admin` is scoped to exactly one
 * tournament — see `role-capabilities.ts`'s `TOURNAMENT_SCOPED_ROLES`
 * and `OrganizationRoleAssignment.tournamentId`, required exactly for this role.
 */
export const ORGANIZATION_ROLES = [
  'admin',
  'club-admin',
  'tournament-admin',
  'referee',
  'broadcaster',
  'viewer',
] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/** Roles whose assignment names one resource within the organization rather than the whole organization. */
export const TOURNAMENT_SCOPED_ROLES = ['tournament-admin'] as const;

export function isTournamentScopedRole(role: OrganizationRole): boolean {
  return (TOURNAMENT_SCOPED_ROLES as readonly OrganizationRole[]).includes(role);
}

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
  /** Required exactly when `role` is a tournament-scoped role (`isTournamentScopedRole`); absent otherwise. */
  readonly tournamentId?: string;
}

/** An email-bound assignment awaiting acceptance by its verified OIDC recipient. */
export interface OrganizationInvitation {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly recipientEmail: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  readonly expiresAt: string;
  /** Required exactly when `role` is a tournament-scoped role (`isTournamentScopedRole`); absent otherwise. */
  readonly tournamentId?: string;
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
  const tournamentScoped = isTournamentScopedRole(invitation.role);
  if (tournamentScoped && invitation.tournamentId === undefined) {
    return err(
      new OrganizationAccessError(`The "${invitation.role}" role requires naming a tournament`),
    );
  }
  if (!tournamentScoped && invitation.tournamentId !== undefined) {
    return err(
      new OrganizationAccessError(
        `A tournament may only be named when the role is tournament-scoped, not "${invitation.role}"`,
      ),
    );
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

/** A principal's role in the installation-wide taxonomy. Only `super-admin` exists today. */
export const INSTALLATION_ROLES = ['super-admin'] as const;
export type InstallationRole = (typeof INSTALLATION_ROLES)[number];

/** An installation-level identity's role, mirroring `OrganizationRoleAssignment`'s shape. */
export interface InstallationRoleAssignment {
  readonly assignmentId: string;
  readonly principalId: string;
  readonly role: InstallationRole;
  readonly status: OrganizationMemberStatus;
  readonly deletedAt?: string;
}

/**
 * Who is granting a role, resolved once by the caller (guard/controller) rather
 * than re-derived independently by every route.
 */
export interface GrantorContext {
  readonly isSuperAdmin: boolean;
  readonly organizationAdminOf?: string;
}

/**
 * The role-granting hierarchy: a small, closed rule table, not a
 * configurable policy language.
 * - installation super-admin may grant super-admin, or any organization role
 *   (admin, club-admin, tournament-admin, referee, broadcaster, viewer).
 * - an organization admin may grant any organization role except super-admin
 *   (which is not itself an organization role) — this reuses the existing,
 *   unchanged authority an organization admin already has to grant
 *   broadcaster/viewer (design.md Non-Goals: "not changing how
 *   broadcaster/viewer are granted"), scoped to their own organization.
 * - club-admin and referee (no `organizationAdminOf`, not super-admin) may
 *   grant nothing.
 */
export function canGrantRole(
  grantor: GrantorContext,
  targetRole: OrganizationRole | InstallationRole,
  targetOrganizationId?: string,
): Result<true, OrganizationAccessError> {
  if (grantor.isSuperAdmin) return ok(true);

  if (grantor.organizationAdminOf) {
    if (targetRole === 'super-admin') {
      return err(new OrganizationAccessError('Only a super-admin may grant the super-admin role'));
    }
    if (targetOrganizationId && targetOrganizationId !== grantor.organizationAdminOf) {
      return err(
        new OrganizationAccessError(
          "An organization admin's grant authority never crosses into another organization",
        ),
      );
    }
    return ok(true);
  }

  return err(new OrganizationAccessError('This actor holds no role-granting authority'));
}

/** Would demoting/removing an `admin` assignment leave the organization with zero active admins? */
export function wouldLeaveOrganizationWithoutAdmin(
  activeAdminCountExcludingTarget: number,
): boolean {
  return activeAdminCountExcludingTarget < 1;
}

/** Would demoting/removing a `super-admin` assignment leave the installation with none? */
export function wouldLeaveInstallationWithoutSuperAdmin(
  activeSuperAdminCountExcludingTarget: number,
): boolean {
  return activeSuperAdminCountExcludingTarget < 1;
}
