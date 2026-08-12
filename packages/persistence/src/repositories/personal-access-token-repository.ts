import { createHash, randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import { NotFoundError } from '../errors.js';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

/**
 * Long-lived, revocable API/MCP credentials bound to exactly one principal.
 * The raw token exists only transiently in the issuing response; the database
 * stores only its SHA-256 hash, identical to the display-token pattern (0031).
 */

export interface PersonalAccessToken {
  readonly tokenId: string;
  readonly principalId: string;
  readonly label: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
  readonly revoked: boolean;
  readonly lastUsedAt?: string;
  readonly createdAt: string;
}

export interface CreatePatInput {
  readonly principalId: string;
  readonly label: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date;
  readonly actor: string;
  readonly authorizationContext: string;
}

export interface RevokePatInput {
  readonly tokenId: string;
  readonly principalId: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

/** What the API auth guard needs to know a PAT authorizes. */
export interface PatScope {
  readonly tokenId: string;
  readonly principalId: string;
  readonly scopes: readonly string[];
}

/** SHA-256 hex digest — the same hash function display tokens use. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateTokenString(): string {
  return 'clpat_' + randomBytes(32).toString('base64url');
}

export class PersonalAccessTokenRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(uow: UnitOfWork, input: CreatePatInput): Promise<PersonalAccessToken & { rawToken: string }> {
    const tokenId = newId();
    const rawToken = generateTokenString();
    const tokenHash = hashToken(rawToken);
    const now = new Date();

    const row = await uow.tx
      .insertInto('personal_access_tokens')
      .values({
        token_id: tokenId,
        principal_id: input.principalId,
        token_hash: tokenHash,
        label: input.label,
        scopes: JSON.stringify(input.scopes),
        expires_at: input.expiresAt,
        revoked_at: null,
        last_used_at: null,
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const pat = toPat(row);
    await uow.recordAudit({
      organizationId: 'system',
      entityType: 'personal-access-token',
      entityId: tokenId,
      action: 'pat.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { tokenId, label: input.label, expiresAt: pat.expiresAt },
    });

    return { ...pat, rawToken };
  }

  async revoke(uow: UnitOfWork, input: RevokePatInput): Promise<PersonalAccessToken> {
    const existing = await uow.tx
      .selectFrom('personal_access_tokens')
      .selectAll()
      .where('token_id', '=', input.tokenId)
      .where('principal_id', '=', input.principalId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('Personal access token was not found');

    const row = await uow.tx
      .updateTable('personal_access_tokens')
      .set({ revoked_at: new Date() })
      .where('token_id', '=', input.tokenId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const pat = toPat(row);
    await uow.recordAudit({
      organizationId: 'system',
      entityType: 'personal-access-token',
      entityId: input.tokenId,
      action: 'pat.revoked',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { revoked: existing.revoked_at !== null },
      resultingState: { revoked: true },
    });
    return pat;
  }

  /**
   * Auth check: an unexpired, unrevoked token's scope, or nothing. Read-only —
   * `touchLastUsed` records usage separately so authorization never waits on a write.
   */
  async scopeOf(tokenHash: string): Promise<PatScope | undefined> {
    const row = await this.db
      .selectFrom('personal_access_tokens')
      .select(['token_id', 'principal_id', 'scopes'])
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      tokenId: row.token_id,
      principalId: row.principal_id,
      scopes: row.scopes as unknown as readonly string[],
    };
  }

  /** Fire-and-forget usage heartbeat; never gates authorization. */
  async touchLastUsed(tokenId: string): Promise<void> {
    await this.db
      .updateTable('personal_access_tokens')
      .set({ last_used_at: new Date() })
      .where('token_id', '=', tokenId)
      .execute();
  }

  async listByPrincipal(principalId: string): Promise<readonly PersonalAccessToken[]> {
    const rows = await this.db
      .selectFrom('personal_access_tokens')
      .selectAll()
      .where('principal_id', '=', principalId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toPat);
  }
}

function toPat(row: {
  token_id: string;
  principal_id: string;
  label: string;
  scopes: unknown;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  last_used_at: Date | string | null;
  created_at: Date | string;
}): PersonalAccessToken {
  return {
    tokenId: row.token_id,
    principalId: row.principal_id,
    label: row.label,
    scopes: row.scopes as unknown as readonly string[],
    expiresAt: toIsoString(row.expires_at),
    revoked: row.revoked_at !== null,
    ...(row.last_used_at === null ? {} : { lastUsedAt: toIsoString(row.last_used_at) }),
    createdAt: toIsoString(row.created_at),
  };
}
