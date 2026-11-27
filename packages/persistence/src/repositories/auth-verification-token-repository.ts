import { createHash, randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import { NotFoundError } from '../errors.js';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

/**
 * Single-use, expiring verification tokens for password resets, email
 * changes, and native-login session refresh. The raw token exists only in
 * the email link (or, for `session-refresh`, an `HttpOnly` cookie); the
 * database stores only its SHA-256 hash.
 *
 * `session-refresh` reuses this table rather than a bespoke
 * `auth_refresh_tokens` one: `consume()`'s single-use,
 * mark-on-consume semantics already give replay protection — presenting an
 * already-consumed token throws the same `NotFoundError` a stolen-and-reused
 * password-reset token would.
 */

export type VerificationKind = 'password-reset' | 'email-change' | 'session-refresh';

export interface AuthVerificationToken {
  readonly verificationId: string;
  readonly principalId: string;
  readonly kind: VerificationKind;
  readonly newEmail?: string;
  readonly expiresAt: string;
  readonly consumed: boolean;
  readonly createdAt: string;
}

export interface CreateVerificationTokenInput {
  readonly principalId: string;
  readonly kind: VerificationKind;
  readonly newEmail?: string;
  /** Duration in milliseconds from now until expiry. */
  readonly ttlMs: number;
}

/** SHA-256 hex digest. */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export class AuthVerificationTokenRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Resolves an active native refresh credential to its principal without consuming it. */
  async findActiveSessionRefreshPrincipalId(rawToken: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('auth_verification_tokens')
      .select('principal_id')
      .where('token_hash', '=', hashToken(rawToken))
      .where('kind', '=', 'session-refresh')
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    return row?.principal_id;
  }

  /**
   * Creates a verification token and returns both the domain object and the
   * raw cleartext token (for inclusion in the email link). The cleartext is
   * never persisted.
   */
  async create(
    uow: UnitOfWork,
    input: CreateVerificationTokenInput,
  ): Promise<AuthVerificationToken & { rawToken: string }> {
    const verificationId = newId();
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.ttlMs);

    const row = await uow.tx
      .insertInto('auth_verification_tokens')
      .values({
        verification_id: verificationId,
        principal_id: input.principalId,
        kind: input.kind,
        token_hash: tokenHash,
        new_email: input.newEmail ?? null,
        expires_at: expiresAt,
        consumed_at: null,
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return { ...toVerificationToken(row), rawToken };
  }

  /**
   * Consumes a verification token of the given kind: marks it consumed only if
   * it is unexpired, unconsumed and of that kind, and returns it. Throws if
   * the token is invalid, expired, already consumed or of another kind.
   *
   * One conditional `UPDATE … RETURNING`, not a read followed by a write: under
   * PostgreSQL's read-committed isolation two concurrent requests could both
   * read the token as unconsumed and both mark it, so a single-use token would
   * be used twice. The second update now matches no row. The kind is part of
   * the same condition, so a token presented for the wrong purpose is refused
   * without being spent.
   */
  async consume(
    uow: UnitOfWork,
    rawToken: string,
    kind: VerificationKind,
  ): Promise<AuthVerificationToken> {
    const now = new Date();
    const updated = await uow.tx
      .updateTable('auth_verification_tokens')
      .set({ consumed_at: now })
      .where('token_hash', '=', hashToken(rawToken))
      .where('kind', '=', kind)
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', now)
      .returningAll()
      .executeTakeFirst();
    if (!updated) throw new NotFoundError('Verification token is invalid or expired');
    return toVerificationToken(updated);
  }

  /**
   * Revokes every unconsumed refresh credential of a principal, so a password
   * reset ends the native sessions that were open before it. Access JWTs
   * already issued stay valid until they expire: the API is stateless.
   */
  async revokeSessionRefreshTokens(uow: UnitOfWork, principalId: string): Promise<number> {
    const result = await uow.tx
      .updateTable('auth_verification_tokens')
      .set({ consumed_at: new Date() })
      .where('principal_id', '=', principalId)
      .where('kind', '=', 'session-refresh')
      .where('consumed_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }
}

function toVerificationToken(row: {
  verification_id: string;
  principal_id: string;
  kind: string;
  new_email: string | null;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  created_at: Date | string;
}): AuthVerificationToken {
  return {
    verificationId: row.verification_id,
    principalId: row.principal_id,
    kind: row.kind as VerificationKind,
    ...(row.new_email === null ? {} : { newEmail: row.new_email }),
    expiresAt: toIsoString(row.expires_at),
    consumed: row.consumed_at !== null,
    createdAt: toIsoString(row.created_at),
  };
}
