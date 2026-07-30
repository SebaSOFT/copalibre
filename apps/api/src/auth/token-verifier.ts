import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { ALLOWED_ALGORITHMS, type AuthConfig } from './auth-config.js';
import type { AuthenticatedSubject } from './request-context.js';

/**
 * Verifies access tokens against the identity provider's JWKS.
 *
 * Key fetching/caching/rotation is delegated to jose's `createRemoteJWKSet`
 * rather than hand-rolled: it already handles cooldowns, cache max-age, and
 * re-fetching on unknown `kid`, which is exactly the rotation-overlap behavior
 * the design's JWKS-outage mitigation calls for.
 */

export type TokenRejectionReason =
  | 'malformed'
  | 'unknown-key'
  | 'bad-signature'
  | 'disallowed-algorithm'
  | 'wrong-issuer'
  | 'wrong-audience'
  | 'expired'
  | 'not-yet-valid'
  | 'missing-subject';

export class TokenVerificationError extends Error {
  readonly code = 'TOKEN_VERIFICATION_FAILED';

  constructor(
    readonly reason: TokenRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

export class TokenVerifier {
  private readonly getKey: JWTVerifyGetKey;

  constructor(
    private readonly config: AuthConfig,
    /** Injectable in tests; production uses the remote JWKS. */
    getKey?: JWTVerifyGetKey,
  ) {
    this.getKey =
      getKey ??
      createRemoteJWKSet(new URL(config.jwksUri), {
        cacheMaxAge: config.jwksCacheMaxAgeMs,
      });
  }

  async verify(token: string): Promise<AuthenticatedSubject> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.getKey, {
        // Allowlist is enforced here, so `alg: none` or an HMAC-signed token
        // is rejected before any key lookup happens.
        algorithms: [...ALLOWED_ALGORITHMS],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: this.config.clockToleranceSeconds,
      });
      payload = result.payload;
    } catch (cause) {
      throw new TokenVerificationError(classify(cause), describe(cause));
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new TokenVerificationError('missing-subject', 'Token has no usable subject claim');
    }

    return {
      subjectId: payload.sub,
      organizationId: typeof payload.org === 'string' ? payload.org : undefined,
      scopes: parseScopes(payload.scp),
      tokenId: typeof payload.jti === 'string' ? payload.jti : undefined,
    };
  }
}

/** `scp` may be a space-delimited string (RFC 9068) or an array. */
function parseScopes(raw: unknown): readonly string[] {
  if (typeof raw === 'string') {
    return raw.split(' ').filter((scope) => scope.length > 0);
  }
  if (Array.isArray(raw)) {
    return raw.filter((scope): scope is string => typeof scope === 'string');
  }
  return [];
}

function classify(cause: unknown): TokenRejectionReason {
  const code = errorCode(cause);
  switch (code) {
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
      return 'bad-signature';
    case 'ERR_JWKS_NO_MATCHING_KEY':
      return 'unknown-key';
    case 'ERR_JWT_EXPIRED':
      return 'expired';
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
      return classifyClaimFailure(cause);
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
      return 'disallowed-algorithm';
    default:
      return 'malformed';
  }
}

function classifyClaimFailure(cause: unknown): TokenRejectionReason {
  const claim = (cause as { claim?: unknown }).claim;
  switch (claim) {
    case 'iss':
      return 'wrong-issuer';
    case 'aud':
      return 'wrong-audience';
    case 'nbf':
      return 'not-yet-valid';
    case 'exp':
      return 'expired';
    default:
      return 'malformed';
  }
}

function errorCode(cause: unknown): string | undefined {
  return typeof cause === 'object' && cause !== null && 'code' in cause
    ? String((cause as { code: unknown }).code)
    : undefined;
}

function describe(cause: unknown): string {
  // Never echo the token or claim values back to the caller.
  return cause instanceof Error ? cause.message : 'Token verification failed';
}
