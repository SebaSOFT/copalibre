import { resolveTiebreak, type TiebreakPipeline, type TraceNode } from '@copalibre/rules';
import { QualificationError } from '../errors.js';
import { toEntrantValues, type EntrantAccounting } from '../standings/index.js';
import { evaluateQualification, type QualificationOutcome } from './index.js';

export interface PromotionPlan {
  readonly zoneId: string;
  readonly nextStageId: string;
  readonly perGroupAdvance: number | Readonly<Record<number, number>>;
  readonly combination:
    | { readonly mode: 'ranked'; readonly pipeline: TiebreakPipeline }
    | { readonly mode: 'manual'; readonly order: readonly string[] }
    | { readonly mode: 'group-order' };
  /** Ordered, contiguous destination slices of the combined promotion order. */
  readonly bands?: readonly { readonly zoneRef: string; readonly count: number }[];
}

export interface QualifiedEntrant {
  readonly entrantId: string;
  readonly groupId: string;
  /** 1-based within the group’s resolved promotion order. */
  readonly rank: number;
}

export interface GroupPromotionOutcome {
  readonly perGroup: ReadonlyMap<string, QualificationOutcome>;
  /** Matches QualificationOutcome: promoted entrant ids in final seed order. */
  readonly qualified: readonly string[];
  /** Entrants left behind by their source-group promotion cut. */
  readonly eliminated: readonly string[];
  /** A group promotion only returns after every source cut and cohort is resolved. */
  readonly resolved: true;
  readonly combined: readonly QualifiedEntrant[];
  readonly bands?: Readonly<Record<string, readonly QualifiedEntrant[]>>;
  readonly trace: readonly TraceNode[];
}

export interface PromotionPlanGroup {
  readonly groupId: string;
  readonly number: number;
  readonly entrantCount: number;
}

/**
 * Validates the durable rule against the groups and destination zones that
 * currently exist. Evaluation performs the same checks again against current
 * standings, so a saved plan cannot become a silent invalid action later.
 */
export function validatePromotionPlan(
  plan: PromotionPlan,
  groups: readonly PromotionPlanGroup[],
  destinationZoneRefs: readonly string[] = [],
): void {
  if (plan.zoneId.trim() === '' || plan.nextStageId.trim() === '') {
    throw new QualificationError('A promotion plan needs source and destination stages', {});
  }
  if (groups.length === 0) {
    throw new QualificationError('A promotion plan needs at least one source group', {});
  }

  const groupNumbers = new Set(groups.map((group) => group.number));
  if (typeof plan.perGroupAdvance !== 'number') {
    for (const key of Object.keys(plan.perGroupAdvance)) {
      const groupNumber = Number(key);
      if (!Number.isInteger(groupNumber) || !groupNumbers.has(groupNumber)) {
        throw new QualificationError('Promotion count names a group outside the source zone', {
          groupNumber: key,
        });
      }
    }
  }

  let combinedCount = 0;
  for (const group of groups) {
    const advance = advanceFor(plan.perGroupAdvance, group.number);
    if (advance > group.entrantCount) {
      throw new QualificationError(
        `Group ${group.number} cannot promote ${advance} of ${group.entrantCount} entrant(s)`,
        { groupNumber: group.number, advance, entrantCount: group.entrantCount },
      );
    }
    combinedCount += advance;
  }

  if (plan.bands === undefined || destinationZoneRefs.length === 0) return;
  const destinations = new Set(destinationZoneRefs);
  let bandCount = 0;
  const used = new Set<string>();
  for (const band of plan.bands) {
    if (!destinations.has(band.zoneRef)) {
      throw new QualificationError('Promotion band names an undeclared destination zone', {
        zoneRef: band.zoneRef,
      });
    }
    if (!Number.isInteger(band.count) || band.count < 1 || used.has(band.zoneRef)) {
      throw new QualificationError(
        'Promotion bands need unique zone references and positive counts',
        {
          band,
        },
      );
    }
    used.add(band.zoneRef);
    bandCount += band.count;
  }
  if (bandCount !== combinedCount) {
    throw new QualificationError(
      'Promotion band counts must exactly cover the combined qualifiers',
      {
        bandCount,
        qualified: combinedCount,
      },
    );
  }
}

/**
 * Evaluates group promotion without persisting or generating a later stage.
 *
 * Each source group first resolves its own cut. Only then can its qualifiers be
 * compared with qualifiers from other groups; otherwise a cross-group order
 * would silently choose an entrant that did not qualify from their own group.
 */
