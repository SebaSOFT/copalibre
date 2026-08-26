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

    const tokenHash = hashToken(issued.rawToken);

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

    const tokenHash = hashToken(issued.rawToken);
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
    ).rejects.toThrow('Personal access token was not found');
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

    await tokens.touchLastUsed(issued.tokenId);

    const listedAgain = await tokens.listByPrincipal(principalId);
    const foundAgain = listedAgain.find((t) => t.tokenId === issued.tokenId);
    expect(foundAgain?.lastUsedAt).toEqual(found?.lastUsedAt);
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

    const audit = await new AuditReader(scratch.db).historyFor(
      'personal-access-token',
      issued.tokenId,
    );
    expect(audit.map((entry) => entry.action)).toEqual(['pat.created', 'pat.revoked']);
  });

  it('revokes only active PATs, records each audit entry, and is idempotent', async () => {
    const tokens = new PersonalAccessTokenRepository(scratch.db);
    const create = (label: string, expiresAt: Date) =>
      withTransaction(scratch.db, (uow) =>
        tokens.create(uow, {
          principalId,
          label,
          scopes: [],
          expiresAt,
          actor: `user:${principalId}`,
          authorizationContext: 'test',
        }),
      );
    const [first, second, expired] = await Promise.all([
      create('Cutover Active One', new Date(Date.now() + 86400000)),
      create('Cutover Active Two', new Date(Date.now() + 86400000)),
      create('Cutover Expired', new Date(Date.now() - 86400000)),
    ]);

    const before = await tokens.countActive();
    const cutover = await withTransaction(scratch.db, (uow) =>
      tokens.revokeAllActive(uow, {
        actor: 'operator-cli',
        authorizationContext: 'operator-cli:revoke-legacy-personal-access-tokens',
      }),
    );
    expect(cutover.revoked).toBe(before);
    await expect(tokens.countActive()).resolves.toBe(0);
    await expect(tokens.scopeOf(hashToken(first.rawToken))).resolves.toBeUndefined();
    await expect(tokens.scopeOf(hashToken(second.rawToken))).resolves.toBeUndefined();
    expect(
      (await tokens.listByPrincipal(principalId)).find((token) => token.tokenId === expired.tokenId)
        ?.revoked,
    ).toBe(false);

    const audit = new AuditReader(scratch.db);
    await expect(audit.historyFor('personal-access-token', first.tokenId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'pat.revoked' })]),
    );
    await expect(audit.historyFor('personal-access-token', second.tokenId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'pat.revoked' })]),
    );
    await expect(
      withTransaction(scratch.db, (uow) =>
        tokens.revokeAllActive(uow, {
          actor: 'operator-cli',
          authorizationContext: 'operator-cli:revoke-legacy-personal-access-tokens',
        }),
      ),
    ).resolves.toEqual({ revoked: 0 });
  });
});
