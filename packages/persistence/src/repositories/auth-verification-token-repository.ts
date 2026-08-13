import { createHash, randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import { NotFoundError } from '../errors.js';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

/**
 * Single-use, expiring verification tokens for password resets and email
 * changes. The raw token exists only in the email link; the database stores
 * only its SHA-256 hash.
 */

export type VerificationKind = 'password-reset' | 'email-change';

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
   * Consumes a verification token: validates it is unexpired and unconsumed,
   * marks it consumed, and returns it. Throws if the token is invalid.
   */
  async consume(uow: UnitOfWork, rawToken: string): Promise<AuthVerificationToken> {
    const tokenHash = hashToken(rawToken);
    const row = await uow.tx
      .selectFrom('auth_verification_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    if (!row) throw new NotFoundError('Verification token is invalid or expired');

    const updated = await uow.tx
      .updateTable('auth_verification_tokens')
      .set({ consumed_at: new Date() })
      .where('verification_id', '=', row.verification_id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return toVerificationToken(updated);
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
