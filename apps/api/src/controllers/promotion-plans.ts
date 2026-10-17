import { IMPLICIT_ZONE_NAME } from '@copalibre/domain';
import {
  computeAccounting,
  evaluateGroupPromotion,
  validatePromotionPlan,
  type GroupPromotionOutcome,
  type PromotionPlan,
} from '@copalibre/tournament-engine';
import {
  CompetitionRepository,
  StageReadModel,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import { standingsPipeline } from '../standings/pipeline.js';
import { readStageSeries } from './stage-series.js';

/**
 * Evaluates a stored promotion plan against its source groups' current standings. Writes nothing;
 * a contested cut or cohort surfaces as the engine's `QualificationError`.
 */
export async function evaluateStoredPromotion(
  db: Kysely<Database>,
  input: {
    readonly tournamentId: string;
    readonly tournament: { readonly disciplineRef: { descriptorId: string; version: string } };
    /** The zone's own stage. */
    readonly sourceStageId: string;
    readonly zone: { readonly zoneId: string; readonly number: number };
    readonly saved: { readonly nextStageId: string; readonly plan: Record<string, unknown> };
  },
): Promise<GroupPromotionOutcome> {
  const { tournamentId, tournament, sourceStageId, zone, saved } = input;
  const competition = new CompetitionRepository(db);
  const plan = promotionPlanFromStored(zone.zoneId, saved.nextStageId, saved.plan);
  const groups = await competition.listGroupsOfZone(zone.zoneId);
  const records = await Promise.all(
    groups.map(async (group) => ({
      group,
      record: await new StageReadModel(db).stageRecord(sourceStageId, group.groupId),
    })),
  );
  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  if (!descriptor)
    throw new NotFoundException('Tournament discipline is not installed', {
      errorCode: 'zone-group-not-found',
    });
  const groupRecords = records.flatMap(({ group, record }) =>
    record === undefined ? [] : [{ group, record }],
  );
  if (groupRecords.length !== records.length) {
    throw new NotFoundException(`No source group records for zone ${zone.number}`, {
      errorCode: 'zone-group-not-found',
    });
  }
  const seriesDeclaration = await readStageSeries(db, {
    tournamentId,
    stageId: sourceStageId,
    zoneId: zone.zoneId,
  });
  const groupAccountings = new Map(
    groupRecords.map((entry) => [
      entry.group.groupId,
      computeAccounting(descriptor, entry.record.entrantIds, entry.record.outcomes, undefined, {
        seriesDeclaration,
      }),
    ]),
  );
  const groupNumbers = new Map(
    groupRecords.map((entry) => [entry.group.groupId, entry.group.number]),
  );
  const pipeline = standingsPipeline(descriptor, groupRecords[0]?.record.overrides ?? {});
  await validateStoredPromotionPlan(db, sourceStageId, plan, groupAccountings);
  return evaluateGroupPromotion(plan, groupAccountings, pipeline, groupNumbers);
}

/** Validates a plan against the groups and destination zones that currently exist. */
export async function validateStoredPromotionPlan(
  db: Kysely<Database>,
  sourceStageId: string,
  plan: PromotionPlan,
  accountings?: ReadonlyMap<string, readonly { readonly entrantId: string }[]>,
): Promise<void> {
  const competition = new CompetitionRepository(db);
  const sourceGroups = await competition.listGroupsOfZone(plan.zoneId);
  const destinationZones = await competition.listZonesOfStage(plan.nextStageId);
  const records = await Promise.all(
    sourceGroups.map(async (group) => ({
      group,
      record: await new StageReadModel(db).stageRecord(sourceStageId, group.groupId),
    })),
  );
  validatePromotionPlan(
    plan,
    records.map((entry) => ({
      groupId: entry.group.groupId,
      number: entry.group.number,
      entrantCount:
        accountings?.get(entry.group.groupId)?.length ?? entry.record?.entrantIds.length ?? 0,
    })),
    destinationZones.length === 0
      ? [IMPLICIT_ZONE_NAME]
      : destinationZones.map((zone) => zone.name),
  );
}

export function promotionPlanFromStored(
  zoneId: string,
  nextStageId: string,
  stored: Record<string, unknown>,
): PromotionPlan {
  const value = typeof stored === 'string' ? parseStoredPlan(stored) : stored;
  return promotionPlanFromUnknown(zoneId, nextStageId, value);
}

export function promotionPlanFromUnknown(
  zoneId: string,
  nextStageId: string,
  value: Record<string, unknown>,
): PromotionPlan {
  const advance = value.perGroupAdvance;
  const combination = value.combination;
  if (
    !(
      (typeof advance === 'number' && Number.isInteger(advance)) ||
      (isRecord(advance) && Object.values(advance).every((count) => typeof count === 'number'))
    ) ||
    !isRecord(combination) ||
    typeof combination.mode !== 'string'
  ) {
    throw new BadRequestException('Promotion plan has an invalid shape', {
      errorCode: 'zone-group-bad-request',
    });
  }

  const parsedCombination =
    combination.mode === 'ranked' && isRecord(combination.pipeline)
      ? {
          mode: 'ranked' as const,
          pipeline: combination.pipeline as PromotionPlan['combination'] extends {
            readonly mode: 'ranked';
            readonly pipeline: infer Pipeline;
          }
            ? Pipeline
            : never,
        }
      : combination.mode === 'manual' && Array.isArray(combination.order)
        ? {
            mode: 'manual' as const,
            order: combination.order.filter(
              (entrantId): entrantId is string => typeof entrantId === 'string',
            ),
          }
        : combination.mode === 'group-order'
          ? { mode: 'group-order' as const }
          : undefined;
  if (!parsedCombination)
    throw new BadRequestException('Promotion plan has an invalid combination', {
      errorCode: 'zone-group-bad-request',
    });

  const bands = value.bands;
  if (
    bands !== undefined &&
    (!Array.isArray(bands) ||
      !bands.every(
        (band) =>
          isRecord(band) && typeof band.zoneRef === 'string' && typeof band.count === 'number',
      ))
  ) {
    throw new BadRequestException('Promotion plan has invalid destination bands', {
      errorCode: 'zone-group-bad-request',
    });
  }

  return {
    zoneId,
    nextStageId,
    perGroupAdvance: advance as PromotionPlan['perGroupAdvance'],
    combination: parsedCombination as PromotionPlan['combination'],
    ...(bands === undefined
      ? {}
      : {
          bands: bands as readonly { readonly zoneRef: string; readonly count: number }[],
        }),
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStoredPlan(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Converted to the same client-safe invalid-plan response below.
  }
  throw new BadRequestException('Stored promotion plan has an invalid shape', {
    errorCode: 'zone-group-bad-request',
  });
}
