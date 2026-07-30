import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose';
import { createLocalJWKSet } from 'jose';
import {
  authConfigFromEnv,
  DEFAULT_CLOCK_TOLERANCE_SECONDS,
  type AuthConfig,
} from './auth-config.js';
import { TokenVerifier, TokenVerificationError } from './token-verifier.js';

const ISSUER = 'https://id.example.test/';
const AUDIENCE = 'copalibre-api';

interface KeyMaterial {
  readonly privateKey: KeyLike;
  readonly publicJwk: JWK;
  readonly kid: string;
}

async function makeKeys(alg = 'RS256', kid = 'key-1'): Promise<KeyMaterial> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg };
  return { privateKey, publicJwk, kid };
}

function verifierFor(keys: readonly JWK[], overrides?: Partial<AuthConfig>): TokenVerifier {
  const config: AuthConfig = {
    jwksUri: 'https://id.example.test/jwks',
    issuer: ISSUER,
    audience: AUDIENCE,
    jwksCacheMaxAgeMs: 60_000,
    clockToleranceSeconds: DEFAULT_CLOCK_TOLERANCE_SECONDS,
    ...overrides,
  };
  // Local key set instead of a network JWKS: verification logic is what's under
  // test, not jose's HTTP fetching.
  return new TokenVerifier(config, createLocalJWKSet({ keys: [...keys] }));
}

interface TokenOptions {
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiresIn?: string;
  readonly notBefore?: number;
  readonly subject?: string | null;
  readonly scopes?: string | string[];
  readonly org?: string;
  readonly jti?: string;
  readonly alg?: string;
}

async function signToken(keys: KeyMaterial, options: TokenOptions = {}): Promise<string> {
  const payload: Record<string, unknown> = {};
  if (options.scopes !== undefined) payload.scp = options.scopes;
  if (options.org !== undefined) payload.org = options.org;
  if (options.jti !== undefined) payload.jti = options.jti;

  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: keys.kid })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiresIn ?? '5m');

  if (options.subject !== null) jwt = jwt.setSubject(options.subject ?? 'user-1');
  if (options.notBefore !== undefined) jwt = jwt.setNotBefore(options.notBefore);

  return jwt.sign(keys.privateKey);
}

