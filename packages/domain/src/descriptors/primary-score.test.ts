import { describe, it, expect } from '@jest/globals';
import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { primaryScoreOf } from './discipline-descriptor.js';

describe('primaryScoreOf', () => {
  it('reads the declared scoringInput code instead of the alphabetically first or map-ordered key', () => {
    // In basketball, statistics map has wins first, but scoring input is points
    const basketballDesc = fixtureDescriptor({
      alias: 'basketball',
      scoringInputs: [{ code: 'points', label: 'Points', source: 'event-derived' }],
      statistics: [
        { code: 'wins', label: 'Wins', aggregation: 'sum' },
        { code: 'points', label: 'Points', aggregation: 'sum' },
        { code: 'assists', label: 'Assists', aggregation: 'sum' },
      ],
    });

    const sideStats = {
      wins: 1,
      points: 88,
      assists: 24,
    };

    const score = primaryScoreOf(sideStats, basketballDesc);
    expect(score).toBe(88);
  });

  it('resolves points-for when primary code is points and only points-for is recorded', () => {
    const basketballDesc = fixtureDescriptor({
      alias: 'basketball',
      scoringInputs: [{ code: 'points', label: 'Points', source: 'event-derived' }],
    });

    const sideStats = {
      wins: 1,
      'points-for': 102,
      'points-against': 95,
    };

    const score = primaryScoreOf(sideStats, basketballDesc);
    expect(score).toBe(102);
  });

  it('resolves custom primary code when provided as a string', () => {
    const sideStats = {
      wins: 2,
      frags: 17,
      played: 2,
    };

    expect(primaryScoreOf(sideStats, 'frags')).toBe(17);
  });

  it('never returns an outcome counter (wins/losses/draws/played) even without descriptor', () => {
    const sideStats = {
      wins: 1,
      losses: 0,
      played: 1,
      points: 42,
    };

    expect(primaryScoreOf(sideStats)).toBe(42);
  });

  it('returns undefined when no statistics are present or all are excluded', () => {
    expect(primaryScoreOf(undefined)).toBeUndefined();
    expect(primaryScoreOf({ wins: 1, losses: 0, played: 1 })).toBeUndefined();
  });
});
