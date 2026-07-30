import { SetMetadata } from '@nestjs/common';

/**
 * The four security planes from the architecture doc's "Security planes" table.
 * Every route declares one — contract-lint fails the build on an untagged route,
 * so a new endpoint cannot ship without a deliberate exposure decision.
 *
 * `authenticated-interaction` and `admin-control` share the same JWT mechanism
 * and differ only in authorization policy: "A participant token and an organizer
 * token look the same at the transport layer and differ entirely at the policy
 * layer."
 */
export type SecurityPlane =
  'public-read' | 'authenticated-interaction' | 'admin-control' | 'integration';

export const SECURITY_PLANE_KEY = 'copalibre:security-plane';

export const SecurityPlaneTag = (plane: SecurityPlane): MethodDecorator & ClassDecorator =>
  SetMetadata(SECURITY_PLANE_KEY, plane);

/** Planes that require a verified access token. */
export function planeRequiresAuthentication(plane: SecurityPlane): boolean {
  return plane !== 'public-read';
}

/** Coarse scopes each plane demands before the resource policy even runs. */
export const PLANE_REQUIRED_SCOPES: Readonly<Record<SecurityPlane, readonly string[]>> = {
  'public-read': [],
  'authenticated-interaction': ['copalibre.participant'],
  'admin-control': ['copalibre.control'],
  integration: ['copalibre.integration'],
};
