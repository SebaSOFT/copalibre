import { createHash } from 'node:crypto';
import { AuthVerificationTokenRepository, withTransaction } from '../index.js';
import { NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import type { VerificationKind } from './auth-verification-token-repository.js';

describe('AuthVerificationTokenRepository', () => {
  let scratch: ScratchDatabase;
  let tokens: AuthVerificationTokenRepository;
  let principalId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('auth_verification_tokens');
    tokens = new AuthVerificationTokenRepository(scratch.db);
    principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: `token-${principalId}@example.test`,
        password_hash: 'not-a-real-hash',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  function issue(kind: VerificationKind, ttlMs = 60_000) {
    return withTransaction(scratch.db, (uow) => tokens.create(uow, { principalId, kind, ttlMs }));
  }

  function consume(rawToken: string, kind: VerificationKind) {
    return withTransaction(scratch.db, (uow) => tokens.consume(uow, rawToken, kind));
  }

  it('stores only a hash of the raw token', async () => {
    const { rawToken, verificationId } = await issue('password-reset');
    const row = await scratch.db
      .selectFrom('auth_verification_tokens')
      .selectAll()
      .where('verification_id', '=', verificationId)
      .executeTakeFirstOrThrow();
    expect(row.token_hash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(rawToken);
  });

  it('consumes a token once and refuses the replay', async () => {
    const { rawToken } = await issue('password-reset');
    await expect(consume(rawToken, 'password-reset')).resolves.toMatchObject({
      principalId,
      kind: 'password-reset',
      consumed: true,
    });
    await expect(consume(rawToken, 'password-reset')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a token of another kind without spending it', async () => {
    const { rawToken } = await issue('password-reset');
    await expect(consume(rawToken, 'session-refresh')).rejects.toBeInstanceOf(NotFoundError);
    await expect(consume(rawToken, 'password-reset')).resolves.toMatchObject({
      kind: 'password-reset',
    });
  });

  it('refuses an expired token', async () => {
    const { rawToken } = await issue('password-reset', -1_000);
    await expect(consume(rawToken, 'password-reset')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets exactly one of several concurrent consumers win', async () => {
    const { rawToken } = await issue('session-refresh');
    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, () => consume(rawToken, 'session-refresh')),
    );
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });

  // The interleaving that a read-then-write consume loses: the first
  // transaction has consumed the token but not committed when the second one
  // tries. Under read committed the second must wait and then find nothing.
  it('refuses a consume that overlaps an uncommitted one', async () => {
    if (scratch.dialect !== 'postgres') return;
    const { rawToken } = await issue('session-refresh');

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstConsumed!: () => void;
    const consumedInFirst = new Promise<void>((resolve) => {
      firstConsumed = resolve;
    });

    const first = withTransaction(scratch.db, async (uow) => {
      const token = await tokens.consume(uow, rawToken, 'session-refresh');
      firstConsumed();
      await held;
      return token;
    });
    await consumedInFirst;
    const second = consume(rawToken, 'session-refresh');
    // Give the second transaction time to reach the row before the first commits.
    await new Promise((resolve) => setTimeout(resolve, 250));
    release();

    await expect(first).resolves.toMatchObject({ kind: 'session-refresh' });
    await expect(second).rejects.toBeInstanceOf(NotFoundError);
  });

  it('revokes every open refresh credential of a principal and nothing else', async () => {
    const first = await issue('session-refresh');
    const second = await issue('session-refresh');
    const reset = await issue('password-reset');

    const revoked = await withTransaction(scratch.db, (uow) =>
      tokens.revokeSessionRefreshTokens(uow, principalId),
    );
    expect(revoked).toBeGreaterThanOrEqual(2);

    await expect(consume(first.rawToken, 'session-refresh')).rejects.toBeInstanceOf(NotFoundError);
    await expect(consume(second.rawToken, 'session-refresh')).rejects.toBeInstanceOf(NotFoundError);
    await expect(consume(reset.rawToken, 'password-reset')).resolves.toMatchObject({
      kind: 'password-reset',
    });
  });
});
