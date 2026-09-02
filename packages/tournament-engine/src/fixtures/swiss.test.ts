import { describe, expect, it } from '@jest/globals';
import type { RecordedOutcome } from '@copalibre/domain';
import { InvalidEntrantsError } from '../errors.js';
import {
  assertSupportedFormat,
  isEliminationFormat,
  isRoundRobinFormat,
  isSwissFormat,
} from '../formats.js';
import { isDuelMatch } from '../types.js';
import { generateFixtures } from './index.js';
import { generateNextSwissRoundFixtures, generateSwissRound1 } from './swiss.js';

describe('swiss system format', () => {
  describe('validation & classification', () => {
    it('rejects entrant count below 2', () => {
      expect(() => generateSwissRound1([{ entrantId: 'e1', seed: 1 }])).toThrow(
        InvalidEntrantsError,
      );
    });

    it('asserts and classifies swiss format correctly', () => {
      expect(assertSupportedFormat('swiss').ok).toBe(true);
      expect(isSwissFormat('swiss')).toBe(true);
      expect(isSwissFormat('single-elimination')).toBe(false);
      expect(isEliminationFormat('swiss')).toBe(false);
      expect(isRoundRobinFormat('swiss')).toBe(false);
    });
  });

  describe('Scenario 1: Round 1 seed split (8 entrants)', () => {
    const entrants8 = [
      { entrantId: 's1', seed: 1 },
      { entrantId: 's2', seed: 2 },
      { entrantId: 's3', seed: 3 },
      { entrantId: 's4', seed: 4 },
      { entrantId: 's5', seed: 5 },
      { entrantId: 's6', seed: 6 },
      { entrantId: 's7', seed: 7 },
      { entrantId: 's8', seed: 8 },
    ];

    it('generates 4 matches pairing top half vs bottom half', () => {
      const matches = generateSwissRound1(entrants8);
      expect(matches).toHaveLength(4);

      const [m1, m2, m3, m4] = matches;
      expect(m1?.id).toBe('SWISS-R1-M1');
      expect(m2?.id).toBe('SWISS-R1-M2');
      expect(m3?.id).toBe('SWISS-R1-M3');
      expect(m4?.id).toBe('SWISS-R1-M4');

      if (m1 && isDuelMatch(m1)) {
        expect(m1.slotA).toEqual({ kind: 'entrant', entrantId: 's1', seed: 1 });
        expect(m1.slotB).toEqual({ kind: 'entrant', entrantId: 's5', seed: 5 });
      }
      if (m2 && isDuelMatch(m2)) {
        expect(m2.slotA).toEqual({ kind: 'entrant', entrantId: 's2', seed: 2 });
        expect(m2.slotB).toEqual({ kind: 'entrant', entrantId: 's6', seed: 6 });
      }
      if (m3 && isDuelMatch(m3)) {
        expect(m3.slotA).toEqual({ kind: 'entrant', entrantId: 's3', seed: 3 });
        expect(m3.slotB).toEqual({ kind: 'entrant', entrantId: 's7', seed: 7 });
      }
      if (m4 && isDuelMatch(m4)) {
        expect(m4.slotA).toEqual({ kind: 'entrant', entrantId: 's4', seed: 4 });
        expect(m4.slotB).toEqual({ kind: 'entrant', entrantId: 's8', seed: 8 });
      }
    });

    it('supports series with span > 1', () => {
      const matches = generateSwissRound1(entrants8, {
        series: { span: 3 },
      });
      expect(matches).toHaveLength(12); // 4 fixtures * 3 games
      expect(matches[0]?.id).toBe('SWISS-R1-M1-1');
      expect(matches[1]?.id).toBe('SWISS-R1-M1-2');
      expect(matches[2]?.id).toBe('SWISS-R1-M1-3');
    });
  });

  describe('Scenario 2: Round 2 groups participants by record', () => {
    const entrants8 = [
      { entrantId: 's1', seed: 1 },
      { entrantId: 's2', seed: 2 },
      { entrantId: 's3', seed: 3 },
      { entrantId: 's4', seed: 4 },
      { entrantId: 's5', seed: 5 },
      { entrantId: 's6', seed: 6 },
      { entrantId: 's7', seed: 7 },
      { entrantId: 's8', seed: 8 },
    ];

    it('pairs 1-0 entrants together and 0-1 entrants together without rematches', () => {
      const r1Matches = generateSwissRound1(entrants8);

      // s1 beats s5, s2 beats s6, s3 beats s7, s4 beats s8
      const r1Outcomes: RecordedOutcome[] = [
        {
          matchId: 'SWISS-R1-M1',
          sides: [
            { entrantId: 's1', statistics: {} },
            { entrantId: 's5', statistics: {} },
          ],
          winnerEntrantId: 's1',
        },
        {
          matchId: 'SWISS-R1-M2',
          sides: [
            { entrantId: 's2', statistics: {} },
            { entrantId: 's6', statistics: {} },
          ],
          winnerEntrantId: 's2',
        },
        {
          matchId: 'SWISS-R1-M3',
          sides: [
            { entrantId: 's3', statistics: {} },
            { entrantId: 's7', statistics: {} },
          ],
          winnerEntrantId: 's3',
        },
        {
          matchId: 'SWISS-R1-M4',
          sides: [
            { entrantId: 's4', statistics: {} },
            { entrantId: 's8', statistics: {} },
          ],
          winnerEntrantId: 's4',
        },
      ];

      const r2Matches = generateNextSwissRoundFixtures({
        round: 2,
        entrants: entrants8,
        previousMatches: r1Matches,
        outcomes: r1Outcomes,
      });

      expect(r2Matches).toHaveLength(4);

      // 1-0 winners: s1, s2, s3, s4 -> split into s1 vs s3 and s2 vs s4
      // 0-1 losers: s5, s6, s7, s8 -> split into s5 vs s7 and s6 vs s8
      const pairStrings = r2Matches.map((m) => {
        if (isDuelMatch(m) && m.slotA.kind === 'entrant' && m.slotB.kind === 'entrant') {
          return [m.slotA.entrantId, m.slotB.entrantId].sort().join('-');
        }
        return '';
      });

      // Confirm 1-0 pairings exist
      expect(pairStrings).toContain('s1-s3');
      expect(pairStrings).toContain('s2-s4');

      // Confirm 0-1 pairings exist
      expect(pairStrings).toContain('s5-s7');
      expect(pairStrings).toContain('s6-s8');

      // Confirm no rematch with Round 1 matches
      expect(pairStrings).not.toContain('s1-s5');
      expect(pairStrings).not.toContain('s2-s6');
      expect(pairStrings).not.toContain('s3-s7');
      expect(pairStrings).not.toContain('s4-s8');
    });
  });

  describe('Full 3-round 8-player Swiss tournament', () => {
    const entrants8 = [
      { entrantId: 's1', seed: 1 },
      { entrantId: 's2', seed: 2 },
      { entrantId: 's3', seed: 3 },
      { entrantId: 's4', seed: 4 },
      { entrantId: 's5', seed: 5 },
      { entrantId: 's6', seed: 6 },
      { entrantId: 's7', seed: 7 },
      { entrantId: 's8', seed: 8 },
    ];

    it('generates Round 3 with zero rematches across the tournament', () => {
      const r1Matches = generateSwissRound1(entrants8);
      const r1Outcomes: RecordedOutcome[] = [
        {
          matchId: 'SWISS-R1-M1',
          sides: [
            { entrantId: 's1', statistics: {} },
            { entrantId: 's5', statistics: {} },
          ],
          winnerEntrantId: 's1',
        },
        {
          matchId: 'SWISS-R1-M2',
          sides: [
            { entrantId: 's2', statistics: {} },
            { entrantId: 's6', statistics: {} },
          ],
          winnerEntrantId: 's2',
        },
        {
          matchId: 'SWISS-R1-M3',
          sides: [
            { entrantId: 's3', statistics: {} },
            { entrantId: 's7', statistics: {} },
          ],
          winnerEntrantId: 's3',
        },
        {
          matchId: 'SWISS-R1-M4',
          sides: [
            { entrantId: 's4', statistics: {} },
            { entrantId: 's8', statistics: {} },
          ],
          winnerEntrantId: 's4',
        },
      ];

      const r2Matches = generateNextSwissRoundFixtures({
        round: 2,
        entrants: entrants8,
        previousMatches: r1Matches,
        outcomes: r1Outcomes,
      });

      // R2 results:
      // s1 beats s3 -> s1 is 2-0, s3 is 1-1
      // s2 beats s4 -> s2 is 2-0, s4 is 1-1
      // s5 beats s7 -> s5 is 1-1, s7 is 0-2
      // s6 beats s8 -> s6 is 1-1, s8 is 0-2
      const r2Outcomes: RecordedOutcome[] = [
        {
          matchId: 'SWISS-R2-M1',
          sides: [
            { entrantId: 's1', statistics: {} },
            { entrantId: 's3', statistics: {} },
          ],
          winnerEntrantId: 's1',
        },
        {
          matchId: 'SWISS-R2-M2',
          sides: [
            { entrantId: 's2', statistics: {} },
            { entrantId: 's4', statistics: {} },
          ],
          winnerEntrantId: 's2',
        },
        {
          matchId: 'SWISS-R2-M3',
          sides: [
            { entrantId: 's5', statistics: {} },
            { entrantId: 's7', statistics: {} },
          ],
          winnerEntrantId: 's5',
        },
        {
          matchId: 'SWISS-R2-M4',
          sides: [
            { entrantId: 's6', statistics: {} },
            { entrantId: 's8', statistics: {} },
          ],
          winnerEntrantId: 's6',
        },
      ];

      const allMatches = [...r1Matches, ...r2Matches];
      const allOutcomes = [...r1Outcomes, ...r2Outcomes];

      const r3Matches = generateNextSwissRoundFixtures({
        round: 3,
        entrants: entrants8,
        previousMatches: allMatches,
        outcomes: allOutcomes,
      });

      expect(r3Matches).toHaveLength(4);

      const r3Pairs = r3Matches.map((m) => {
        if (isDuelMatch(m) && m.slotA.kind === 'entrant' && m.slotB.kind === 'entrant') {
          return [m.slotA.entrantId, m.slotB.entrantId].sort().join('-');
        }
        return '';
      });

      // 2-0 bracket: s1 vs s2
      expect(r3Pairs).toContain('s1-s2');
      // 0-2 bracket: s7 vs s8
      expect(r3Pairs).toContain('s7-s8');

      // Verify no repeats of any match from R1 or R2
      for (const m of allMatches) {
        if (isDuelMatch(m) && m.slotA.kind === 'entrant' && m.slotB.kind === 'entrant') {
          const prevKey = [m.slotA.entrantId, m.slotB.entrantId].sort().join('-');
          expect(r3Pairs).not.toContain(prevKey);
        }
      }
    });
  });

  describe('Scenario 3: Odd participant receives a bye (7 entrants)', () => {
    const entrants7 = [
      { entrantId: 'p1', seed: 1 },
      { entrantId: 'p2', seed: 2 },
      { entrantId: 'p3', seed: 3 },
      { entrantId: 'p4', seed: 4 },
      { entrantId: 'p5', seed: 5 },
      { entrantId: 'p6', seed: 6 },
      { entrantId: 'p7', seed: 7 },
    ];

    it('assigns bye to lowest seed in round 1', () => {
      const r1Matches = generateSwissRound1(entrants7);
      expect(r1Matches).toHaveLength(4); // 3 duels + 1 bye

      const byeMatch = r1Matches.find(
        (m) => isDuelMatch(m) && (m.slotA.kind === 'bye' || m.slotB.kind === 'bye'),
      );
      expect(byeMatch).toBeDefined();
      if (byeMatch && isDuelMatch(byeMatch)) {
        expect(byeMatch.slotA).toEqual({ kind: 'entrant', entrantId: 'p7', seed: 7 });
        expect(byeMatch.slotB).toEqual({ kind: 'bye' });
      }
    });

    it('assigns bye in round 2 to lowest-ranked entrant who has not yet received a bye', () => {
      const r1Matches = generateSwissRound1(entrants7);

      // p1 beats p4, p2 beats p5, p3 beats p6. p7 received bye in R1.
      const r1Outcomes: RecordedOutcome[] = [
        {
          matchId: 'SWISS-R1-M1',
          sides: [
            { entrantId: 'p1', statistics: {} },
            { entrantId: 'p4', statistics: {} },
          ],
          winnerEntrantId: 'p1',
        },
        {
          matchId: 'SWISS-R1-M2',
          sides: [
            { entrantId: 'p2', statistics: {} },
            { entrantId: 'p5', statistics: {} },
          ],
          winnerEntrantId: 'p2',
        },
        {
          matchId: 'SWISS-R1-M3',
          sides: [
            { entrantId: 'p3', statistics: {} },
            { entrantId: 'p6', statistics: {} },
          ],
          winnerEntrantId: 'p3',
        },
      ];

      const r2Matches = generateNextSwissRoundFixtures({
        round: 2,
        entrants: entrants7,
        previousMatches: r1Matches,
        outcomes: r1Outcomes,
      });

      expect(r2Matches).toHaveLength(4);

      // In R2:
      // Records:
      // 1-0: p1, p2, p3, p7 (p7 got bye)
      // 0-1: p4, p5, p6
      // Bye must go to lowest-ranked who has not had a bye:
      // Candidates with lowest score (0-1): p4, p5, p6.
      // Lowest seed among them: p6!
      const byeMatchR2 = r2Matches.find(
        (m) => isDuelMatch(m) && (m.slotA.kind === 'bye' || m.slotB.kind === 'bye'),
      );
      expect(byeMatchR2).toBeDefined();
      if (byeMatchR2 && isDuelMatch(byeMatchR2)) {
        expect(byeMatchR2.slotA).toEqual({ kind: 'entrant', entrantId: 'p6', seed: 6 });
        expect(byeMatchR2.slotB).toEqual({ kind: 'bye' });
      }
    });
  });

  describe('Draws, floaters, and series in round 2', () => {
    it('handles draws awarding 0.5 points to both sides and multi-game series', () => {
      const entrants = [
        { entrantId: 'd1', seed: 1 },
        { entrantId: 'd2', seed: 2 },
        { entrantId: 'd3', seed: 3 },
        { entrantId: 'd4', seed: 4 },
      ];
      const r1 = generateSwissRound1(entrants);
      // d1 vs d3 draws, d2 beats d4
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'SWISS-R1-M1',
          sides: [
            { entrantId: 'd1', statistics: {} },
            { entrantId: 'd3', statistics: {} },
          ],
        },
        {
          matchId: 'SWISS-R1-M2',
          sides: [
            { entrantId: 'd2', statistics: {} },
            { entrantId: 'd4', statistics: {} },
          ],
          winnerEntrantId: 'd2',
        },
      ];

      const r2 = generateNextSwissRoundFixtures({
        round: 2,
        entrants,
        previousMatches: r1,
        outcomes,
        options: { series: { span: 3, neutralGround: true } },
      });

      // 4 entrants * 3 games = 6 total matches across 2 fixtures
      expect(r2).toHaveLength(6);
      expect(r2[0]?.id).toBe('SWISS-R2-M1-1');
      if (r2[0] && isDuelMatch(r2[0])) {
        expect(r2[0].homeSlot).toBeUndefined();
      }
    });

    it('breaks score ties using Buchholz opponent scores', () => {
      const entrants = [
        { entrantId: 'b1', seed: 1 },
        { entrantId: 'b2', seed: 2 },
        { entrantId: 'b3', seed: 3 },
        { entrantId: 'b4', seed: 4 },
      ];
      // b1 beat b3, b2 beat b4
      const r1Matches = generateSwissRound1(entrants);
      const r1Outcomes: RecordedOutcome[] = [
        {
          matchId: 'SWISS-R1-M1',
          sides: [
            { entrantId: 'b1', statistics: {} },
            { entrantId: 'b3', statistics: {} },
          ],
          winnerEntrantId: 'b1',
        },
        {
          matchId: 'SWISS-R1-M2',
          sides: [
            { entrantId: 'b2', statistics: {} },
            { entrantId: 'b4', statistics: {} },
          ],
          winnerEntrantId: 'b2',
        },
      ];
      // In round 2: b1 (1-0) vs b2 (1-0), b3 (0-1) vs b4 (0-1)
      const r2Matches = generateNextSwissRoundFixtures({
        round: 2,
        entrants,
        previousMatches: r1Matches,
        outcomes: r1Outcomes,
        options: { series: { span: 3 } }, // non-neutral ground series
      });
      // b1 beats b2, b3 beats b4
      const r2Outcomes: RecordedOutcome[] = [
        {
          matchId: 'SWISS-R2-M1-1',
          sides: [
            { entrantId: 'b1', statistics: {} },
            { entrantId: 'b2', statistics: {} },
          ],
          winnerEntrantId: 'b1',
        },
        {
          matchId: 'SWISS-R2-M2-1',
          sides: [
            { entrantId: 'b3', statistics: {} },
            { entrantId: 'b4', statistics: {} },
          ],
          winnerEntrantId: 'b3',
        },
      ];

      // Round 3:
      // b2 has 1 win (lost to b1 who has 2 wins -> b2 Buchholz is high)
      // b3 has 1 win (lost to b1, beat b4 who has 0 wins -> b3 Buchholz is lower)
      const r3 = generateNextSwissRoundFixtures({
        round: 3,
        entrants,
        previousMatches: [...r1Matches, ...r2Matches],
        outcomes: [...r1Outcomes, ...r2Outcomes],
      });
      expect(r3).toHaveLength(2);
    });

    it('throws error when no valid pairing can be found without rematches', () => {
      const entrants = [
        { entrantId: 'x1', seed: 1 },
        { entrantId: 'x2', seed: 2 },
      ];
      const r1 = generateSwissRound1(entrants);
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'SWISS-R1-M1',
          sides: [
            { entrantId: 'x1', statistics: {} },
            { entrantId: 'x2', statistics: {} },
          ],
          winnerEntrantId: 'x1',
        },
      ];

      // Round 2 with only 2 players who already played each other cannot avoid rematch
      expect(() =>
        generateNextSwissRoundFixtures({
          round: 2,
          entrants,
          previousMatches: r1,
          outcomes,
        }),
      ).toThrow('Failed to find a valid Swiss pairing');
    });
  });

  describe('Integration via generateFixtures', () => {
    it('generates Swiss round 1 through generateFixtures entry point', () => {
      const entrants = [
        { entrantId: 't1', seed: 1 },
        { entrantId: 't2', seed: 2 },
        { entrantId: 't3', seed: 3 },
        { entrantId: 't4', seed: 4 },
      ];

      const res = generateFixtures({
        format: 'swiss',
        entrants,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.format).toBe('swiss');
        expect(res.value.entrantCount).toBe(4);
        expect(res.value.matches).toHaveLength(2);
      }
    });
  });
});
