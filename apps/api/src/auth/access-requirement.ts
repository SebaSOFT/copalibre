import { SetMetadata } from '@nestjs/common';
import type { OrganizationCapability, OrganizationRole } from '@copalibre/domain';

export const ACCESS_REQUIREMENT_KEY = 'copalibre:access-requirement';
export const SUPER_ADMIN_SCOPE = 'copalibre.super-admin';

/**
 * Scopes that grant unconditional, installation-level authority the moment a
 * guard sees them. Never attachable to a Personal Access Token — PATs mint
 * scoped automation credentials, not fresh installation authority.
 */
export const PRIVILEGED_SCOPES: readonly string[] = [SUPER_ADMIN_SCOPE];

export type AccessRequirement =
  | { readonly kind: 'organization-role'; readonly roles: readonly OrganizationRole[] }
  | { readonly kind: 'organization-capability'; readonly capability: OrganizationCapability }
  | { readonly kind: 'super-admin' }
  | { readonly kind: 'invitation-acceptance' }
  | { readonly kind: 'participant-self-service' }
  | { readonly kind: 'organization-bootstrap-or-admin' }
  | { readonly kind: 'self' };

/** Declares the active organization role required by a non-public controller route. */
export const RequireOrganizationRole = (
  ...roles: readonly OrganizationRole[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, {
    kind: 'organization-role',
    roles,
  } satisfies AccessRequirement);

/**
 * Declares the organization capability required by a non-public controller
 * route, resolved to the roles that hold it through
 * `packages/domain`'s role-capability mapping rather than naming roles here
 * directly — the mapping is the one place a route's admitted roles can
 * change.
 */
export const RequireOrganizationCapability = (
  capability: OrganizationCapability,
): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, {
    kind: 'organization-capability',
    capability,
  } satisfies AccessRequirement);

/** Declares installation-level authority for actions that have no organization yet. */
export const RequireSuperAdmin = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, { kind: 'super-admin' } satisfies AccessRequirement);

/** A verified recipient accepts before they belong to an organization. */
export const AllowInvitationAcceptance = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, {
    kind: 'invitation-acceptance',
  } satisfies AccessRequirement);

/** Requires an explicit participant identity link in the requested organization. */
export const RequireParticipantSelfService = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, {
    kind: 'participant-self-service',
  } satisfies AccessRequirement);

/** First invitation may be bootstrapped by super-admin; later invitations need local admin. */
export const RequireOrganizationBootstrapOrAdmin = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, {
    kind: 'organization-bootstrap-or-admin',
  } satisfies AccessRequirement);

/**
 * A route with no organization in its path at all — only a verified subject is
 * required, resolved to their installation principal. For lookups scoped to
 * "the caller", never to a specific organization (e.g. listing every
 * organization the caller belongs to).
 */
export const RequireSelf = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_REQUIREMENT_KEY, { kind: 'self' } satisfies AccessRequirement);
