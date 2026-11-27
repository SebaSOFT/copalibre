import type { SegmentTypeDefinition } from '../descriptors/discipline-descriptor.js';
import { addableSegmentsOf, segmentPlanOf } from './segment-plan.js';

const half: SegmentTypeDefinition = { name: 'half', label: 'Half', timed: true };
const extraTime: SegmentTypeDefinition = { name: 'extra-time', label: 'Extra time', timed: true };
const set: SegmentTypeDefinition = { name: 'set', label: 'Set', timed: false };

const football = { segmentTypes: [half, extraTime] };
const tennis = { segmentTypes: [set] };

describe('segmentPlanOf', () => {
  it('creates one segment per regulation count, all of them regulation (football shape)', () => {
    expect(segmentPlanOf(football, { regulationCount: 2 })).toEqual({
      type: 'half',
      count: 2,
      maximum: 2,
    });
  });

  it('creates the sets needed to decide a best-of-three without a decider', () => {
    expect(segmentPlanOf(tennis, { bestOf: 3 })).toEqual({ type: 'set', count: 2, maximum: 3 });
  });

  it('creates the sets needed to decide a best-of-five', () => {
    expect(segmentPlanOf(tennis, { bestOf: 5 })).toEqual({ type: 'set', count: 3, maximum: 5 });
  });

  it('falls back to one segment for an even best-of', () => {
    expect(segmentPlanOf(tennis, { bestOf: 4 })).toEqual({ type: 'set', count: 1 });
  });

  it('falls back to one segment for a non-integer best-of', () => {
    expect(segmentPlanOf(tennis, { bestOf: 2.5 })).toEqual({ type: 'set', count: 1 });
  });

  it('falls back to one segment for a non-positive regulation count', () => {
    expect(segmentPlanOf(football, { regulationCount: 0 })).toEqual({ type: 'half', count: 1 });
    expect(segmentPlanOf(football, { regulationCount: -2 })).toEqual({ type: 'half', count: 1 });
  });

  it('gives one segment with no maximum when the config is absent', () => {
    expect(segmentPlanOf(football, undefined)).toEqual({ type: 'half', count: 1 });
  });

  it('has no plan for a descriptor without segment types', () => {
    expect(segmentPlanOf({ segmentTypes: [] }, { regulationCount: 2 })).toBeUndefined();
  });

  it('prefers the regulation count when both keys are present', () => {
    expect(segmentPlanOf(tennis, { regulationCount: 4, bestOf: 3 })).toEqual({
      type: 'set',
      count: 4,
      maximum: 4,
    });
  });
});

describe('addableSegmentsOf', () => {
  const plan = { type: 'half', count: 2, maximum: 2 };

  it('marks every declared type within the plan before the regulation maximum', () => {
    expect(addableSegmentsOf(football, plan, [{ type: 'half' }])).toEqual([
      { type: 'half', withinPlan: true },
      { type: 'extra-time', withinPlan: true },
    ]);
  });

  it('marks the regulation type outside the plan once its maximum is reached', () => {
    expect(
      addableSegmentsOf(football, plan, [
        { type: 'half' },
        { type: 'half' },
        { type: 'extra-time' },
      ]),
    ).toEqual([
      { type: 'half', withinPlan: false },
      { type: 'extra-time', withinPlan: true },
    ]);
  });

  it('keeps conditional types within the plan at any count', () => {
    const many = Array.from({ length: 5 }, () => ({ type: 'extra-time' }));
    expect(addableSegmentsOf(football, plan, many)[1]).toEqual({
      type: 'extra-time',
      withinPlan: true,
    });
  });

  it('reports a fourth set of a best-of-three as outside the plan', () => {
    const tennisPlan = { type: 'set', count: 2, maximum: 3 };
    const sets = [{ type: 'set' }, { type: 'set' }, { type: 'set' }];
    expect(addableSegmentsOf(tennis, tennisPlan, sets)).toEqual([
      { type: 'set', withinPlan: false },
    ]);
  });

  it('reports every type within the plan when there is no plan and no maximum', () => {
    expect(addableSegmentsOf(football, { type: 'half', count: 1 }, [{ type: 'half' }])).toEqual([
      { type: 'half', withinPlan: true },
      { type: 'extra-time', withinPlan: true },
    ]);
  });
});
