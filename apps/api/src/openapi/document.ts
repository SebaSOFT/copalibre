import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { FIXTURE_SIDE_SOURCE_MODELS } from '../dto/fixture-side-source.dto.js';

/**
 * The OpenAPI artifact is generated from the decorated controllers so the spec
 * cannot drift from the implementation, then contract-linted and
 * breaking-change-checked in CI before Scalar serves it.
 */
/**
 * Bumped to 2.0.0 for `descriptorVersion`
 * changed from an integer to a semver string, which the breaking-change check
 * correctly flagged as incompatible for existing callers. No client consumes
 * the API yet, so nothing needs migrating — but the
 * version reflects the contract change rather than hiding it.
 *
 * Bumped to 3.0.0 for tournament authoring and registration review:
 * tournament creation now writes the initial ruleset, so `format`,
 * `publicRegistration`, and `requiresCheckIn` are required request fields
 * instead of implied UI state.
 *
 * Bumped to 4.0.0 for roster terminology: match capability and participant
 * membership endpoint names changed to keep team membership separate from a match roster.
 *
 * Bumped to 5.0.0 for per-event rule authoring: tournament creation now
 * requires the canonical `customScripts` collection, even when it is empty.
 *
 * Bumped to 6.0.0 for match-grain scheduling: schedule assignment requests now
 * specify `matchId` and `slotId` against organization schedule grids, and fixture
 * responses include the fixture's primary `matchId`.
 *
 * Bumped to 7.0.0 for multi-stage tournament authoring: tournament creation now
 * requires a `stages` array declaring every stage up front, replacing the single
 * top-level `format`/`series` fields.
 *
 * Bumped to 8.0.0 because personal access token creation now requires an explicit
 * `scopes` array; callers can no longer inherit every scope from their session.
 *
 * Bumped to 9.0.0 because every path moved under `/api`, and `/.well-known/jwks.json`
 * was removed in favor of `/api/auth/jwks.json`.
 *
 * Bumped to 10.0.0 because native login, invitation acceptance and refresh no
 * longer return `accessToken` in the body: a browser session's token lives only
 * in an `HttpOnly` cookie, and those endpoints answer with session metadata.
 */
export const OPENAPI_VERSION = '10.0.0';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('CopaLibre API')
    .setDescription(
      [
        'Self-hosted tournament management API.',
        '',
        'Authentication is a JWT, validated against the operator-selected',
        'identity provider’s JWKS. API clients and personal access tokens send',
        'it as `Authorization: Bearer`. A browser session never holds it in',
        'script: the API keeps it in an HttpOnly, SameSite=Strict session',
        'cookie, and unsafe cookie-authenticated requests must echo the',
        '`copalibre_csrf` cookie in the `X-CopaLibre-CSRF` header. A token',
        'passed as a query parameter is ignored, because URLs leak into proxy',
        'logs, browser history, metrics, traces and screenshots.',
        '',
        'Every route declares one security plane: public-read,',
        'authenticated-interaction, admin-control, or integration.',
        'authenticated-interaction and admin-control share this same',
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

  return SwaggerModule.createDocument(app, config, { extraModels: FIXTURE_SIDE_SOURCE_MODELS });
}
