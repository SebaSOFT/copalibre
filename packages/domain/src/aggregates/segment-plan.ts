import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { bestOfOf, regulationCountOf } from './segment-regulation.js';

/**
 * The regulation segments a match is planned with when it starts.
 *
 * `type` is the discipline's first declared segment type. `count` is how many of it the plan
 * creates; `maximum` is how many regulation segments the ruleset expects, and is absent when
 * the ruleset states no expectation at all. A `regulationCount` plays every regulation segment
 * (two halves); a `bestOf` plays the segments needed to decide the match without a decider
 * (two sets of a best-of-three). Neither key means one segment.
 */
export interface SegmentPlan {
  readonly type: string;
  readonly count: number;
  readonly maximum?: number;
}

export interface AddableSegment {
  readonly type: string;
  /** False only for the regulation type once the plan's maximum is reached. */
  readonly withinPlan: boolean;
}

export function segmentPlanOf(
  descriptor: Pick<DisciplineDescriptor, 'segmentTypes'>,
  segmentsConfig: unknown,
): SegmentPlan | undefined {
  const regulation = descriptor.segmentTypes[0];
  if (regulation === undefined) return undefined;

  const regulationCount = regulationCountOf(segmentsConfig);
  if (regulationCount !== undefined) {
    return { type: regulation.name, count: regulationCount, maximum: regulationCount };
  }
  const bestOf = bestOfOf(segmentsConfig);
  if (bestOf !== undefined) {
    return { type: regulation.name, count: (bestOf + 1) / 2, maximum: bestOf };
  }
  return { type: regulation.name, count: 1 };
}

/**
 * Every declared segment type, each marked whether adding it stays within the plan. Only the
 * regulation type can be outside it, and only once the existing segments of that type reach
 * the plan's maximum; conditional types are always within it.
 */
export function addableSegmentsOf(
  descriptor: Pick<DisciplineDescriptor, 'segmentTypes'>,
  plan: SegmentPlan | undefined,
  existingSegments: readonly { readonly type: string }[],
): AddableSegment[] {
  return descriptor.segmentTypes.map((segmentType) => {
    const outside =
      plan !== undefined &&
      segmentType.name === plan.type &&
      plan.maximum !== undefined &&
      existingSegments.filter((segment) => segment.type === plan.type).length >= plan.maximum;
    return { type: segmentType.name, withinPlan: !outside };
  });
}
