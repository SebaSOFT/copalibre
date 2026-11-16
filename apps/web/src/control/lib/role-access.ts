import {
  capabilitiesForRole,
  ORGANIZATION_ROLES,
  type OrganizationCapability,
  type OrganizationRole,
} from '@copalibre/domain';

/**
 * Whether the signed-in role may use what `capability` guards. A role that has not resolved yet
 * (`undefined`) is allowed, the convention the dashboard and the side navigation already follow:
 * the server refuses what the role cannot do, so the client only withholds what it knows.
 */
export function roleMayUse(
  role: OrganizationRole | undefined,
  capability: OrganizationCapability,
): boolean {
  return role === undefined || capabilitiesForRole(role).includes(capability);
}

/**
 * The roles that hold `capability`, in the domain's own role order. Derived from
 * `capabilitiesForRole`, so a section's "who can" line follows the capability mapping instead of
 * a role list typed beside it.
 */
export function rolesWithCapability(
  capability: OrganizationCapability,
): readonly OrganizationRole[] {
  return ORGANIZATION_ROLES.filter((role) => capabilitiesForRole(role).includes(capability));
}
