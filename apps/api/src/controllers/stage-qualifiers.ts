import { IMPLICIT_ZONE_NAME, effectiveFormat, type TournamentFormat } from '@copalibre/domain';
import {
  QualificationError,
  qualifierLabels,
  qualifierPositionsByZone,
  type PromotionPlan,
  type QualifierLabel,
} from '@copalibre/tournament-engine';
import { CompetitionRepository, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { QualifierLabelDto } from '../dto/fixture-side-source.dto.js';
import { promotionPlanFromStored } from './promotion-plans.js';

/** One stored plan that routes qualifiers into a stage, with each position labelled. */
export interface StageQualifierPlan {
  readonly promotionPlanId: string;
  readonly sourceZone: {
    readonly zoneId: string;
    readonly stageId: string;
    readonly number: number;
  };
  readonly saved: { readonly nextStageId: string; readonly plan: Record<string, unknown> };
  readonly plan: PromotionPlan;
  /** Index `k - 1` labels position `k`. */
  readonly labels: readonly QualifierLabelDto[];
  /** Destination zone id (`undefined` for an un-zoned stage) → positions in seed order. */
  readonly positionsByZone: ReadonlyMap<string | undefined, readonly number[]>;
  readonly confirmedResolution?: Readonly<Record<string, string>>;
}

/** One destination zone of a stage generated ahead: its format and qualifier seeds in order. */
export interface StageQualifierZone {
  readonly zoneId?: string;
  readonly zoneName?: string;
  readonly format: TournamentFormat;
  readonly seeds: readonly {
    readonly promotionPlanId: string;
    readonly position: number;
    readonly qualifierLabel: QualifierLabelDto;
  }[];
}

/** A plan routes qualifiers somewhere the stage cannot place them. */
export class QualifierRoutingError extends Error {}

/**
 * Every stored plan targeting the stage, in source stage then source zone order. Routing is read
 * from the plan's declaration only, so it is known before any standing exists.
 */
export async function stageQualifierPlans(
  db: Kysely<Database>,
  stageId: string,
): Promise<readonly StageQualifierPlan[]> {
  const competition = new CompetitionRepository(db);
  const saved = await competition.findPromotionPlansTargetingStage(stageId);
  if (saved.length === 0) return [];
  const targetZones = await competition.listZonesOfStage(stageId);
  const stageNumbers = new Map<string, number>();
  const plans = await Promise.all(
    saved.map(async (row) => {
      const zone = await competition.findZoneById(row.zoneId);
      if (!zone) throw new QualifierRoutingError(`Promotion plan source zone is missing`);
      if (!stageNumbers.has(zone.stageId)) {
        const stage = await db
          .selectFrom('stages')
          .select('number')
          .where('stage_id', '=', zone.stageId)
          .executeTakeFirstOrThrow();
        stageNumbers.set(zone.stageId, stage.number);
      }
      const plan = promotionPlanFromStored(zone.zoneId, row.nextStageId, row.plan);
      const groups = await competition.listGroupsOfZone(zone.zoneId);
      const names = new Map(groups.map((group) => [group.groupId, group.name]));
      const routed = qualifierPositionsByZone(plan, groups);
      const positionsByZone = new Map<string | undefined, readonly number[]>();
      for (const [zoneRef, positions] of routed) {
        positionsByZone.set(destinationOf(zoneRef, targetZones), positions);
      }
      return {
        promotionPlanId: row.promotionPlanId,
        sourceZone: { zoneId: zone.zoneId, stageId: zone.stageId, number: zone.number },
        saved: row,
        plan,
        labels: qualifierLabels(plan, groups).map((label) => labelDto(label, names)),
        positionsByZone,
        ...(row.confirmedResolution === undefined
          ? {}
          : { confirmedResolution: row.confirmedResolution }),
      };
    }),
  );
  const order = (plan: StageQualifierPlan) => [
    stageNumbers.get(plan.sourceZone.stageId) ?? 0,
    plan.sourceZone.number,
  ];
  return plans.sort((left, right) => {
    const [ls, lz] = order(left) as [number, number];
    const [rs, rz] = order(right) as [number, number];
    return ls - rs || lz - rz;
  });
}

/** The stage's destination zones with the qualifier seeds every plan routes to each. */
export async function stageQualifierZones(
  db: Kysely<Database>,
  stage: { readonly stageId: string; readonly format: string },
  plans: readonly StageQualifierPlan[],
): Promise<readonly StageQualifierZone[]> {
  const zones = await new CompetitionRepository(db).listZonesOfStage(stage.stageId);
  const destinations: readonly { zoneId?: string; zoneName?: string; format: TournamentFormat }[] =
    zones.length === 0
      ? [{ format: stage.format as TournamentFormat }]
      : zones.map((zone) => ({
          zoneId: zone.zoneId,
          zoneName: zone.name,
          format: effectiveFormat(zone, { format: stage.format as TournamentFormat }),
        }));
  return destinations.flatMap((destination) => {
    const seeds = plans.flatMap((plan) =>
      (plan.positionsByZone.get(destination.zoneId) ?? []).map((position) => ({
        promotionPlanId: plan.promotionPlanId,
        position,
        qualifierLabel: plan.labels[position - 1] ?? { kind: 'number' as const, number: position },
      })),
    );
    return seeds.length === 0 ? [] : [{ ...destination, seeds }];
  });
}

/** Labels of the named plans, for reads that only hold a qualifier source's plan and position. */
export async function qualifierLabelsOf(
  db: Kysely<Database>,
  promotionPlanIds: readonly string[],
): Promise<ReadonlyMap<string, readonly QualifierLabelDto[]>> {
  if (promotionPlanIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('promotion_plans')
    .select(['promotion_plan_id', 'zone_id', 'next_stage_id', 'plan'])
    .where('promotion_plan_id', 'in', [...new Set(promotionPlanIds)])
    .execute();
  const competition = new CompetitionRepository(db);
  const entries = await Promise.all(
    rows.map(async (row) => {
      try {
        const plan = promotionPlanFromStored(
          row.zone_id,
          row.next_stage_id,
          row.plan as Record<string, unknown>,
        );
        const groups = await competition.listGroupsOfZone(row.zone_id);
        const names = new Map(groups.map((group) => [group.groupId, group.name]));
        const labels = qualifierLabels(plan, groups).map((label) => labelDto(label, names));
        return [[row.promotion_plan_id, labels] as const];
      } catch (error) {
        // A plan edited into an inconsistent shape still has its positions; they read as numbers.
        if (error instanceof QualificationError) return [];
        throw error;
      }
    }),
  );
  return new Map(entries.flat());
}

function destinationOf(
  zoneRef: string | undefined,
  zones: readonly { readonly zoneId: string; readonly name: string }[],
): string | undefined {
  if (zoneRef === undefined) {
    if (zones.length === 0) return undefined;
    if (zones.length === 1) return zones[0]?.zoneId;
    throw new QualifierRoutingError(
      'The promotion plan declares no bands, so it cannot route to a stage with several zones',
    );
  }
  if (zones.length === 0 && zoneRef === IMPLICIT_ZONE_NAME) return undefined;
  const zone = zones.find((candidate) => candidate.name === zoneRef);
  if (!zone) throw new QualifierRoutingError(`Promotion band names no zone "${zoneRef}"`);
  return zone.zoneId;
}

function labelDto(
  label: QualifierLabel,
  groupNames: ReadonlyMap<string, string>,
): QualifierLabelDto {
  if (label.kind === 'group-rank') {
    const groupName = groupNames.get(label.groupId);
    return {
      kind: 'group-rank',
      rank: label.rank,
      groupNumber: label.groupNumber,
      ...(groupName === undefined ? {} : { groupName }),
    };
  }
  if (label.kind === 'cohort') return { kind: 'cohort', rank: label.rank, order: label.order };
  return { kind: 'number', number: label.number };
}

/**
 * Whether the stage's fixtures were generated ahead from the plan, and whether any of them has
 * progressed. Sources are JSON on both dialects, so they are read and matched here.
 */
export async function generatedAheadFrom(
  db: Kysely<Database>,
  stageId: string,
  promotionPlanId: string,
): Promise<{ readonly generated: boolean; readonly progressed: boolean }> {
  const fixtures = await db
    .selectFrom('fixtures')
    .select(['fixture_id', 'home_source', 'away_source'])
    .where('stage_id', '=', stageId)
    .execute();
  const generated = fixtures.some((fixture) =>
    [fixture.home_source, fixture.away_source].some((stored) => {
      const source: unknown = typeof stored === 'string' ? JSON.parse(stored) : stored;
      return (
        typeof source === 'object' &&
        source !== null &&
        (source as { kind?: unknown }).kind === 'qualifier' &&
        (source as { promotionPlanId?: unknown }).promotionPlanId === promotionPlanId
      );
    }),
  );
  if (!generated) return { generated, progressed: false };
  const progressed = await db
    .selectFrom('matches')
    .select('match_id')
    .where(
      'fixture_id',
      'in',
      fixtures.map((fixture) => fixture.fixture_id),
    )
    .where((eb) => eb.or([eb('status', '!=', 'scheduled'), eb('result', 'is not', null)]))
    .executeTakeFirst();
  return { generated, progressed: progressed !== undefined };
}
