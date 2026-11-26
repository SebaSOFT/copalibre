import type { Kysely } from 'kysely';
import { type Database, CompetitionRepository, withTransaction } from '@copalibre/persistence';
import {
  SavePromotionPlanRequest,
  PromotionPlanResponse,
  PromotionPreviewResponse,
  TargetingPromotionPreviewResponse,
} from '../dto/zones-groups.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { adminStage, resolveZone, stageOf } from './context.js';
import { generatedAheadFrom } from '../controllers/stage-qualifiers.js';
import { ConflictException, NotFoundException } from '../http/error-contract.js';
import { throwPromotionPlanError } from './errors.js';
import {
  evaluateStoredPromotion,
  validateStoredPromotionPlan,
  promotionPlanFromUnknown,
} from '../controllers/promotion-plans.js';
import type { PromotionPlan } from '@copalibre/tournament-engine';

export async function savePromotionPlan(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  body: SavePromotionPlanRequest,
  request: RequestWithSubject,
): Promise<PromotionPlanResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const nextStage = await stageOf(db, context.tournamentId, body.nextStageNumber);
  const plan = promotionPlanFromRequest(zone.zoneId, nextStage.stage.stageId, body);
  const competition = new CompetitionRepository(db);
  const existing = await competition.findPromotionPlan(zone.zoneId);
  // Positions of a stage generated ahead are this plan's; re-routing them under played matches
  // would move entrants out of games already decided.
  const ahead =
    existing === undefined
      ? { generated: false, progressed: false }
      : await generatedAheadFrom(db, existing.nextStageId, existing.promotionPlanId);
  if (ahead.progressed) {
    throw new ConflictException(
      'This plan generated a stage that already has results; its positions cannot change',
      { errorCode: 'zone-group-conflict' },
    );
  }
  try {
    await validatePromotionPlan(db, context.stage.stageId, plan);
    const saved = await withTransaction(db, (uow) =>
      competition.createPromotionPlan(uow, {
        zoneId: zone.zoneId,
        nextStageId: nextStage.stage.stageId,
        plan: plan as unknown as Record<string, unknown>,
        ...context.audit,
      }),
    );
    return ahead.generated ? { ...saved, mutationClass: 'requires_rebuild' } : saved;
  } catch (error) {
    throwPromotionPlanError(error);
  }
}

export async function previewPromotion(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  request: RequestWithSubject,
): Promise<PromotionPreviewResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const competition = new CompetitionRepository(db);
  const saved = await competition.findPromotionPlan(zone.zoneId);
  if (!saved)
    // A distinct code from the shared `zone-group-not-found` this endpoint's
    // own stage/zone lookups above also throw — an operator
    // viewing a zone with no saved plan yet is an expected, benign state,
    // not the same condition as a deleted/renumbered stage or zone, so the
    // console needs to tell the two apart rather than treat every 404 here
    // as "nothing configured".
    throw new NotFoundException(`No promotion plan for zone ${zoneNumber}`, {
      errorCode: 'promotion-plan-not-found',
    });

  try {
    return await computePromotionPreview(
      db,
      context.tournamentId,
      context.tournament,
      context.stage.stageId,
      zone,
      saved,
    );
  } catch (error) {
    throwPromotionPlanError(error);
  }
}

export async function promotionPlansTargetingStage(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  request: RequestWithSubject,
): Promise<readonly TargetingPromotionPreviewResponse[]> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const competition = new CompetitionRepository(db);
  const saved = await competition.findPromotionPlansTargetingStage(context.stage.stageId);

  const resolved = await Promise.all(
    saved.map(async (plan): Promise<TargetingPromotionPreviewResponse | undefined> => {
      const zone = await competition.findZoneById(plan.zoneId);
      if (!zone) return undefined;
      try {
        const preview = await computePromotionPreview(
          db,
          context.tournamentId,
          context.tournament,
          zone.stageId,
          zone,
          plan,
        );
        return {
          zoneNumber: zone.number,
          zoneId: zone.zoneId,
          combined: preview.combined,
          ...(preview.bands === undefined ? {} : { bands: preview.bands }),
        };
      } catch {
        // Not yet resolvable (e.g. group standings incomplete) — omitted,
        // not an error for this reverse lookup as a whole.
        return undefined;
      }
    }),
  );
  return resolved
    .filter((entry): entry is TargetingPromotionPreviewResponse => entry !== undefined)
    .sort((a, b) => a.zoneNumber - b.zoneNumber);
}

/**
 * Shared by `previewPromotion` (one zone, the caller already knows) and
 * `promotionPlansTargetingStage` (many zones discovered by reverse lookup).
 */
export async function computePromotionPreview(
  db: Kysely<Database>,
  tournamentId: string,
  tournament: { readonly disciplineRef: { descriptorId: string; version: string } },
  sourceStageId: string,
  zone: { readonly zoneId: string; readonly number: number },
  saved: { readonly nextStageId: string; readonly plan: Record<string, unknown> },
): Promise<PromotionPreviewResponse> {
  const outcome = await evaluateStoredPromotion(db, {
    tournamentId,
    tournament,
    sourceStageId,
    zone,
    saved,
  });
  return {
    combined: [...outcome.combined],
    ...(outcome.bands === undefined
      ? {}
      : {
          bands: Object.fromEntries(
            Object.entries(outcome.bands).map(([zoneRef, entrants]) => [zoneRef, [...entrants]]),
          ),
        }),
    trace: outcome.trace as unknown as Record<string, unknown>[],
  };
}

export async function validatePromotionPlan(
  db: Kysely<Database>,
  sourceStageId: string,
  plan: PromotionPlan,
): Promise<void> {
  await validateStoredPromotionPlan(db, sourceStageId, plan);
}

export function promotionPlanFromRequest(
  zoneId: string,
  nextStageId: string,
  body: SavePromotionPlanRequest,
): PromotionPlan {
  return promotionPlanFromUnknown(zoneId, nextStageId, {
    perGroupAdvance: body.perGroupAdvance,
    combination: body.combination,
    ...(body.bands === undefined ? {} : { bands: body.bands }),
  });
}
