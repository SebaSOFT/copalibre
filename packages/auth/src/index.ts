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
export {
  APPLICATION_COOKIE_NAMES,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  MAX_COOKIE_BYTES,
  PLAIN_SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_SECURE_ENV,
  clearingCookies,
  expectedSecureFor,
  maxAgeUntil,
  parseCookieHeader,
  readCookie,
  serializeCsrfCookie,
  serializeRefreshCookie,
  serializeSessionCookie,
  sessionCookieConfigFromEnv,
  sessionCookieMismatch,
  sessionCookieName,
  sessionCookieTooLarge,
  type SessionCookieConfig,
} from './session-cookies.js';
export {
  PERSONAL_ACCESS_TOKEN_PREFIX,
  extractAccessToken,
  extractBearerToken,
  type AccessTokenSource,
  type ExtractedAccessToken,
} from './access-token-source.js';
