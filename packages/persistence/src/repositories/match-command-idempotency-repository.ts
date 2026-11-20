import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

export interface StoredMatchCommandResponse {
  readonly idempotencyKey: string;
  readonly matchId: string;
  readonly operation: string;
  readonly requestFingerprint: string;
  readonly response: Readonly<Record<string, unknown>>;
  /** True while the key is claimed by a committed command whose response is not yet stored. */
  readonly responsePending: boolean;
}

export interface MatchCommandClaim {
  readonly idempotencyKey: string;
  readonly matchId: string;
  readonly operation: string;
  readonly requestFingerprint: string;
}

/**
 * Keeps each console command's idempotency key. A command claims its key in the same transaction
 * as its writes, so a commit always carries its key and a rollback never does. The response is
 * stored afterwards by `completeResponse`, or in the same transaction by `record` for commands
 * that build their full response before committing.
 */
export class MatchCommandIdempotencyRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async find(idempotencyKey: string): Promise<StoredMatchCommandResponse | undefined> {
    const row = await this.db
      .selectFrom('match_command_idempotency')
      .selectAll()
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirst();
    return row ? toStored(row) : undefined;
  }

  /** Claims a key inside the caller's transaction, before its response exists. */
  async claim(uow: UnitOfWork, input: MatchCommandClaim): Promise<void> {
    await uow.tx
      .insertInto('match_command_idempotency')
      .values({
        idempotency_key: input.idempotencyKey,
        match_id: input.matchId,
        operation: input.operation,
        request_fingerprint: input.requestFingerprint,
        response: JSON.stringify({}),
        response_pending: true,
        created_at: new Date(),
      })
      .execute();
  }

  /**
   * Stores the response on a claimed key. Only a pending key changes, so the first writer
   * wins and a later call is a no-op.
   */
  async completeResponse(
    idempotencyKey: string,
    response: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.db
      .updateTable('match_command_idempotency')
      .set({ response: JSON.stringify(response), response_pending: false })
      .where('idempotency_key', '=', idempotencyKey)
      .where('response_pending', '=', true)
      .execute();
  }

  /** Stores a completed record in the caller's transaction. */
  async record(
    uow: UnitOfWork,
    input: Omit<StoredMatchCommandResponse, 'responsePending'>,
  ): Promise<StoredMatchCommandResponse> {
    const row = await uow.tx
      .insertInto('match_command_idempotency')
      .values({
        idempotency_key: input.idempotencyKey,
        match_id: input.matchId,
        operation: input.operation,
        request_fingerprint: input.requestFingerprint,
        response: JSON.stringify(input.response),
        response_pending: false,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toStored(row);
  }
}

function toStored(row: {
  readonly idempotency_key: string;
  readonly match_id: string;
  readonly operation: string;
  readonly request_fingerprint: string;
  readonly response: unknown;
  readonly response_pending: boolean;
}): StoredMatchCommandResponse {
  return {
    idempotencyKey: row.idempotency_key,
    matchId: row.match_id,
    operation: row.operation,
    requestFingerprint: row.request_fingerprint,
    response: row.response as Readonly<Record<string, unknown>>,
    responsePending: row.response_pending,
  };
}