describe('TokenVerifier', () => {
  it('accepts a valid token and extracts the typed subject', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys, {
      org: 'org-7',
      scopes: 'copalibre.control copalibre.participant',
      jti: 'token-42',
    });

    const subject = await verifierFor([keys.publicJwk]).verify(token);
    expect(subject).toEqual({
      subjectId: 'user-1',
      organizationId: 'org-7',
      scopes: ['copalibre.control', 'copalibre.participant'],
      tokenId: 'token-42',
    });
  });

  it('accepts scp as an array as well as a space-delimited string', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys, { scopes: ['a', 'b'] });
    await expect(verifierFor([keys.publicJwk]).verify(token)).resolves.toMatchObject({
      scopes: ['a', 'b'],
    });
  });

  it('treats a missing scp claim as no scopes rather than failing', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys);
    await expect(verifierFor([keys.publicJwk]).verify(token)).resolves.toMatchObject({
      scopes: [],
    });
  });

  it('rejects a token signed by a different key', async () => {
    const signing = await makeKeys('RS256', 'key-1');
    const publishing = await makeKeys('RS256', 'key-1');
    const token = await signToken(signing);

    // Same kid, different key material: signature must fail.
    await expect(verifierFor([publishing.publicJwk]).verify(token)).rejects.toMatchObject({
      reason: 'bad-signature',
    });
  });

  it('rejects a token whose key is unknown to the JWKS', async () => {
    const signing = await makeKeys('RS256', 'rotated-out');
    const published = await makeKeys('RS256', 'current');
    const token = await signToken(signing);
    await expect(verifierFor([published.publicJwk]).verify(token)).rejects.toMatchObject({
      reason: 'unknown-key',
    });
  });

  it('rejects an HMAC-signed token: symmetric algorithms are not allowlisted', async () => {
    const keys = await makeKeys();
    const secret = new Uint8Array(32).fill(7);
    const hmacToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(secret);

    await expect(verifierFor([keys.publicJwk]).verify(hmacToken)).rejects.toBeInstanceOf(
      TokenVerificationError,
    );
  });

  it('rejects an unsecured token (alg: none)', async () => {
    const keys = await makeKeys();
    // alg:none tokens have an empty signature segment.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: ISSUER,
        aud: AUDIENCE,
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    ).toString('base64url');
    const unsecured = `${header}.${payload}.`;

    await expect(verifierFor([keys.publicJwk]).verify(unsecured)).rejects.toBeInstanceOf(
      TokenVerificationError,
    );
  });

  it('rejects a wrong issuer', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys, { issuer: 'https://evil.example.test/' });
    await expect(verifierFor([keys.publicJwk]).verify(token)).rejects.toMatchObject({
      reason: 'wrong-issuer',
    });
  });

  it('rejects a wrong audience', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys, { audience: 'some-other-api' });
    await expect(verifierFor([keys.publicJwk]).verify(token)).rejects.toMatchObject({
      reason: 'wrong-audience',
    });
  });

  it('rejects an expired token', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys, { expiresIn: '-1m' });
    await expect(verifierFor([keys.publicJwk]).verify(token)).rejects.toMatchObject({
      reason: 'expired',
    });
  });

  it('rejects a not-yet-valid token', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys, {
      notBefore: Math.floor(Date.now() / 1000) + 600,
    });
    await expect(verifierFor([keys.publicJwk]).verify(token)).rejects.toMatchObject({
      reason: 'not-yet-valid',
    });
  });

  it('rejects a token with no subject claim', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys, { subject: null });
    await expect(verifierFor([keys.publicJwk]).verify(token)).rejects.toMatchObject({
      reason: 'missing-subject',
    });
  });

  it('rejects a structurally malformed token', async () => {
    const keys = await makeKeys();
    await expect(verifierFor([keys.publicJwk]).verify('not-a-jwt')).rejects.toMatchObject({
      reason: 'malformed',
    });
  });

  it('never echoes the token back in the error message', async () => {
    const keys = await makeKeys();
    const token = await signToken(keys, { expiresIn: '-1m' });
    try {
      await verifierFor([keys.publicJwk]).verify(token);
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as Error).message).not.toContain(token);
    }
  });

  it('accepts an ES256 token, since asymmetric ECDSA is allowlisted', async () => {
    const keys = await makeKeys('ES256', 'ec-1');
    const token = await signToken(keys, { alg: 'ES256' });
    await expect(verifierFor([keys.publicJwk]).verify(token)).resolves.toMatchObject({
      subjectId: 'user-1',
    });
  });
});

describe('authConfigFromEnv', () => {
  const complete = {
    COPALIBRE_JWKS_URI: 'https://id.example.test/jwks',
    COPALIBRE_JWT_ISSUER: ISSUER,
    COPALIBRE_JWT_AUDIENCE: AUDIENCE,
  };

  it('reads a complete configuration and applies defaults', () => {
    const config = authConfigFromEnv(complete);
    expect(config).toMatchObject({
      jwksUri: complete.COPALIBRE_JWKS_URI,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSeconds: DEFAULT_CLOCK_TOLERANCE_SECONDS,
    });
    expect(config.jwksCacheMaxAgeMs).toBeGreaterThan(0);
  });

  it('honors explicit cache age and clock tolerance', () => {
    const config = authConfigFromEnv({
      ...complete,
      COPALIBRE_JWKS_CACHE_MAX_AGE_MS: '1000',
      COPALIBRE_JWT_CLOCK_TOLERANCE_SECONDS: '30',
    });
    expect(config.jwksCacheMaxAgeMs).toBe(1000);
    expect(config.clockToleranceSeconds).toBe(30);
  });

  it('falls back to defaults on non-numeric or non-positive overrides', () => {
    const config = authConfigFromEnv({
      ...complete,
      COPALIBRE_JWKS_CACHE_MAX_AGE_MS: 'soon',
      COPALIBRE_JWT_CLOCK_TOLERANCE_SECONDS: '-5',
    });
    expect(config.clockToleranceSeconds).toBe(DEFAULT_CLOCK_TOLERANCE_SECONDS);
    expect(config.jwksCacheMaxAgeMs).toBeGreaterThan(0);
  });

  it.each([['COPALIBRE_JWKS_URI'], ['COPALIBRE_JWT_ISSUER'], ['COPALIBRE_JWT_AUDIENCE']])(
    'fails closed when %s is missing',
    (variable) => {
      const env: Record<string, string> = { ...complete };
      delete env[variable];
      expect(() => authConfigFromEnv(env)).toThrow(new RegExp(variable));
    },
  );
});
