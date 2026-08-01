/**
 * Access-token contract configuration, per the architecture doc's "JWT access
 * and stateless API nodes". The identity provider itself is an explicit open
 * gate — only the JWT Bearer + JWKS + PKCE contract is fixed, so every value
 * here is operator-supplied and any compliant OIDC provider satisfies it.
 */

/**
 * Allowlisted signature algorithms. Asymmetric only: the API must be able to
 * verify without holding a secret capable of issuing. `none` and every HMAC
 * variant are absent by construction, so a token cannot select its own
 * verification scheme.
 */
export const ALLOWED_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384'] as const;

export type AllowedAlgorithm = (typeof ALLOWED_ALGORITHMS)[number];

export interface AuthConfig {
  /** JWKS endpoint of the selected identity provider. */
  readonly jwksUri: string;
  /** Exact expected `iss`. */
  readonly issuer: string;
  /** Exact expected `aud`. */
  readonly audience: string;
  /**
   * How long fetched keys stay usable, bounding both JWKS traffic and the
   * window in which a rotated-out key still verifies (key-rotation overlap).
   */
  readonly jwksCacheMaxAgeMs: number;
  /** Tolerance for clock skew when checking exp/nbf/iat, in seconds. */
  readonly clockToleranceSeconds: number;
}

export const DEFAULT_JWKS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
export const DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;

export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const jwksUri = env.COPALIBRE_JWKS_URI;
  const issuer = env.COPALIBRE_JWT_ISSUER;
  const audience = env.COPALIBRE_JWT_AUDIENCE;

  const missing = [
    ['COPALIBRE_JWKS_URI', jwksUri],
    ['COPALIBRE_JWT_ISSUER', issuer],
    ['COPALIBRE_JWT_AUDIENCE', audience],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    // Fail closed: an API that cannot verify tokens must not start and serve
    // traffic as if everything were public.
    throw new Error(`Missing required auth configuration: ${missing.join(', ')}`);
  }

  return {
    jwksUri: jwksUri as string,
    issuer: issuer as string,
    audience: audience as string,
    jwksCacheMaxAgeMs: readPositiveInt(
      env.COPALIBRE_JWKS_CACHE_MAX_AGE_MS,
      DEFAULT_JWKS_CACHE_MAX_AGE_MS,
    ),
    clockToleranceSeconds: readPositiveInt(
      env.COPALIBRE_JWT_CLOCK_TOLERANCE_SECONDS,
      DEFAULT_CLOCK_TOLERANCE_SECONDS,
    ),
  };
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
