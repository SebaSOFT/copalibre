import { ACCESS_REQUIREMENT_KEY } from './access-requirement.js';
import { SECURITY_PLANE_KEY, type SecurityPlane } from './security-plane.js';
import { OPENAPI_CONTROLLERS } from '../openapi/generate-controllers.js';

const PATH_METADATA = 'path';

describe('authenticated route access coverage', () => {
  it('requires an explicit access requirement on every authenticated controller route', () => {
    const uncovered: string[] = [];

    for (const controller of OPENAPI_CONTROLLERS) {
      const classPlane = Reflect.getMetadata(SECURITY_PLANE_KEY, controller) as
        SecurityPlane | undefined;
      const classRequirement = Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, controller);
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
          Reflect.getMetadata(ACCESS_REQUIREMENT_KEY, handler) ?? classRequirement;
        if (requirement === undefined) uncovered.push(`${controller.name}.${property}`);
      }
    }

    expect(uncovered).toEqual([]);
  });
});
