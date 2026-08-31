import { ACCESS_REQUIREMENT_KEY, type AccessRequirement } from './access-requirement.js';
import { SECURITY_PLANE_KEY, type SecurityPlane } from './security-plane.js';
import { ROUTE_CAPABILITIES } from './route-capability-mapping.js';
import { OPENAPI_CONTROLLERS } from '../openapi/generate-controllers.js';

const PATH_METADATA = 'path';

interface DeclaredRoute {
  readonly key: string;
  readonly requirement: AccessRequirement | undefined;
}

function declaredRoutes(): readonly DeclaredRoute[] {
  const routes: DeclaredRoute[] = [];

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
      routes.push({ key: `${controller.name}.${property}`, requirement });
    }
  }

  routes.sort((a, b) => a.key.localeCompare(b.key));
  return routes;
}

/**
 * Every route this change identified as role-guarded (task 1.1's
 * enumeration) is converted to `RequireOrganizationCapability` (task 2.2).
 * `route-capability-mapping.ts`'s `ROUTE_CAPABILITIES` was the oracle
 * `capability-guard-equivalence.test.ts` checked pre-conversion — it
 * verified, once, that resolving each entry's capability through
 * `rolesForCapability` reproduced the roles that route admitted before this
 * change (deliberate exceptions named and reasoned in `design.md`). That
 * history does not need re-deriving on every run; what this file guards
 * against now is drift between the two things that must stay in lockstep
 * going forward: no route left on the legacy role-listing guard, and every
 * capability-guarded route naming exactly the capability the mapping
 * declares for it — so an accidental typo during conversion, or a later
 * hand-edit of one without the other, fails here.
 */
describe('capability guard equivalence (post-conversion)', () => {
  it('leaves no route on the legacy role-listing guard', () => {
    const legacy = declaredRoutes()
      .filter((route) => route.requirement?.kind === 'organization-role')
      .map((route) => route.key);

    expect(legacy).toEqual([]);
  });

  it('names a capability for every route the mapping declares one for, and vice versa', () => {
    const capabilityRoutes = declaredRoutes().filter(
      (route) => route.requirement?.kind === 'organization-capability',
    );
    const currentKeys = new Set(capabilityRoutes.map((route) => route.key));

    const missing = Object.keys(ROUTE_CAPABILITIES).filter((key) => !currentKeys.has(key));
    const undeclared = capabilityRoutes
      .filter((route) => ROUTE_CAPABILITIES[route.key] === undefined)
      .map((route) => route.key);

    expect(missing).toEqual([]);
    expect(undeclared).toEqual([]);
  });

  it("guards each route with exactly the mapping's declared capability", () => {
    const mismatches: string[] = [];

    for (const route of declaredRoutes()) {
      if (route.requirement?.kind !== 'organization-capability') continue;
      const declaredCapability = ROUTE_CAPABILITIES[route.key];
      if (declaredCapability === undefined) continue; // reported above

      if (route.requirement.capability !== declaredCapability) {
        mismatches.push(
          `${route.key}: guard requires "${route.requirement.capability}", mapping declares "${declaredCapability}"`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });
});
