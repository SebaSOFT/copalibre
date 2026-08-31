import type { Kysely } from 'kysely';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

export interface DeclaredEffectRecord {
  readonly identityKey: string;
  readonly organizationId: string;
  readonly matchId: string;
  readonly causeEventId: string;
  readonly hook: string;
  readonly scriptId: string;
  readonly scriptVersion: number;
  readonly ruleId: string;
  readonly actionId: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export type RecordDeclaredEffectInput = Omit<DeclaredEffectRecord, 'createdAt'>;

/** Durable idempotency boundary for effects declared by hook scripts. */
export class DeclaredEffectRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async recordOnce(uow: UnitOfWork, input: RecordDeclaredEffectInput): Promise<boolean> {
    const inserted = await uow.tx
      .insertInto('declared_effects')
      .values({
        identity_key: input.identityKey,
        organization_id: input.organizationId,
        match_id: input.matchId,
        cause_event_id: input.causeEventId,
        hook: input.hook,
        script_id: input.scriptId,
        script_version: input.scriptVersion,
        rule_id: input.ruleId,
        action_id: input.actionId,
        kind: input.kind,
        payload: JSON.stringify(input.payload),
        created_at: new Date(),
      })
      .onConflict((conflict) => conflict.column('identity_key').doNothing())
      .returning('identity_key')
      .executeTakeFirst();
    return inserted !== undefined;
  }

  async forCause(matchId: string, causeEventId: string): Promise<readonly DeclaredEffectRecord[]> {
    const rows = await this.db
      .selectFrom('declared_effects')
      .selectAll()
      .where('match_id', '=', matchId)
      .where('cause_event_id', '=', causeEventId)
      .orderBy('identity_key')
      .execute();
    return rows.map((row) => ({
      identityKey: row.identity_key,
      organizationId: row.organization_id,
      matchId: row.match_id,
      causeEventId: row.cause_event_id,
      hook: row.hook,
      scriptId: row.script_id,
      scriptVersion: row.script_version,
      ruleId: row.rule_id,
      actionId: row.action_id,
      kind: row.kind,
      payload: row.payload,
      createdAt: toIsoString(row.created_at),
    }));
  }
}
