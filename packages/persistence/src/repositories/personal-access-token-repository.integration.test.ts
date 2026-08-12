import {
  PersonalAccessTokenRepository,
  IdentityPrincipalRepository,
  AuditReader,
  withTransaction,
  hashToken,
} from '../index.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';

describe('Personal Access Token repository (integration)', () => {
  let scratch: ScratchDatabase;
  let principalId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('pat');
    const principal = await withTransaction(scratch.db, (uow) =>
      new IdentityPrincipalRepository(scratch.db).create(uow, {
        email: 'admin@example.com',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    principalId = principal.principalId;
  });

  afterAll(async () => scratch.drop());

  it('creates and retrieves a PAT', async () => {
    const tokens = new PersonalAccessTokenRepository(scratch.db);
    
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.create(uow, {
        principalId,
        label: 'CLI Access',
        scopes: ['copalibre.control'],
        expiresAt: new Date(Date.now() + 86400000), // +1 day
        actor: `user:${principalId}`,
        authorizationContext: 'copalibre.control',
      }),
    );

    expect(issued).toMatchObject({
      principalId,
      label: 'CLI Access',
      scopes: ['copalibre.control'],
      revoked: false,
    });
    
    // We expect the raw token to be returned ONCE upon creation
    expect(issued.rawToken).toMatch(/^clpat_[a-zA-Z0-9_-]+$/);

    const tokenHash = hashToken(issued.rawToken.slice(6)); // hash the part after clpat_

    const scope = await tokens.scopeOf(tokenHash);
    expect(scope).toMatchObject({
      tokenId: issued.tokenId,
      principalId,
      scopes: ['copalibre.control'],
    });

    const listed = await tokens.listByPrincipal(principalId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.tokenId).toEqual(issued.tokenId);
  });

  it('revokes a PAT so it can no longer authorize requests', async () => {
    const tokens = new PersonalAccessTokenRepository(scratch.db);
    
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.create(uow, {
        principalId,
        label: 'To be revoked',
        scopes: ['copalibre.participant'],
        expiresAt: new Date(Date.now() + 86400000),
        actor: `user:${principalId}`,
        authorizationContext: 'copalibre.participant',
      }),
    );

    const tokenHash = hashToken(issued.rawToken.slice(6));
    await expect(tokens.scopeOf(tokenHash)).resolves.toBeDefined();

    await withTransaction(scratch.db, (uow) =>
      tokens.revoke(uow, {
        tokenId: issued.tokenId,
        principalId,
        actor: `user:${principalId}`,
        authorizationContext: 'copalibre.participant',
      }),
    );

    // After revocation, it authorizes nothing
    await expect(tokens.scopeOf(tokenHash)).resolves.toBeUndefined();
    
    // But it still appears in the list (as revoked)
    const listed = await tokens.listByPrincipal(principalId);
    const found = listed.find((t) => t.tokenId === issued.tokenId);
    expect(found?.revoked).toBe(true);
  });

  it('rejects revoking a token that belongs to a different principal', async () => {
    const tokens = new PersonalAccessTokenRepository(scratch.db);
    
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.create(uow, {
        principalId,
        label: 'Safe Token',
        scopes: [],
        expiresAt: new Date(Date.now() + 86400000),
        actor: `user:${principalId}`,
        authorizationContext: '',
      }),
    );

    const otherPrincipal = await withTransaction(scratch.db, (uow) =>
      new IdentityPrincipalRepository(scratch.db).create(uow, {
        email: 'hacker@example.com',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        tokens.revoke(uow, {
          tokenId: issued.tokenId,
          principalId: otherPrincipal.principalId,
          actor: `user:${otherPrincipal.principalId}`,
          authorizationContext: '',
        }),
      ),
    ).rejects.toThrow('PAT was not found');
  });

  it('updates the last-used heartbeat without gating authorization', async () => {
    const tokens = new PersonalAccessTokenRepository(scratch.db);
    
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.create(uow, {
        principalId,
        label: 'Heartbeat Check',
        scopes: [],
        expiresAt: new Date(Date.now() + 86400000),
        actor: `user:${principalId}`,
        authorizationContext: '',
      }),
    );

    expect(issued.lastUsedAt).toBeUndefined();

    await tokens.touchLastUsed(issued.tokenId);

    const listed = await tokens.listByPrincipal(principalId);
    const found = listed.find((t) => t.tokenId === issued.tokenId);
    expect(found?.lastUsedAt).toEqual(expect.any(String));
  });

  it('records creation and revocation in the audit trail', async () => {
    const tokens = new PersonalAccessTokenRepository(scratch.db);
    
    const issued = await withTransaction(scratch.db, (uow) =>
      tokens.create(uow, {
        principalId,
        label: 'Audit Test',
        scopes: [],
        expiresAt: new Date(Date.now() + 86400000),
        actor: `user:${principalId}`,
        authorizationContext: '',
      }),
    );

    await withTransaction(scratch.db, (uow) =>
      tokens.revoke(uow, {
        tokenId: issued.tokenId,
        principalId,
        actor: `user:${principalId}`,
        authorizationContext: '',
      }),
    );

    const audit = await new AuditReader(scratch.db).historyFor('pat', issued.tokenId);
    expect(audit.map((entry) => entry.action)).toEqual(['pat.created', 'pat.revoked']);
  });
});
