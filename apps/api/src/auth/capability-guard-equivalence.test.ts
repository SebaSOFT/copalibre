import { rolesForCapability, type OrganizationRole } from '@copalibre/domain';
import { ACCESS_REQUIREMENT_KEY, type AccessRequirement } from './access-requirement.js';
import { SECURITY_PLANE_KEY, type SecurityPlane } from './security-plane.js';
import { DELIBERATE_EQUIVALENCE_EXCEPTIONS, ROUTE_CAPABILITIES } from './route-capability-mapping.js';
import { OPENAPI_CONTROLLERS } from '../openapi/generate-controllers.js';

const PATH_METADATA = 'path';

/**
 * `tournament-admin` did not exist as a role before this change, so it never
 * admitted any route — every route it now resolves to is the deliberate
 * point of adding the role (task 3.3), not a case needing a per-route
 * call-out the way `club-admin`'s pre-existing-role narrowing does.
 */
const NEW_ROLE_ADDITIONS_ALWAYS_ALLOWED: ReadonlySet<string> = new Set(['tournament-admin']);

interface OrganizationRoleRoute {
  readonly key: string;
  readonly roles: readonly OrganizationRole[];
}

function organizationRoleRoutes(): readonly OrganizationRoleRoute[] {
  const routes: OrganizationRoleRoute[] = [];

  for (const controller of OPENAPI_CONTROLLERS) {
    const classPlane = Reflect.getMetadata(SECURITY_PLANE_KEY, controller) as
      SecurityPlane | undefined;
    const classRequirement = Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, controller) as
      AccessRequirement | undefined;
    const prototype = controller.prototype as unknown as Record<string, unknown>;

    for (const property of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[property];
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(PATH_METADATA, handler) === undefined
      ) {
        continue;
      }
      const plane =
        (Reflect.getMetadata(SECURITY_PLANE_KEY, handler) as SecurityPlane | undefined) ??
        classPlane;
      if (plane === undefined || plane === 'public-read') continue;
      const requirement =
        (Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, handler) as AccessRequirement | undefined) ??
        classRequirement;
      if (requirement?.kind !== 'organization-role') continue;
      routes.push({ key: `${controller.name}.${property}`, roles: requirement.roles });
    }
  }

  routes.sort((a, b) => a.key.localeCompare(b.key));
  return routes;
}

describe('capability guard equivalence (pre-conversion)', () => {
  it('resolves every organization-role route to a declared capability', () => {
    const routes = organizationRoleRoutes();
    const missing = routes
      .filter((route) => ROUTE_CAPABILITIES[route.key] === undefined)
      .map((route) => route.key);

    expect(missing).toEqual([]);
  });

  it('has no mapping entry for a route that no longer exists', () => {
    const currentKeys = new Set(organizationRoleRoutes().map((route) => route.key));
    const stale = Object.keys(ROUTE_CAPABILITIES).filter((key) => !currentKeys.has(key));

    expect(stale).toEqual([]);
  });

  it('names every deliberate exception in the route-capability mapping', () => {
    const orphaned = Object.keys(DELIBERATE_EQUIVALENCE_EXCEPTIONS).filter(
      (key) => ROUTE_CAPABILITIES[key] === undefined,
    );

    expect(orphaned).toEqual([]);
  });

  it('never drops a role a route admits today', () => {
    const routes = organizationRoleRoutes();
    const removals: string[] = [];

    for (const route of routes) {
      const capability = ROUTE_CAPABILITIES[route.key];
      if (capability === undefined) continue; // reported by the completeness test above

      const mappedRoles = new Set(rolesForCapability(capability));
      for (const role of route.roles) {
        if (!mappedRoles.has(role)) {
          removals.push(`${route.key}: "${role}" admitted today, absent from "${capability}"`);
        }
      }
    }

    expect(removals).toEqual([]);
  });

  it('adds no role beyond a named tournament-admin introduction or a named deliberate exception', () => {
    const routes = organizationRoleRoutes();
    const unexplained: string[] = [];

    for (const route of routes) {
      const capability = ROUTE_CAPABILITIES[route.key];
      if (capability === undefined) continue; // reported by the completeness test above

      const todayRoles = new Set(route.roles);
      const exceptionRoles = new Set(DELIBERATE_EQUIVALENCE_EXCEPTIONS[route.key] ?? []);
      const mappedRoles = rolesForCapability(capability);

      for (const role of mappedRoles) {
        if (todayRoles.has(role)) continue;
        if (NEW_ROLE_ADDITIONS_ALWAYS_ALLOWED.has(role)) continue;
        if (exceptionRoles.has(role)) continue;
        unexplained.push(`${route.key}: "${role}" newly admitted by "${capability}", not named as an exception`);
      }
    }

    expect(unexplained).toEqual([]);
  });
});
