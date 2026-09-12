import { describe, it, expect } from '@jest/globals';
import type { DisciplineDescriptor } from '@copalibre/domain';
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
      { code: 'points-for', label: 'Points For', aggregation: 'sum' },
      { code: 'points-against', label: 'Points Against', aggregation: 'sum' },
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
