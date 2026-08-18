import type { TiebreakPipeline } from '@copalibre/rules';
import { evaluateGroupPromotion } from './promotion.js';

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
});
