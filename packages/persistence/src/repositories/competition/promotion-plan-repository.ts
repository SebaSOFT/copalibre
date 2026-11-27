import type { Kysely } from 'kysely';
import { NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { lockRowsForMutation } from '../../row-lock.js';

function promotionPlanOf(row: {
  readonly promotion_plan_id: string;
  readonly zone_id: string;
  readonly next_stage_id: string;
  readonly plan: unknown;
  readonly confirmed_resolution: unknown;
}): {
  readonly promotionPlanId: string;
  readonly zoneId: string;
  readonly nextStageId: string;
  readonly plan: Record<string, unknown>;
  readonly confirmedResolution?: Readonly<Record<string, string>>;
} {
  const confirmedResolution = storedResolutionOf(row.confirmed_resolution);
  return {
    promotionPlanId: row.promotion_plan_id,
    zoneId: row.zone_id,
    nextStageId: row.next_stage_id,
    plan: row.plan as Record<string, unknown>,
    ...(confirmedResolution === undefined ? {} : { confirmedResolution }),
  };
}

function storedResolutionOf(value: unknown): Readonly<Record<string, string>> | undefined {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (parsed === null || typeof parsed !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/** Promotion plans: a zone's plan to advance entrants into the next stage. */
export class PromotionPlanRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createPromotionPlan(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly nextStageId: string;
      readonly plan: Record<string, unknown>;
    } & AuditContext,
  ): Promise<{
    readonly promotionPlanId: string;
    readonly zoneId: string;
    readonly nextStageId: string;
    readonly plan: Record<string, unknown>;
  }> {
    const row = await uow.tx
      .insertInto('promotion_plans')
      .values({
        promotion_plan_id: newId(),
        zone_id: input.zoneId,
        next_stage_id: input.nextStageId,
        plan: JSON.stringify(input.plan),
        created_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict.column('zone_id').doUpdateSet({
          next_stage_id: input.nextStageId,
          plan: JSON.stringify(input.plan),
          // A confirmation answers the plan it was made under; a changed plan needs a new one.
          confirmed_resolution: null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: input.zoneId,
      action: 'promotion-plan.saved',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { nextStageId: input.nextStageId, plan: input.plan },
    });
    return {
      promotionPlanId: row.promotion_plan_id,
      zoneId: row.zone_id,
      nextStageId: row.next_stage_id,
      plan: row.plan as Record<string, unknown>,
    };
  }

  async findPromotionPlan(zoneId: string): Promise<
    | {
        readonly promotionPlanId: string;
        readonly zoneId: string;
        readonly nextStageId: string;
        readonly plan: Record<string, unknown>;
        readonly confirmedResolution?: Readonly<Record<string, string>>;
      }
    | undefined
  > {
    const row = await this.db
      .selectFrom('promotion_plans')
      .innerJoin('zones', 'zones.zone_id', 'promotion_plans.zone_id')
      .selectAll('promotion_plans')
      .where('promotion_plans.zone_id', '=', zoneId)
      .where('zones.deleted_at', 'is', null)
      .executeTakeFirst();
    return row === undefined ? undefined : promotionPlanOf(row);
  }

  /** Every stored promotion plan whose `nextStageId` targets the given stage. */
  async findPromotionPlansTargetingStage(nextStageId: string): Promise<
    readonly {
      readonly promotionPlanId: string;
      readonly zoneId: string;
      readonly nextStageId: string;
      readonly plan: Record<string, unknown>;
      readonly confirmedResolution?: Readonly<Record<string, string>>;
    }[]
  > {
    const rows = await this.db
      .selectFrom('promotion_plans')
      .selectAll()
      .where('next_stage_id', '=', nextStageId)
      .execute();
    return rows.map(promotionPlanOf);
  }

  /**
   * Stores the qualifier position → entrant map an organizer confirmed for a plan, audited. The
   * caller resolves the target zones in the same transaction; this only records the fact.
   */
  async confirmPromotionPlan(
    uow: UnitOfWork,
    input: {
      readonly promotionPlanId: string;
      readonly resolution: Readonly<Record<string, string>>;
    } & AuditContext,
  ): Promise<void> {
    const previous = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('promotion_plans')
        .select(['promotion_plan_id', 'zone_id', 'confirmed_resolution'])
        .where('promotion_plan_id', '=', input.promotionPlanId),
    ).executeTakeFirst();
    if (!previous) {
      throw new NotFoundError(`Promotion plan ${input.promotionPlanId} not found`, {
        promotionPlanId: input.promotionPlanId,
      });
    }
    await uow.tx
      .updateTable('promotion_plans')
      .set({ confirmed_resolution: JSON.stringify(input.resolution) })
      .where('promotion_plan_id', '=', input.promotionPlanId)
      .execute();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: previous.zone_id,
      action: 'promotion-plan.confirmed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: {
        confirmedResolution: storedResolutionOf(previous.confirmed_resolution) ?? null,
      },
      resultingState: { confirmedResolution: input.resolution },
    });
  }
}
