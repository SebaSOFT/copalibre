import type { TiebreakPipeline } from '@copalibre/rules';
import { QualificationError } from '../errors.js';
import { evaluateGroupPromotion, validatePromotionPlan } from './promotion.js';

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

describe('evaluateGroupPromotion', () => {
  it('ranks same-place cohorts and partitions combined qualifiers into destination bands', () => {
    const outcome = evaluateGroupPromotion(
      {
        zoneId: 'zone-source',
        nextStageId: 'stage-next',
        perGroupAdvance: 2,
        combination: { mode: 'ranked', pipeline: points },
        bands: [
          { zoneRef: 'copa-oro', count: 2 },
          { zoneRef: 'copa-plata', count: 2 },
        ],
      },
      new Map([
        [
          'group-a',
          [
            { entrantId: 'a1', statistics: { points: 9 } },
            { entrantId: 'a2', statistics: { points: 6 } },
          ],
        ],
        [
          'group-b',
          [
            { entrantId: 'b1', statistics: { points: 12 } },
            { entrantId: 'b2', statistics: { points: 3 } },
          ],
        ],
      ]),
      points,
      new Map([
        ['group-a', 1],
        ['group-b', 2],
      ]),
    );

    expect(outcome.combined.map((entry) => entry.entrantId)).toEqual(['b1', 'a1', 'a2', 'b2']);
    expect(outcome.bands?.['copa-oro']?.map((entry) => entry.entrantId)).toEqual(['b1', 'a1']);
    expect(outcome.bands?.['copa-plata']?.map((entry) => entry.entrantId)).toEqual(['a2', 'b2']);
  });

  it('supports variable group counts, manual order, and group-number order', () => {
    const accountings = new Map([
      [
        'group-a',
        [
          { entrantId: 'a1', statistics: { points: 9 } },
          { entrantId: 'a2', statistics: { points: 6 } },
        ],
      ],
      [
        'group-b',
        [
          { entrantId: 'b1', statistics: { points: 12 } },
          { entrantId: 'b2', statistics: { points: 3 } },
        ],
      ],
    ]);
    const groupNumbers = new Map([
      ['group-a', 1],
      ['group-b', 2],
    ]);

    const manual = evaluateGroupPromotion(
      {
        zoneId: 'zone-source',
        nextStageId: 'stage-next',
        perGroupAdvance: { 1: 1, 2: 2 },
        combination: { mode: 'manual', order: ['b2', 'a1', 'b1'] },
      },
      accountings,
      points,
      groupNumbers,
    );
    expect(manual.combined.map((entry) => entry.entrantId)).toEqual(['b2', 'a1', 'b1']);

    const groupOrder = evaluateGroupPromotion(
      {
        zoneId: 'zone-source',
        nextStageId: 'stage-next',
        perGroupAdvance: 1,
        combination: { mode: 'group-order' },
      },
      accountings,
      points,
      groupNumbers,
    );
    expect(groupOrder.combined.map((entry) => entry.entrantId)).toEqual(['a1', 'b1']);
  });

  it('refuses contested source cuts and unresolved cross-group cohorts', () => {
    expect(() =>
      evaluateGroupPromotion(
        {
          zoneId: 'zone-source',
          nextStageId: 'stage-next',
          perGroupAdvance: 1,
          combination: { mode: 'group-order' },
        },
        new Map([
          [
            'group-a',
            [
              { entrantId: 'a1', statistics: { points: 3 } },
              { entrantId: 'a2', statistics: { points: 3 } },
            ],
          ],
        ]),
        points,
      ),
    ).toThrow('unresolved promotion cut');

    expect(() =>
      evaluateGroupPromotion(
        {
          zoneId: 'zone-source',
          nextStageId: 'stage-next',
          perGroupAdvance: 1,
          combination: { mode: 'ranked', pipeline: { ...points, parameters: [] } },
        },
        new Map([
          ['group-a', [{ entrantId: 'a1', statistics: { points: 3 } }]],
          ['group-b', [{ entrantId: 'b1', statistics: { points: 3 } }]],
        ]),
        points,
      ),
    ).toThrow('Cross-group promotion cohort is unresolved');
  });

  it('rejects unknown destination zones and bands that do not cover the promotion', () => {
    const plan = {
      zoneId: 'zone-source',
      nextStageId: 'stage-next',
      perGroupAdvance: 1,
      combination: { mode: 'group-order' as const },
      bands: [{ zoneRef: 'copa-oro', count: 1 }],
    };
    const groups = [
      { groupId: 'group-a', number: 1, entrantCount: 1 },
      { groupId: 'group-b', number: 2, entrantCount: 1 },
    ];

    expect(() => validatePromotionPlan(plan, groups, ['copa-plata'])).toThrow(QualificationError);
    expect(() => validatePromotionPlan(plan, groups, ['copa-oro'])).toThrow(
      'Promotion band counts must exactly cover the combined qualifiers',
    );
  });
});
