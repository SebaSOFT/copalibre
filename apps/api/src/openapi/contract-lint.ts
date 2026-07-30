import type { OpenAPIObject } from '@nestjs/swagger';
import {
  PLANE_REQUIRED_SCOPES,
  planeRequiresAuthentication,
  type SecurityPlane,
} from '../auth/security-plane';

/**
 * Contract lint. The design's mitigation for "generated artifact could
 * accidentally expose internal-only endpoints if decorators are misapplied":
 * every route must be deliberately tagged with a security plane, and any
 * authenticated plane must actually declare bearer security in the artifact —
 * otherwise a mis-decorated route would be published as public.
 *
 * This is CopaLibre-specific structural policy, so it is ours; generic OpenAPI
 * validity is left to the schema itself, which @nestjs/swagger generates.
 */

export interface LintFinding {
  readonly route: string;
  readonly rule:
    | 'missing-security-plane'
    | 'authenticated-route-without-bearer'
    | 'public-route-with-bearer'
    | 'missing-operation-summary'
    | 'missing-response-schema';
  readonly message: string;
}

/** Route → plane, collected from the controller metadata at generation time. */
export type RoutePlanes = Readonly<Record<string, SecurityPlane>>;

export function lintOpenApiContract(
  document: OpenAPIObject,
  planes: RoutePlanes,
): readonly LintFinding[] {
  const findings: LintFinding[] = [];

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = (pathItem as Record<string, unknown>)[method];
      if (!operation || typeof operation !== 'object') continue;

      const route = `${method.toUpperCase()} ${path}`;
      const op = operation as {
        security?: readonly unknown[];
        summary?: string;
        responses?: Record<string, unknown>;
        operationId?: string;
      };

      const plane = planes[route];
      if (!plane) {
        findings.push({
          route,
          rule: 'missing-security-plane',
          message:
            'Route declares no security plane. Add @SecurityPlaneTag(...) — an untagged route is treated as admin-control at runtime but must still be explicit.',
        });
        continue;
      }

      const declaresBearer = (op.security ?? []).length > 0;
      if (planeRequiresAuthentication(plane) && !declaresBearer) {
        findings.push({
          route,
          rule: 'authenticated-route-without-bearer',
          message: `Plane "${plane}" requires a token (scopes: ${
            PLANE_REQUIRED_SCOPES[plane].join(', ') || 'none'
          }) but the artifact advertises no bearer security. Add @ApiBearerAuth().`,
        });
      }
      if (!planeRequiresAuthentication(plane) && declaresBearer) {
        findings.push({
          route,
          rule: 'public-route-with-bearer',
          message:
            'Public-read route advertises bearer security, which misleads generated clients into sending tokens to a public endpoint.',
        });
      }

      if (!op.summary) {
        findings.push({
          route,
          rule: 'missing-operation-summary',
          message: 'Route has no @ApiOperation summary; generated docs would be unusable.',
        });
      }

      const responses = op.responses ?? {};
      const hasSuccessSchema = Object.entries(responses).some(
        ([status, response]) =>
          status.startsWith('2') && hasContentSchema(response as Record<string, unknown>),
      );
      if (!hasSuccessSchema) {
        findings.push({
          route,
          rule: 'missing-response-schema',
          message:
            'No 2xx response with a schema; generated client types would be untyped for the success path.',
        });
      }
    }
  }

  return findings;
}

function hasContentSchema(response: Record<string, unknown>): boolean {
  const content = response.content as Record<string, unknown> | undefined;
  if (!content) return false;
  return Object.values(content).some(
    (media) =>
      typeof media === 'object' && media !== null && 'schema' in (media as Record<string, unknown>),
  );
}
