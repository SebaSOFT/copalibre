import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

export interface StoredMatchCommandResponse {
  readonly idempotencyKey: string;
  readonly matchId: string;
  readonly operation: string;
  readonly requestFingerprint: string;
  readonly response: Readonly<Record<string, unknown>>;
}

/**
 * Finalization retries are stateful server work, not a browser convention. This
 * store keeps the key and exact response in the same transaction as the result.
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

  async record(
    uow: UnitOfWork,
    input: StoredMatchCommandResponse,
  ): Promise<StoredMatchCommandResponse> {
    const row = await uow.tx
      .insertInto('match_command_idempotency')
      .values({
        idempotency_key: input.idempotencyKey,
        match_id: input.matchId,
        operation: input.operation,
        request_fingerprint: input.requestFingerprint,
        response: JSON.stringify(input.response),
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
}): StoredMatchCommandResponse {
  return {
    idempotencyKey: row.idempotency_key,
    matchId: row.match_id,
    operation: row.operation,
    requestFingerprint: row.request_fingerprint,
    response: row.response as Readonly<Record<string, unknown>>,
  };
}
