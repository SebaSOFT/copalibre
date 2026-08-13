import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

/**
 * The `since-last-consequence` window's durable state (0074): how much of a
 * collector-threshold rule's total each actor has already answered with a
 * firing. Never edited by the collector total itself — only by a firing.
 */
export class CollectorThresholdConsumptionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Every actor's consumed total for one rule within one stage, read once per evaluation. */
  async forRule(ruleId: string, stageId: string): Promise<Readonly<Record<string, number>>> {
    const rows = await this.db
      .selectFrom('collector_threshold_consumption')
      .select(['actor_id', 'consumed_total'])
      .where('rule_id', '=', ruleId)
      .where('stage_id', '=', stageId)
      .execute();
    return Object.fromEntries(rows.map((row) => [row.actor_id, row.consumed_total]));
  }

  /** Records the total at the moment of a firing, replacing any prior value. */
  async record(
    uow: UnitOfWork,
    input: {
      readonly ruleId: string;
      readonly actorId: string;
      readonly stageId: string;
      readonly consumedTotal: number;
    },
  ): Promise<void> {
    await uow.tx
      .insertInto('collector_threshold_consumption')
      .values({
        rule_id: input.ruleId,
        actor_id: input.actorId,
        stage_id: input.stageId,
        consumed_total: input.consumedTotal,
        updated_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict.columns(['rule_id', 'actor_id', 'stage_id']).doUpdateSet({
          consumed_total: input.consumedTotal,
          updated_at: new Date(),
        }),
      )
      .execute();
  }
}
