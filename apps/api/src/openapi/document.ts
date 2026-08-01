import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * The OpenAPI artifact is generated from the decorated controllers so the spec
 * cannot drift from the implementation, then contract-linted and
 * breaking-change-checked in CI before phase 0021 serves it via Scalar.
 */
/**
 * Bumped to 2.0.0 by 0008-extensible-module-foundation: `descriptorVersion`
 * changed from an integer to a semver string, which the breaking-change check
 * correctly flagged as incompatible for existing callers. No client consumes
 * the API yet (phase 0016 is the first), so nothing needs migrating — but the
 * version reflects the contract change rather than hiding it.
 *
 * Bumped to 3.0.0 by 0023-tournament-authoring-and-registration-review:
 * tournament creation now writes the initial ruleset, so `format`,
 * `publicRegistration`, and `requiresCheckIn` are required request fields
 * instead of implied UI state.
 */
export const OPENAPI_VERSION = '3.0.0';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('CopaLibre API')
    .setDescription(
      [
        'Self-hosted tournament management API.',
        '',
        'Authentication is JWT Bearer, validated against the operator-selected',
        'identity provider’s JWKS. Browsers use Authorization Code + PKCE and',
        'hold the access token in memory only — never localStorage. A token',
        'passed as a query parameter is ignored, because URLs leak into proxy',
        'logs, browser history, metrics, traces and screenshots.',
        '',
        'Every route declares one security plane: public-read,',
        'authenticated-interaction, admin-control, or integration.',
        'authenticated-interaction and admin-control share this same bearer',
        'transport and differ only in authorization policy.',
      ].join('\n'),
    )
    .setVersion(OPENAPI_VERSION)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Short-lived access token. Strict stateless mode is the default: no refresh credential is persisted, so a reload reauthenticates.',
      },
      'bearer',
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}
