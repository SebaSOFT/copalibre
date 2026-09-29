import { describe, it, expect } from '@jest/globals';
import type { DisciplineDescriptor } from '@copalibre/domain';
import { resolveTiebreak } from '@copalibre/rules';
import { standingsPipeline } from './pipeline.js';

function communityDiscipline(): DisciplineDescriptor {
  return {
    descriptorId: 'd-basketball-community',
    alias: 'basketball',
    version: '1.0.0',
    name: 'Community Basketball',
    attribution: { author: 'Community', licence: 'MIT' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 5, maxPlayers: 12 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [
      { code: 'points', label: 'Points', aggregation: 'sum' },
      { code: 'score-difference', label: 'Goal Difference', aggregation: 'sum' },
      { code: 'points-for', label: 'Points For', aggregation: 'sum' },
      { code: 'points-against', label: 'Points Against', aggregation: 'sum' },
      { code: 'goals-for', label: 'Goals For', aggregation: 'sum' },
      { code: 'goals-against', label: 'Goals Against', aggregation: 'sum' },
      { code: 'wins', label: 'Wins', aggregation: 'sum' },
    ],
    scoringInputs: [{ code: 'points', label: 'Points', source: 'event-derived' }],
    availableFormats: ['round-robin', 'single-elimination'],
    notificationRuleCapabilities: [],
    winCondition: {} as unknown as DisciplineDescriptor['winCondition'],
    defaults: {
      format: 'round-robin',
      tiebreakers: ['points', 'points-for'],
    },
    fieldPolicies: {
      tiebreakers: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
  } as unknown as DisciplineDescriptor;
}

describe('standingsPipeline (tiebreak order resolution)', () => {
  it('applies a community discipline declared tiebreakers order without operator override', () => {
    const desc = communityDiscipline();
    const pipeline = standingsPipeline(desc, {});

    expect(pipeline.id).toBe('stage-configured');
    expect(pipeline.parameters).toHaveLength(2);
    expect(pipeline.parameters[0]?.id).toBe('points');
    expect(pipeline.parameters[0]?.direction).toBe('higher_wins');
    expect(pipeline.parameters[1]?.id).toBe('points-for');
    expect(pipeline.parameters[1]?.direction).toBe('higher_wins');
  });

  it('respects operator override when provided at key tiebreakers', () => {
    const desc = communityDiscipline();
    const pipeline = standingsPipeline(desc, {
      tiebreakers: ['wins', 'points'],
    });

    expect(pipeline.id).toBe('stage-configured');
    expect(pipeline.parameters).toHaveLength(2);
    expect(pipeline.parameters[0]?.id).toBe('wins');
    expect(pipeline.parameters[1]?.id).toBe('points');
  });

  it('respects legacy operator override at standings.tiebreak', () => {
    const desc = communityDiscipline();
    const pipeline = standingsPipeline(desc, {
      standings: {
        tiebreak: [{ statisticCode: 'wins', direction: 'higher_wins' }],
      },
    });

    expect(pipeline.id).toBe('stage-configured');
    expect(pipeline.parameters).toHaveLength(1);
    expect(pipeline.parameters[0]?.id).toBe('wins');
  });

  it('preserves lower-is-better ordering for defensive statistics', () => {
    const desc = communityDiscipline();
    const pipeline = standingsPipeline(desc, {
      tiebreakers: ['points', { statisticCode: 'points-against', direction: 'lower_wins' }],
    });

    expect(pipeline.parameters[1]?.id).toBe('points-against');
    expect(pipeline.parameters[1]?.direction).toBe('lower_wins');
  });

  it('binds a declared ratio comparator to accumulated discipline statistics', () => {
    const desc = {
      ...communityDiscipline(),
      defaults: {
        format: 'round-robin',
        tiebreakers: [
          'points',
          'score-difference',
          {
            statisticCode: 'goal-average',
            label: { en: 'Goal Average', es: 'Promedio de goles' },
            ratio: {
              numerator: 'goals-for',
              denominator: 'goals-against',
              zeroDenominator: 'numerator-only',
            },
          },
          'goals-for',
        ],
      },
    } as DisciplineDescriptor;

    const pipeline = standingsPipeline(desc);

    expect(pipeline.parameters[2]).toMatchObject({
      id: 'goal-average',
      label: { en: 'Goal Average', es: 'Promedio de goles' },
      direction: 'higher_wins',
      ratio: {
        numerator: 'goals-for',
        denominator: 'goals-against',
        zeroDenominator: 'numerator-only',
      },
    });
    expect(pipeline.parameters[2]?.unboundCapability).toBeUndefined();
    expect(pipeline.parameters[3]?.id).toBe('goals-for');

    const resolution = resolveTiebreak(pipeline, ['alfa', 'bravo'], {
      alfa: {
        points: 3,
        'score-difference': 3,
        'goals-for': 5,
        'goals-against': 2,
      },
      bravo: {
        points: 3,
        'score-difference': 3,
        'goals-for': 4,
        'goals-against': 1,
      },
    });

    expect(resolution.rankedGroups).toEqual([['bravo'], ['alfa']]);
    expect(resolution.trace[2]?.values).toEqual({ alfa: 2.5, bravo: 4 });
  });

  it('marks ratio comparators with undeclared operands as unbound', () => {
    const desc = {
      ...communityDiscipline(),
      defaults: {
        tiebreakers: [
          {
            statisticCode: 'goal-average',
            ratio: {
              numerator: 'goals-for',
              denominator: 'goals-conceded',
              zeroDenominator: 'numerator-only',
            },
          },
          {
            statisticCode: 'bad-zero-policy',
            ratio: {
              numerator: 'goals-for',
              denominator: 'goals-against',
              zeroDenominator: 'invalid',
            },
          },
        ],
      },
    } as DisciplineDescriptor;

    const pipeline = standingsPipeline(desc);

    expect(pipeline.parameters[0]?.ratio).toBeUndefined();
    expect(pipeline.parameters[0]?.unboundCapability).toBe('goal-average (comparator 1)');
    expect(pipeline.parameters[1]?.ratio).toBeUndefined();
    expect(pipeline.parameters[1]?.unboundCapability).toBe('bad-zero-policy (comparator 2)');
  });

  it('defaults zero-denominator worst-case ratios to missing-as-worst', () => {
    const desc = {
      ...communityDiscipline(),
      defaults: {
        tiebreakers: [
          {
            statisticCode: 'goal-average',
            ratio: {
              numerator: 'goals-for',
              denominator: 'goals-against',
              zeroDenominator: 'treat-as-worst',
            },
          },
        ],
      },
    } as DisciplineDescriptor;

    const pipeline = standingsPipeline(desc);

    expect(pipeline.parameters[0]?.missingValue).toBe('treat-as-worst');
  });

  it('falls back to engine-points when neither overrides nor defaults declare tiebreakers', () => {
    const bareDesc = {
      ...communityDiscipline(),
      defaults: {},
    } as DisciplineDescriptor;

    const pipeline = standingsPipeline(bareDesc, {});
    expect(pipeline.id).toBe('engine-points');
    expect(pipeline.parameters).toHaveLength(1);
    expect(pipeline.parameters[0]?.id).toBe('points');
  });
});
