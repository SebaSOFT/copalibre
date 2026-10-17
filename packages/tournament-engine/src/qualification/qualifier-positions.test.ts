import type { TiebreakPipeline } from '@copalibre/rules';
import { QualificationError } from '../errors.js';
import { generateFixtures } from '../fixtures/index.js';
import { isDuelMatch } from '../types.js';
import { evaluateGroupPromotion, type PromotionPlan } from './promotion.js';
import {
  qualifierLabels,
  qualifierPositionsByZone,
  withQualifierSources,
} from './qualifier-positions.js';

const points: TiebreakPipeline = {
  id: 'points',
  version: 1,
  parameters: [
    {
      id: 'points',
      label: 'Points',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'calculated',
    },
  ],
};

const groups = [
  { groupId: 'group-b', number: 2 },
  { groupId: 'group-a', number: 1 },
  { groupId: 'group-c', number: 3 },
];

function plan(
  combination: PromotionPlan['combination'],
  perGroupAdvance: PromotionPlan['perGroupAdvance'] = 2,
  bands?: PromotionPlan['bands'],
): PromotionPlan {
  return {
    zoneId: 'zone-groups',
    nextStageId: 'stage-cups',
    perGroupAdvance,
    combination,
    ...(bands === undefined ? {} : { bands }),
  };
}

describe('qualifierLabels', () => {
  it('names group then rank under group-order, in declared group order', () => {
    expect(qualifierLabels(plan({ mode: 'group-order' }, { 1: 2, 2: 1, 3: 2 }), groups)).toEqual([
      { kind: 'group-rank', rank: 1, groupId: 'group-a', groupNumber: 1 },
      { kind: 'group-rank', rank: 2, groupId: 'group-a', groupNumber: 1 },
      { kind: 'group-rank', rank: 1, groupId: 'group-b', groupNumber: 2 },
      { kind: 'group-rank', rank: 1, groupId: 'group-c', groupNumber: 3 },
      { kind: 'group-rank', rank: 2, groupId: 'group-c', groupNumber: 3 },
    ]);
  });

  it('counts each ranked cohort from the uneven per-group counts', () => {
    expect(
      qualifierLabels(plan({ mode: 'ranked', pipeline: points }, { 1: 2, 2: 1, 3: 3 }), groups),
    ).toEqual([
      { kind: 'cohort', rank: 1, order: 1 },
      { kind: 'cohort', rank: 1, order: 2 },
      { kind: 'cohort', rank: 1, order: 3 },
      { kind: 'cohort', rank: 2, order: 1 },
      { kind: 'cohort', rank: 2, order: 2 },
      { kind: 'cohort', rank: 3, order: 1 },
    ]);
  });

  it('numbers manual positions', () => {
    expect(qualifierLabels(plan({ mode: 'manual', order: [] }, 1), groups)).toEqual([
      { kind: 'number', number: 1 },
      { kind: 'number', number: 2 },
      { kind: 'number', number: 3 },
    ]);
  });

  it('labels the position each entrant later qualifies at', () => {
    const ranked = plan({ mode: 'ranked', pipeline: points });
    const accounting = (ids: readonly [string, number][]) =>
      ids.map(([entrantId, value]) => ({ entrantId, statistics: { points: value } }));
    const outcome = evaluateGroupPromotion(
      ranked,
      new Map([
        [
          'group-a',
          accounting([
            ['a1', 9],
            ['a2', 4],
            ['a3', 0],
          ]),
        ],
        [
          'group-b',
          accounting([
            ['b1', 7],
            ['b2', 6],
            ['b3', 0],
          ]),
        ],
        [
          'group-c',
          accounting([
            ['c1', 8],
            ['c2', 5],
            ['c3', 0],
          ]),
        ],
      ]),
      points,
      new Map([
        ['group-a', 1],
        ['group-b', 2],
        ['group-c', 3],
      ]),
    );
    const labels = qualifierLabels(ranked, groups);
    // The second-best runner-up is c2 (5 points, behind b2's 6).
    expect(outcome.combined[4]?.entrantId).toBe('c2');
    expect(labels[4]).toEqual({ kind: 'cohort', rank: 2, order: 2 });
  });

  it('refuses a group without a positive promotion count', () => {
    expect(() => qualifierLabels(plan({ mode: 'group-order' }, { 1: 1, 2: 1 }), groups)).toThrow(
      QualificationError,
    );
  });
});

describe('qualifierPositionsByZone', () => {
  it('routes every position to the one destination without bands', () => {
    expect(qualifierPositionsByZone(plan({ mode: 'group-order' }, 1), groups)).toEqual(
      new Map([[undefined, [1, 2, 3]]]),
    );
  });

  it('splits the combined list into contiguous bands', () => {
    const banded = plan({ mode: 'ranked', pipeline: points }, 2, [
      { zoneRef: 'Copa Oro', count: 4 },
      { zoneRef: 'Copa Plata', count: 2 },
    ]);
    expect(qualifierPositionsByZone(banded, groups)).toEqual(
      new Map([
        ['Copa Oro', [1, 2, 3, 4]],
        ['Copa Plata', [5, 6]],
      ]),
    );
  });

  it('refuses bands that do not cover the combined list', () => {
    const banded = plan({ mode: 'group-order' }, 2, [{ zoneRef: 'Copa Oro', count: 4 }]);
    expect(() => qualifierPositionsByZone(banded, groups)).toThrow(QualificationError);
  });
});

describe('withQualifierSources', () => {
  it('replaces seed k with qualifier position k and keeps the seed-slot order', () => {
    const generated = generateFixtures({
      format: 'single-elimination',
      entrants: [1, 2, 3, 4].map((seed) => ({ entrantId: `seed-${seed}`, seed })),
    });
    if (!generated.ok) throw new Error(generated.error.message);
    const graph = withQualifierSources(
      generated.value,
      [5, 6, 7, 8].map((position) => ({ promotionPlanId: 'plan-1', position })),
    );
    const firstRound = graph.matches.filter(isDuelMatch).filter((match) => match.round === 1);
    expect(firstRound.map((match) => [match.slotA, match.slotB])).toEqual([
      [
        { kind: 'qualifier', promotionPlanId: 'plan-1', position: 5 },
        { kind: 'qualifier', promotionPlanId: 'plan-1', position: 8 },
      ],
      [
        { kind: 'qualifier', promotionPlanId: 'plan-1', position: 6 },
        { kind: 'qualifier', promotionPlanId: 'plan-1', position: 7 },
      ],
    ]);
  });

  it('refuses a seed with no qualifier', () => {
    const generated = generateFixtures({
      format: 'single-elimination',
      entrants: [1, 2].map((seed) => ({ entrantId: `seed-${seed}`, seed })),
    });
    if (!generated.ok) throw new Error(generated.error.message);
    expect(() =>
      withQualifierSources(generated.value, [{ promotionPlanId: 'plan-1', position: 1 }]),
    ).toThrow(QualificationError);
  });
});
