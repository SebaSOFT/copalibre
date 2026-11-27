import { QualificationError } from '@copalibre/tournament-engine';
import { CompetitionRepository, EnrollmentRepository, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type {
  QualificationIncompleteMatchResponse,
  QualificationPositionResponse,
  QualificationPreviewResponse,
  QualificationTieResponse,
} from '../dto/qualification.dto.js';
import { NotFoundException } from '../http/error-contract.js';
import { evaluateStoredPromotion } from './promotion-plans.js';
import {
  stageQualifierPlans as stageQualifierPlansOf,
  type StageQualifierPlan,
} from './stage-qualifiers.js';

/** Statuses a stage's completion counts as resolved, plus the anulled games it leaves out. */
const SETTLED_STATUSES = ['finalized', 'forfeited', 'not-required'] as const;

export interface QualificationTournament {
  readonly tournamentId: string;
  readonly disciplineRef: { readonly descriptorId: string; readonly version: string };
}

/** The preview plus each plan's evaluated position → entrant map, for confirmation to store. */
export interface QualificationEvaluation {
  readonly preview: QualificationPreviewResponse;
  readonly resolutions: ReadonlyMap<string, Readonly<Record<string, string>>>;
}

/**
 * Evaluates every plan targeting a stage against current standings. Writes nothing. Pass a
 * transaction as `db` to evaluate under the caller's locks, or with an uncommitted result.
 */
export async function evaluateQualification(
  db: Kysely<Database>,
  tournament: QualificationTournament,
  plans: readonly StageQualifierPlan[],
): Promise<QualificationEvaluation> {
  const competition = new CompetitionRepository(db);
  const zoneNames = new Map<string, string>();
  for (const plan of plans) {
    for (const zone of await competition.listZonesOfStage(plan.plan.nextStageId)) {
      zoneNames.set(zone.zoneId, zone.name);
    }
  }
  const incomplete = await incompleteMatches(db, [
    ...new Set(plans.map((plan) => plan.sourceZone.stageId)),
  ]);

  const resolutions = new Map<string, Record<string, string>>();
  let tie: QualificationTieResponse | undefined;
  if (incomplete !== undefined && incomplete.length === 0) {
    for (const plan of plans) {
      try {
        const outcome = await evaluateStoredPromotion(db, {
          tournamentId: tournament.tournamentId,
          tournament,
          sourceStageId: plan.sourceZone.stageId,
          zone: plan.sourceZone,
          saved: plan.saved,
        });
        resolutions.set(
          plan.promotionPlanId,
          Object.fromEntries(
            outcome.combined.map((entry, index) => [String(index + 1), entry.entrantId]),
          ),
        );
      } catch (error) {
        if (!(error instanceof QualificationError)) throw error;
        tie = await tieOf(competition, plan, error);
        if (tie === undefined) throw error;
        break;
      }
    }
  }

  const positions: QualificationPositionResponse[] = plans.flatMap((plan) =>
    [...plan.positionsByZone].flatMap(([zoneId, routed]) =>
      routed.map((position) => {
        const entrantId = resolutions.get(plan.promotionPlanId)?.[String(position)];
        const confirmedEntrantId = plan.confirmedResolution?.[String(position)];
        const zoneName = zoneId === undefined ? undefined : zoneNames.get(zoneId);
        return {
          promotionPlanId: plan.promotionPlanId,
          position,
          qualifierLabel: plan.labels[position - 1] ?? {
            kind: 'number' as const,
            number: position,
          },
          ...(zoneId === undefined ? {} : { zoneId }),
          ...(zoneName === undefined ? {} : { zoneName }),
          ...(entrantId === undefined ? {} : { entrantId }),
          ...(confirmedEntrantId === undefined ? {} : { confirmedEntrantId }),
        };
      }),
    ),
  );

  const state = stateOf(plans, positions, incomplete, tie);
  const named = new Set<string>(
    [
      ...positions.flatMap((entry) => [entry.entrantId, entry.confirmedEntrantId]),
      ...(incomplete ?? []).flatMap((match) => [match.homeEntrantId, match.awayEntrantId]),
      ...(tie?.entrantIds ?? []),
    ].filter((entrantId): entrantId is string => entrantId !== undefined),
  );
  const resolved = await new EnrollmentRepository(db).resolveEntrantNames([...named]);
  const names = Object.fromEntries(
    [...resolved].map(([entrantId, entry]) => [entrantId, entry.name]),
  );

  return {
    preview: {
      state,
      positions,
      incomplete: [...(incomplete ?? [])],
      ...(tie === undefined ? {} : { tie }),
      names,
    },
    resolutions,
  };
}

function stateOf(
  plans: readonly StageQualifierPlan[],
  positions: readonly QualificationPositionResponse[],
  incomplete: readonly QualificationIncompleteMatchResponse[] | undefined,
  tie: QualificationTieResponse | undefined,
): QualificationPreviewResponse['state'] {
  if (incomplete === undefined || incomplete.length > 0) return 'incomplete';
  if (tie !== undefined) return 'tied';
  if (plans.every((plan) => plan.confirmedResolution === undefined)) return 'ready';
  const matches = positions.every((entry) => entry.confirmedEntrantId === entry.entrantId);
  return matches && plans.every((plan) => plan.confirmedResolution !== undefined)
    ? 'confirmed'
    : 'stale';
}

/**
 * Matches of the source stages still to settle, or `undefined` when a source stage has no
 * matches at all — a stage that never started is not complete either.
 */
async function incompleteMatches(
  db: Kysely<Database>,
  stageIds: readonly string[],
): Promise<readonly QualificationIncompleteMatchResponse[] | undefined> {
  if (stageIds.length === 0) return undefined;
  const rows = await db
    .selectFrom('matches')
    .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
    .select([
      'matches.match_id',
      'matches.status',
      'fixtures.stage_id',
      'fixtures.round',
      'fixtures.home_entrant_id',
      'fixtures.away_entrant_id',
    ])
    .where('fixtures.stage_id', 'in', [...stageIds])
    .orderBy('fixtures.round')
    .orderBy('matches.match_id')
    .execute();
  if (stageIds.some((stageId) => !rows.some((row) => row.stage_id === stageId))) return undefined;
  return rows
    .filter((row) => !(SETTLED_STATUSES as readonly string[]).includes(row.status))
    .map((row) => ({
      matchId: row.match_id,
      round: row.round,
      status: row.status,
      ...(row.home_entrant_id === null ? {} : { homeEntrantId: row.home_entrant_id }),
      ...(row.away_entrant_id === null ? {} : { awayEntrantId: row.away_entrant_id }),
    }));
}

/**
 * The contested entrants and the positions they leave undecided, from the engine's refusal: a
 * group's tied cut line, or a tied same-rank cohort under ranked combination. Any other refusal
 * is a defect in the plan, not a tie, and is left to the caller.
 */
async function tieOf(
  competition: CompetitionRepository,
  plan: StageQualifierPlan,
  error: QualificationError,
): Promise<QualificationTieResponse | undefined> {
  const details = error.details ?? {};
  const contested = details.contested as
    { readonly entrantIds: readonly string[]; readonly places: readonly number[] } | undefined;
  if (contested !== undefined && typeof details.groupId === 'string') {
    const group = (await competition.listGroupsOfZone(plan.sourceZone.zoneId)).find(
      (candidate) => candidate.groupId === details.groupId,
    );
    const positions = plan.labels.flatMap((label, index) => {
      const place = label.rank ?? 0;
      if (!contested.places.includes(place)) return [];
      if (label.kind === 'group-rank' && label.groupNumber !== group?.number) return [];
      return label.kind === 'number' ? [] : [index + 1];
    });
    return {
      promotionPlanId: plan.promotionPlanId,
      entrantIds: [...contested.entrantIds],
      positions,
      ...(group === undefined ? {} : { groupName: group.name }),
    };
  }
  if (typeof details.rank === 'number' && Array.isArray(details.entrantIds)) {
    return {
      promotionPlanId: plan.promotionPlanId,
      entrantIds: details.entrantIds.filter(
        (entrantId): entrantId is string => typeof entrantId === 'string',
      ),
      positions: plan.labels.flatMap((label, index) =>
        label.kind === 'cohort' && label.rank === details.rank ? [index + 1] : [],
      ),
    };
  }
  return undefined;
}

/** The plans targeting a stage, refused when there are none. */
export function requirePlans(
  plans: readonly StageQualifierPlan[],
  stageNumber: number,
): readonly StageQualifierPlan[] {
  if (plans.length === 0) {
    throw new NotFoundException(`No promotion plan routes to stage ${stageNumber}`, {
      errorCode: 'qualification-plan-missing',
    });
  }
  return plans;
}

/** Carries a rolled-back evaluation out of its transaction. */
class RolledBackEvaluation extends Error {
  constructor(readonly stale: readonly StaleQualification[]) {
    super('rolled back on purpose');
  }
}

export interface StaleQualification {
  readonly stageNumber: number;
  readonly promotionPlanId: string;
  readonly positions: readonly {
    readonly position: number;
    readonly confirmedEntrantId: string;
    readonly resultingEntrantId?: string;
  }[];
}

/**
 * The confirmed qualifications a corrected result would no longer match. The replacement is
 * written inside a transaction that is always rolled back, so the plans are evaluated against
 * exactly the standings the correction would produce and nothing is kept.
 */
export async function staleConfirmationsAfter(
  db: Kysely<Database>,
  tournament: QualificationTournament,
  correction: { readonly matchId: string; readonly stageId: string; readonly replacement: unknown },
): Promise<readonly StaleQualification[]> {
  const confirmed = await db
    .selectFrom('promotion_plans')
    .innerJoin('zones', 'zones.zone_id', 'promotion_plans.zone_id')
    .innerJoin('stages', 'stages.stage_id', 'promotion_plans.next_stage_id')
    .select(['promotion_plans.promotion_plan_id', 'promotion_plans.next_stage_id', 'stages.number'])
    .where('zones.stage_id', '=', correction.stageId)
    .where('promotion_plans.confirmed_resolution', 'is not', null)
    .execute();
  if (confirmed.length === 0) return [];
  try {
    await db.transaction().execute(async (tx) => {
      await tx
        .updateTable('matches')
        .set({ status: 'finalized', result: JSON.stringify(correction.replacement) })
        .where('match_id', '=', correction.matchId)
        .execute();
      const stale: StaleQualification[] = [];
      for (const row of confirmed) {
        const plans = (await stageQualifierPlansOf(tx, row.next_stage_id)).filter(
          (plan) => plan.promotionPlanId === row.promotion_plan_id,
        );
        const { preview } = await evaluateQualification(tx, tournament, plans);
        const positions = preview.positions.flatMap((entry) =>
          entry.confirmedEntrantId === undefined || entry.confirmedEntrantId === entry.entrantId
            ? []
            : [
                {
                  position: entry.position,
                  confirmedEntrantId: entry.confirmedEntrantId,
                  ...(entry.entrantId === undefined ? {} : { resultingEntrantId: entry.entrantId }),
                },
              ],
        );
        if (positions.length > 0)
          stale.push({
            stageNumber: row.number,
            promotionPlanId: row.promotion_plan_id,
            positions,
          });
      }
      throw new RolledBackEvaluation(stale);
    });
  } catch (error) {
    if (error instanceof RolledBackEvaluation) return error.stale;
    throw error;
  }
  return [];
}
