import { importJWK, jwtVerify } from 'jose';
import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';
import { assertPatScopesAllowed, getLocalKeys, issueLocalJwt } from './auth.controller.js';
import { SUPER_ADMIN_SCOPE } from '../auth/access-requirement.js';

describe('assertPatScopesAllowed', () => {
  const callerScopes = ['copalibre.control', 'copalibre.participant'];

  it('passes when requested is a strict subset of the caller scopes', () => {
    expect(() => assertPatScopesAllowed(['copalibre.control'], callerScopes)).not.toThrow();
  });

  it('passes when requested equals the caller scopes', () => {
    expect(() => assertPatScopesAllowed([...callerScopes], callerScopes)).not.toThrow();
  });

  it('passes when requested is empty', () => {
    expect(() => assertPatScopesAllowed([], callerScopes)).not.toThrow();
  });

  it('throws when requested includes a scope the caller does not hold', () => {
    expect(() =>
      assertPatScopesAllowed(['copalibre.control', 'copalibre.integration'], callerScopes),
    ).toThrow(/copalibre\.integration/);
  });

  it(`throws on ${SUPER_ADMIN_SCOPE} even when the caller holds it`, () => {
    const superAdminCaller = [...callerScopes, SUPER_ADMIN_SCOPE];
    expect(() => assertPatScopesAllowed([SUPER_ADMIN_SCOPE], superAdminCaller)).toThrow(
      /cannot be attached/,
    );
  });
});

describe('getLocalKeys and RS256 native token issuance', () => {
  it('returns valid RS256 JWKS with matching key id', () => {
    const { privateKey, jwks } = getLocalKeys();
    expect(privateKey).toContain('BEGIN PRIVATE KEY');
    expect(jwks.keys.length).toBeGreaterThan(0);
    const key = jwks.keys[0];
    expect(key).toBeDefined();
    if (key) {
      expect(key.kty).toBe('RSA');
      expect(key.alg).toBe('RS256');
      expect(key.kid).toBe('copalibre-local-key-1');
    }
  });

  it('issues an RS256 token that verifies against local JWKS', async () => {
    const queryBuilder = {
      selectAll: () => queryBuilder,
      where: () => queryBuilder,
      execute: async () => [] as unknown as never,
      executeTakeFirst: async () => undefined as unknown as never,
    };
    const mockDb = {
      selectFrom: () => queryBuilder,
    } as unknown as Kysely<Database>;

    const token = await issueLocalJwt(
      mockDb,
      '01800000-0000-7000-8000-000000000001',
      'admin@example.test',
      'org-1',
    );

    const { jwks } = getLocalKeys();
    const jwk = jwks.keys[0];
    expect(jwk).toBeDefined();
    if (!jwk) throw new Error('No JWK found');
    const publicKey = await importJWK(jwk as Parameters<typeof importJWK>[0], 'RS256');

    const result = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'http://localhost:8080',
      audience: 'copalibre',
    });

    expect(result.payload.sub).toBe('01800000-0000-7000-8000-000000000001');
    expect(result.payload.email).toBe('admin@example.test');
    expect(result.payload.org).toBe('org-1');
    expect(result.payload.scp).toContain('copalibre.control');
  });
});

