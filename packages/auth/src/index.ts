/**
 * @copalibre/auth — JWT verification shared by every process role that has to
 * authenticate a person.
 *
 * It moved out of `apps/api` when `apps/events` needed the same verification
 * for its authenticated stream. Duplicating it would have been two
 * implementations of "is this token valid", and the one that fell behind would
 * be the one still accepting a revoked algorithm.
 */

export {
  TokenVerifier,
  TokenVerificationError,
  type TokenRejectionReason,
} from './token-verifier.js';
export {
  authConfigFromEnv,
  ALLOWED_ALGORITHMS,
  DEFAULT_JWKS_CACHE_MAX_AGE_MS,
  DEFAULT_CLOCK_TOLERANCE_SECONDS,
  type AuthConfig,
  type AllowedAlgorithm,
} from './auth-config.js';
export { hasScope, type AuthenticatedSubject, type RequestWithSubject } from './request-context.js';
