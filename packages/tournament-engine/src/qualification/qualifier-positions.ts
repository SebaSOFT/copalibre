import { QualificationError } from '../errors.js';
import type { FixtureGraph, GeneratedMatch, SlotSource } from '../types.js';
import { validatePromotionPlan, type PromotionPlan } from './promotion.js';

/**
 * How a qualifier position reads before anyone has qualified, derived from the plan's declaration
 * alone. `group-rank` is group-order combination ("1st Group A"), `cohort` is ranked combination
 * ("2nd best runner-up"), `number` is manual combination ("Qualifier 5").
 */
export type QualifierLabel =
  | {
      readonly kind: 'group-rank';
      readonly rank: number;
      readonly groupId: string;
      readonly groupNumber: number;
    }
  | { readonly kind: 'cohort'; readonly rank: number; readonly order: number }
  | { readonly kind: 'number'; readonly number: number };

export interface QualifierPlanGroup {
  readonly groupId: string;
  readonly number: number;
}

/** One undecided first-round side of a stage generated ahead. */
export interface QualifierSeed {
  readonly promotionPlanId: string;
  /** 1-based index in the plan's whole combined list, bands included. */
  readonly position: number;
}

/**
 * Every position of the plan's combined list, labelled. Index `k - 1` is position `k`, which is
 * the same index `evaluateGroupPromotion` gives the entrant qualifying there.
 */
export function qualifierLabels(
  plan: PromotionPlan,
  groups: readonly QualifierPlanGroup[],
): readonly QualifierLabel[] {
  const ordered = [...groups].sort((left, right) => left.number - right.number);
  const advance = ordered.map((group) => ({ group, count: advanceOf(plan, group.number) }));
  if (plan.combination.mode === 'group-order') {
    return advance.flatMap(({ group, count }) =>
      Array.from({ length: count }, (_, index) => ({
        kind: 'group-rank' as const,
        rank: index + 1,
        groupId: group.groupId,
        groupNumber: group.number,
      })),
    );
  }

  const total = advance.reduce((sum, entry) => sum + entry.count, 0);
  if (plan.combination.mode === 'manual') {
    return Array.from({ length: total }, (_, index) => ({
      kind: 'number' as const,
      number: index + 1,
    }));
  }

  const deepest = Math.max(0, ...advance.map((entry) => entry.count));
  const labels: QualifierLabel[] = [];
  for (let rank = 1; rank <= deepest; rank += 1) {
    const cohort = advance.filter((entry) => entry.count >= rank).length;
    for (let order = 1; order <= cohort; order += 1) labels.push({ kind: 'cohort', rank, order });
  }
  return labels;
}

/**
 * The combined positions each destination zone receives, in seed order. Without bands every
 * position goes to the one destination, named `undefined`.
 */
export function qualifierPositionsByZone(
  plan: PromotionPlan,
  groups: readonly QualifierPlanGroup[],
): ReadonlyMap<string | undefined, readonly number[]> {
  validatePromotionPlan(
    plan,
    groups.map((group) => ({
      groupId: group.groupId,
      number: group.number,
      entrantCount: advanceOf(plan, group.number),
    })),
  );
  const total = groups.reduce((sum, group) => sum + advanceOf(plan, group.number), 0);
  const range = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => from + index + 1);
  if (plan.bands === undefined) return new Map([[undefined, range(0, total)]]);

  const zones = new Map<string | undefined, readonly number[]>();
  let offset = 0;
  for (const band of plan.bands) {
    zones.set(band.zoneRef, range(offset, band.count));
    offset += band.count;
  }
  if (offset !== total) {
    throw new QualificationError(
      'Promotion band counts must exactly cover the combined qualifiers',
      { bandCount: offset, qualified: total },
    );
  }
  return zones;
}

/**
 * A graph generated over `qualifiers.length` seeds, with seed `k`'s entrant slot replaced by the
 * qualifier position `qualifiers[k - 1]`. The bracket's seed-slot order therefore applies
 * unchanged, and the plan's order decides the cross-overs exactly as it would after completion.
 */
export function withQualifierSources(
  graph: FixtureGraph,
  qualifiers: readonly QualifierSeed[],
): FixtureGraph {
  const source = (slot: SlotSource): SlotSource => {
    if (slot.kind !== 'entrant') return slot;
    const qualifier = qualifiers[slot.seed - 1];
    if (qualifier === undefined) {
      throw new QualificationError('A seed has no qualifier position', { seed: slot.seed });
    }
    return { kind: 'qualifier', ...qualifier };
  };
  const match = (generated: GeneratedMatch): GeneratedMatch =>
    generated.shape === 'duel'
      ? { ...generated, slotA: source(generated.slotA), slotB: source(generated.slotB) }
      : { ...generated, slots: generated.slots.map(source) };
  return { ...graph, matches: graph.matches.map(match) };
}

function advanceOf(plan: PromotionPlan, groupNumber: number): number {
  const advance =
    typeof plan.perGroupAdvance === 'number'
      ? plan.perGroupAdvance
      : plan.perGroupAdvance[groupNumber];
  if (advance === undefined || !Number.isInteger(advance) || advance < 1) {
    throw new QualificationError(`Group ${groupNumber} has no positive promotion count`, {
      groupNumber,
    });
  }
  return advance;
}
