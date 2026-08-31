import type { TiebreakPipeline } from '@copalibre/rules';
import { allocateSeeds } from '../allocation/index.js';
import { QualificationError } from '../errors.js';
import { generateFixtures } from '../fixtures/index.js';
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
    expect(outcome.qualified).toEqual(['b1', 'a1', 'a2', 'b2']);
    expect(outcome.eliminated).toEqual([]);
    expect(outcome.resolved).toBe(true);
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

  it('feeds promotion bands and an unbanded promotion into automatic allocation', () => {
    const outcome = evaluateGroupPromotion(
      {
        zoneId: 'zone-source',
        nextStageId: 'stage-next',
        perGroupAdvance: 1,
        combination: { mode: 'ranked', pipeline: points },
        bands: [
          { zoneRef: 'copa-oro', count: 1 },
          { zoneRef: 'copa-plata', count: 1 },
        ],
      },
      new Map([
        ['group-a', [{ entrantId: 'a1', statistics: { points: 9 } }]],
        ['group-b', [{ entrantId: 'b1', statistics: { points: 12 } }]],
      ]),
      points,
    );
    const gold = outcome.bands?.['copa-oro'] ?? [];
    const silver = outcome.bands?.['copa-plata'] ?? [];

    expect(
      allocateSeeds({
        allocation: { mode: 'automatic' },
        entrants: gold.map(({ entrantId }) => ({ entrantId })),
        qualified: gold.map(({ entrantId }) => entrantId),
      }).seeds,
    ).toEqual([{ entrantId: 'b1', seed: 1 }]);
    expect(
      allocateSeeds({
        allocation: { mode: 'automatic' },
        entrants: silver.map(({ entrantId }) => ({ entrantId })),
        qualified: silver.map(({ entrantId }) => entrantId),
      }).seeds,
    ).toEqual([{ entrantId: 'a1', seed: 1 }]);

    expect(
      allocateSeeds({
        allocation: { mode: 'automatic' },
        entrants: outcome.combined.map(({ entrantId }) => ({ entrantId })),
        qualified: outcome.qualified,
      }).seeds.map((seed) => seed.entrantId),
    ).toEqual(['b1', 'a1']);
  });

  it('round-trips two groups of four through promotion, allocation, and a next-stage bracket', () => {
    const outcome = evaluateGroupPromotion(
      {
        zoneId: 'zone-source',
        nextStageId: 'stage-next',
        perGroupAdvance: 2,
        combination: { mode: 'ranked', pipeline: points },
      },
      new Map([
        [
          'group-a',
          [
            { entrantId: 'a1', statistics: { points: 12 } },
            { entrantId: 'a2', statistics: { points: 9 } },
            { entrantId: 'a3', statistics: { points: 3 } },
            { entrantId: 'a4', statistics: { points: 0 } },
          ],
        ],
        [
          'group-b',
          [
            { entrantId: 'b1', statistics: { points: 10 } },
            { entrantId: 'b2', statistics: { points: 6 } },
            { entrantId: 'b3', statistics: { points: 3 } },
            { entrantId: 'b4', statistics: { points: 0 } },
          ],
        ],
      ]),
      points,
    );
    const seeds = allocateSeeds({
      allocation: { mode: 'automatic' },
      entrants: outcome.qualified.map((entrantId) => ({ entrantId })),
      qualified: outcome.qualified,
      slots: 4,
    }).seeds;
    const fixtures = generateFixtures({ format: 'single-elimination', entrants: seeds });

    expect(fixtures.ok).toBe(true);
    if (!fixtures.ok) throw fixtures.error;
    expect(fixtures.value.entrantCount).toBe(4);
    expect(fixtures.value.matches).toHaveLength(3);
  });

  it('ranks uneven groups by average points per game, rather than raw points totals', () => {
    const [pointParameter] = points.parameters;
    if (!pointParameter) throw new Error('Expected the points tiebreak parameter');
    const pointsPerGame: TiebreakPipeline = {
      ...points,
      id: 'points-per-game',
      parameters: [{ ...pointParameter, id: 'points-per-game', label: 'Points per game' }],
    };
    const groups = new Map([
      [
        'group-five',
        Array.from({ length: 5 }, (_value, index) => ({
          entrantId: index === 0 ? 'a1' : `a${index + 1}`,
          statistics: {
            points: index === 0 ? 12 : 8 - index,
            'points-per-game': index === 0 ? 3 : 2 - index / 10,
          },
        })),
      ],
      [
        'group-seven',
        Array.from({ length: 7 }, (_value, index) => ({
          entrantId: index === 0 ? 'b1' : `b${index + 1}`,
          statistics: {
            points: index === 0 ? 14 : 10 - index,
            'points-per-game': index === 0 ? 2 : 1.5 - index / 10,
          },
        })),
      ],
    ]);
    const plan = {
      zoneId: 'zone-source',
      nextStageId: 'stage-next',
      perGroupAdvance: 1,
      combination: { mode: 'ranked' as const, pipeline: pointsPerGame },
    };

    expect(evaluateGroupPromotion(plan, groups, pointsPerGame).qualified).toEqual(['a1', 'b1']);
    expect(
      evaluateGroupPromotion(
        { ...plan, combination: { mode: 'ranked' as const, pipeline: points } },
        groups,
        points,
      ).qualified,
    ).toEqual(['b1', 'a1']);
  });
});