export function evaluateGroupPromotion(
  plan: PromotionPlan,
  groupAccountings: ReadonlyMap<string, readonly EntrantAccounting[]>,
  pipeline: TiebreakPipeline,
  groupNumbers: ReadonlyMap<string, number> = new Map(),
): GroupPromotionOutcome {
  if (groupAccountings.size === 0) {
    throw new QualificationError('A promotion plan needs at least one source group', {});
  }

  const groups = [...groupAccountings.entries()]
    .map(([groupId, accounting], index) => ({
      groupId,
      accounting,
      number: groupNumbers.get(groupId) ?? index + 1,
    }))
    .sort((left, right) => left.number - right.number);

  validatePromotionPlan(
    plan,
    groups.map((group) => ({
      groupId: group.groupId,
      number: group.number,
      entrantCount: group.accounting.length,
    })),
  );

  const perGroup = new Map<string, QualificationOutcome>();
  const qualified: QualifiedEntrant[] = [];
  const accountingByEntrant = new Map<string, EntrantAccounting>();
  const trace: TraceNode[] = [];

  for (const group of groups) {
    const outcome = evaluateQualification({
      accounting: group.accounting,
      pipeline,
      advance: advanceFor(plan.perGroupAdvance, group.number),
    });
    perGroup.set(group.groupId, outcome);
    trace.push(...outcome.trace);
    if (!outcome.resolved) {
      throw new QualificationError('A source group has an unresolved promotion cut', {
        groupId: group.groupId,
        contested: outcome.contested,
      });
    }

    for (const [index, entrantId] of outcome.qualified.entries()) {
      const accounting = group.accounting.find((candidate) => candidate.entrantId === entrantId);
      if (!accounting)
        throw new QualificationError('Qualified entrant is absent from group accounting', {
          entrantId,
        });
      accountingByEntrant.set(entrantId, accounting);
      qualified.push({ entrantId, groupId: group.groupId, rank: index + 1 });
    }
  }

  const combined = combine(plan.combination, qualified, accountingByEntrant, trace);
  return {
    perGroup,
    qualified: combined.map((entry) => entry.entrantId),
    eliminated: [...perGroup.values()].flatMap((outcome) => outcome.eliminated),
    resolved: true,
    combined,
    ...(plan.bands === undefined ? {} : { bands: applyBands(plan.bands, combined) }),
    trace,
  };
}

function advanceFor(configured: PromotionPlan['perGroupAdvance'], groupNumber: number): number {
  const advance = typeof configured === 'number' ? configured : configured[groupNumber];
  if (!Number.isInteger(advance) || advance === undefined || advance < 1) {
    throw new QualificationError(`Group ${groupNumber} has no positive promotion count`, {
      groupNumber,
    });
  }
  return advance;
}

function combine(
  combination: PromotionPlan['combination'],
  qualified: readonly QualifiedEntrant[],
  accountingByEntrant: ReadonlyMap<string, EntrantAccounting>,
  trace: TraceNode[],
): readonly QualifiedEntrant[] {
  if (combination.mode === 'group-order') {
    // `qualified` is assembled after source groups are sorted by declared number,
    // and each cut is already best-first inside its own group.
    return qualified;
  }

  if (combination.mode === 'manual') {
    const expected = qualified.map((entry) => entry.entrantId).sort();
    const supplied = [...combination.order].sort();
    if (
      expected.length !== supplied.length ||
      expected.some((entrantId, index) => entrantId !== supplied[index])
    ) {
      throw new QualificationError(
        'Manual promotion order must name every qualified entrant exactly once',
        {
          expected,
          supplied: combination.order,
        },
      );
    }
    const byEntrant = new Map(qualified.map((entry) => [entry.entrantId, entry]));
    return combination.order.map((entrantId) => byEntrant.get(entrantId) as QualifiedEntrant);
  }

  const combined: QualifiedEntrant[] = [];
  const byRank = new Map<number, QualifiedEntrant[]>();
  for (const entry of qualified) {
    const cohort = byRank.get(entry.rank) ?? [];
    cohort.push(entry);
    byRank.set(entry.rank, cohort);
  }
  for (const rank of [...byRank.keys()].sort((left, right) => left - right)) {
    const cohort = byRank.get(rank) ?? [];
    const values = toEntrantValues(
      cohort.map((entry) => accountingByEntrant.get(entry.entrantId) as EntrantAccounting),
    );
    const resolved = resolveTiebreak(
      combination.pipeline,
      cohort.map((entry) => entry.entrantId),
      values,
    );
    trace.push(...resolved.trace);
    if (!resolved.fullyResolved) {
      throw new QualificationError('Cross-group promotion cohort is unresolved', {
        rank,
        entrantIds: cohort.map((entry) => entry.entrantId),
      });
    }
    const byEntrant = new Map(cohort.map((entry) => [entry.entrantId, entry]));
    combined.push(
      ...resolved.rankedGroups.flatMap((group) =>
        group.map((entrantId) => byEntrant.get(entrantId) as QualifiedEntrant),
      ),
    );
  }
  return combined;
}

function applyBands(
  bands: readonly { readonly zoneRef: string; readonly count: number }[],
  combined: readonly QualifiedEntrant[],
): Readonly<Record<string, readonly QualifiedEntrant[]>> {
  const destination: Record<string, readonly QualifiedEntrant[]> = {};
  let offset = 0;
  for (const band of bands) {
    if (
      band.zoneRef.trim() === '' ||
      !Number.isInteger(band.count) ||
      band.count < 1 ||
      destination[band.zoneRef]
    ) {
      throw new QualificationError(
        'Promotion bands need unique zone references and positive counts',
        { band },
      );
    }
    destination[band.zoneRef] = combined.slice(offset, offset + band.count);
    offset += band.count;
  }
  if (offset !== combined.length) {
    throw new QualificationError(
      'Promotion band counts must exactly cover the combined qualifiers',
      {
        bandCount: offset,
        qualified: combined.length,
      },
    );
  }
  return destination;
}
