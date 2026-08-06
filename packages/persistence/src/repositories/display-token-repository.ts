import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import { NotFoundError } from '../errors.js';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

/**
 * Device-scoped, revocable authorization for `/tv/**` surfaces (0031) — never
 * a person's JWT. Verification and revocation both key on the token's hash;
 * the raw token exists only transiently in the issuing controller's response.
 */
export interface DisplayToken {
  readonly displayTokenId: string;
  readonly organizationId: string;
  readonly tournamentId: string;
  readonly matchId?: string;
  readonly label?: string;
  readonly revoked: boolean;
  readonly lastSeenAt?: string;
  readonly createdAt: string;
}

export interface IssueDisplayTokenInput {
  readonly organizationId: string;
  readonly tournamentId: string;
  readonly matchId?: string;
  readonly tokenHash: string;
  readonly label?: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

export interface RevokeDisplayTokenInput {
  readonly displayTokenId: string;
  readonly organizationId: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

/** What the `/tv/**` route and its SSE guard need to know a token authorizes. */
export interface DisplayTokenScope {
  readonly displayTokenId: string;
  readonly organizationId: string;
  readonly tournamentId: string;
  readonly matchId?: string;
}

export class DisplayTokenRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async issue(uow: UnitOfWork, input: IssueDisplayTokenInput): Promise<DisplayToken> {
    const displayTokenId = newId();
    const row = await uow.tx
      .insertInto('display_tokens')
      .values({
        display_token_id: displayTokenId,
        organization_id: input.organizationId,
        tournament_id: input.tournamentId,
        match_id: input.matchId ?? null,
        token_hash: input.tokenHash,
        label: input.label ?? null,
        revoked_at: null,
        last_seen_at: null,
        created_at: new Date(),
        created_by: input.actor,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const token = toDisplayToken(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'display-token',
      entityId: displayTokenId,
      action: 'display-token.issued',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...token },
    });
    return token;
  }

  /**
   * Flips one device's token, only — every other device's token and every
   * person's JWT are untouched by construction, since this writes exactly one
   * row keyed by its own id.
   */
  async revoke(uow: UnitOfWork, input: RevokeDisplayTokenInput): Promise<DisplayToken> {
    const existing = await uow.tx
      .selectFrom('display_tokens')
      .selectAll()
      .where('display_token_id', '=', input.displayTokenId)
      .where('organization_id', '=', input.organizationId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('Display token was not found');

    const row = await uow.tx
      .updateTable('display_tokens')
      .set({ revoked_at: new Date() })
      .where('display_token_id', '=', input.displayTokenId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const token = toDisplayToken(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'display-token',
      entityId: input.displayTokenId,
      action: 'display-token.revoked',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { revoked: existing.revoked_at !== null },
      resultingState: { revoked: true },
    });
    return token;
  }

  /**
   * The auth check itself: an unrevoked token's route scope, or nothing. Reads
   * only — `touchLastSeen` records the heartbeat separately so an
   * authorization decision never waits on a write.
   */
  async scopeOf(tokenHash: string): Promise<DisplayTokenScope | undefined> {
    const row = await this.db
      .selectFrom('display_tokens')
      .select(['display_token_id', 'organization_id', 'tournament_id', 'match_id'])
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      displayTokenId: row.display_token_id,
      organizationId: row.organization_id,
      tournamentId: row.tournament_id,
      ...(row.match_id === null ? {} : { matchId: row.match_id }),
    };
  }

  /** Fire-and-forget device-health heartbeat; never gates authorization. */
  async touchLastSeen(displayTokenId: string): Promise<void> {
    await this.db
      .updateTable('display_tokens')
      .set({ last_seen_at: new Date() })
      .where('display_token_id', '=', displayTokenId)
      .execute();
  }

  async listByOrganization(organizationId: string): Promise<readonly DisplayToken[]> {
    const rows = await this.db
      .selectFrom('display_tokens')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDisplayToken);
  }
}

function toDisplayToken(row: {
  display_token_id: string;
  organization_id: string;
  tournament_id: string;
  match_id: string | null;
  label: string | null;
  revoked_at: Date | string | null;
  last_seen_at: Date | string | null;
  created_at: Date | string;
}): DisplayToken {
  return {
    displayTokenId: row.display_token_id,
    organizationId: row.organization_id,
    tournamentId: row.tournament_id,
    ...(row.match_id === null ? {} : { matchId: row.match_id }),
    ...(row.label === null ? {} : { label: row.label }),
    revoked: row.revoked_at !== null,
    ...(row.last_seen_at === null ? {} : { lastSeenAt: toIsoString(row.last_seen_at) }),
    createdAt: toIsoString(row.created_at),
  };
}
