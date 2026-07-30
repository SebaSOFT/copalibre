import type { INestApplication } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { SECURITY_PLANE_KEY, type SecurityPlane } from '../auth/security-plane';
import type { RoutePlanes } from './contract-lint';

/**
 * Reads each route's declared security plane straight off the controller
 * metadata, so contract-lint compares the generated artifact against what the
 * code actually declares rather than a hand-maintained list that could drift.
 */
export function collectRoutePlanes(
  controllers: readonly (abstract new (...args: never[]) => object)[],
  globalPrefix = '',
): RoutePlanes {
  const planes: Record<string, SecurityPlane> = {};

  for (const controller of controllers) {
    const controllerPath = normalize(
      (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '',
    );
    const classPlane = Reflect.getMetadata(SECURITY_PLANE_KEY, controller) as
      SecurityPlane | undefined;

    const prototype = (controller as { prototype: object }).prototype;
    for (const property of Object.getOwnPropertyNames(prototype)) {
      if (property === 'constructor') continue;
      const handler = (prototype as Record<string, unknown>)[property];
      if (typeof handler !== 'function') continue;

      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (methodPath === undefined) continue;

      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      const plane =
        (Reflect.getMetadata(SECURITY_PLANE_KEY, handler) as SecurityPlane | undefined) ??
        classPlane;
      if (!plane) continue;

      const route = `${methodName(requestMethod)} ${joinPath(
        globalPrefix,
        controllerPath,
        normalize(methodPath),
      )}`;
      planes[route] = plane;
    }
  }

  return planes;
}

/** Route keys as they appear in the generated document (`:param` → `{param}`). */
function joinPath(...segments: readonly string[]): string {
  const path = segments
    .filter((segment) => segment.length > 0)
    .join('/')
    .replace(/\/+/g, '/');
  const withBraces = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  const prefixed = withBraces.startsWith('/') ? withBraces : `/${withBraces}`;
  return prefixed.length > 1 && prefixed.endsWith('/') ? prefixed.slice(0, -1) : prefixed;
}

function normalize(path: string): string {
  return path === '/' ? '' : path.replace(/^\/|\/$/g, '');
}

function methodName(method: RequestMethod | undefined): string {
  switch (method) {
    case RequestMethod.POST:
      return 'POST';
    case RequestMethod.PUT:
      return 'PUT';
    case RequestMethod.PATCH:
      return 'PATCH';
    case RequestMethod.DELETE:
      return 'DELETE';
    default:
      return 'GET';
  }
}

/** Convenience for the generation script. */
export function collectPlanesFromApp(
  app: INestApplication,
  controllers: readonly (abstract new (...args: never[]) => object)[],
): RoutePlanes {
  void app;
  return collectRoutePlanes(controllers);
}
