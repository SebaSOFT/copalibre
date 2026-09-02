import {
  computeBuchholz,
  computeScopedBuchholz,
  computeMedianBuchholz,
  computeSonnebornBerger,
  type OpponentScore,
} from './strength-of-schedule.js';

describe('Strength-of-Schedule reducers', () => {
  describe('computeBuchholz', () => {
    it('sums all opponent points accurately', () => {
      const opponents: OpponentScore[] = [
        { opponentId: 'b', points: 9 },
        { opponentId: 'c', points: 7 },
        { opponentId: 'd', points: 6 },
        { opponentId: 'e', points: 6 },
      ];
      expect(computeBuchholz(opponents)).toBe(28);
    });

    it('returns 0 for an entrant with no opponents', () => {
      expect(computeBuchholz([])).toBe(0);
    });
  });

  describe('computeScopedBuchholz', () => {
    const opponents: OpponentScore[] = [
      { opponentId: 'b', points: 9, outcome: 'win' },
      { opponentId: 'c', points: 7, outcome: 'win' },
      { opponentId: 'd', points: 6, outcome: 'draw' },
      { opponentId: 'e', points: 4, outcome: 'loss' },
    ];

    it('sums only points of defeated opponents', () => {
      expect(computeScopedBuchholz(opponents, 'win')).toBe(16);
    });

    it('sums only points of drawn opponents', () => {
      expect(computeScopedBuchholz(opponents, 'draw')).toBe(6);
    });

    it('sums only points of opponents lost to', () => {
      expect(computeScopedBuchholz(opponents, 'loss')).toBe(4);
    });
  });

  describe('computeMedianBuchholz', () => {
    it('trims single highest and lowest scores by default', () => {
      const opponents: OpponentScore[] = [
        { opponentId: 'b', points: 12 },
        { opponentId: 'c', points: 10 },
        { opponentId: 'd', points: 8 },
        { opponentId: 'e', points: 2 },
      ];
      const result = computeMedianBuchholz(opponents);
      expect(result.trimmedLowest).toEqual([2]);
      expect(result.trimmedHighest).toEqual([12]);
      expect(result.remainingScores).toEqual([8, 10]);
      expect(result.score).toBe(18);
    });

    it('handles custom cut counts', () => {
      const opponents: OpponentScore[] = [
        { opponentId: 'a', points: 1 },
        { opponentId: 'b', points: 3 },
        { opponentId: 'c', points: 5 },
        { opponentId: 'd', points: 7 },
        { opponentId: 'e', points: 9 },
        { opponentId: 'f', points: 11 },
      ];
      const result = computeMedianBuchholz(opponents, { cutLowest: 2, cutHighest: 2 });
      expect(result.trimmedLowest).toEqual([1, 3]);
      expect(result.trimmedHighest).toEqual([9, 11]);
      expect(result.remainingScores).toEqual([5, 7]);
      expect(result.score).toBe(12);
    });

    it('returns 0 when opponents count is less than or equal to total cuts', () => {
      const opponents: OpponentScore[] = [
        { opponentId: 'a', points: 5 },
        { opponentId: 'b', points: 3 },
      ];
      const result = computeMedianBuchholz(opponents);
      expect(result.score).toBe(0);
      expect(result.remainingScores).toEqual([]);
    });
  });

  describe('computeSonnebornBerger', () => {
    it('scores 100% of defeated opponent points and 50% of drawn opponent points', () => {
      const opponents: OpponentScore[] = [
        { opponentId: 'champion', points: 12, outcome: 'win' },
        { opponentId: 'contender', points: 8, outcome: 'draw' },
        { opponentId: 'rival', points: 6, outcome: 'loss' },
      ];
      // 12 (win) + 0.5 * 8 (draw) + 0 (loss) = 12 + 4 = 16
      expect(computeSonnebornBerger(opponents)).toBe(16);
    });

    it('scores 0 if all matches were lost', () => {
      const opponents: OpponentScore[] = [
        { opponentId: 'a', points: 10, outcome: 'loss' },
        { opponentId: 'b', points: 8, outcome: 'loss' },
      ];
      expect(computeSonnebornBerger(opponents)).toBe(0);
    });
  });
});
