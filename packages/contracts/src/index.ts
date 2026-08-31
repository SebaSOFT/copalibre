/**
 * @copalibre/contracts — the single API contract every client surface consumes
 * (public web, control web, TV, CLI, future mobile/PWA/MCP). Types are generated
 * from the OpenAPI artifact that `apps/api` produces from its decorated
 * controllers, so no hand-maintained client type can drift from the server.
 *
 * Regenerate with:
 *   yarn workspace @copalibre/api run openapi:generate   # spec from controllers
 *   yarn workspace @copalibre/contracts run generate     # types from spec
 */

export type { paths, components, operations } from './generated/v1.js';

import type { components, paths } from './generated/v1.js';

/** Convenience aliases so callers don't index into `components` by hand. */
export type OrganizationResponse = components['schemas']['OrganizationResponse'];
export type OrganizationStorageUsageResponse =
  components['schemas']['OrganizationStorageUsageResponse'];
export type CreateOrganizationRequest = components['schemas']['CreateOrganizationRequest'];
export type TournamentResponse = components['schemas']['TournamentResponse'];
export type CreateTournamentRequest = components['schemas']['CreateTournamentRequest'];
export type ProblemResponse = components['schemas']['ProblemResponse'];
export type HealthResponse = components['schemas']['HealthResponse'];
export type ReadinessResponse = components['schemas']['ReadinessResponse'];

/** Every path the API exposes, as a literal union — useful for typed clients. */
export type ApiPath = keyof paths;

/**
 * The bearer scheme name declared in the artifact. Clients must send the access
 * token in the `Authorization` header; a token in the query string is ignored by
 * the API on purpose, because URLs leak into proxy logs, browser history,
 * metrics, traces and screenshots.
 */
export const BEARER_SECURITY_SCHEME = 'bearer';

/** Coarse scopes the API's security planes require. */
export const SCOPES = {
  participant: 'copalibre.participant',
  control: 'copalibre.control',
  integration: 'copalibre.integration',
} as const;
