import { describe, expect, it } from '@jest/globals';
import { fixtureDescriptor, type RecordedOutcome } from '@copalibre/domain';
import { InvalidEntrantsError } from '../errors.js';
import {
  assertSupportedFormat,
  isEliminationFormat,
  isGauntletFormat,
  isRoundRobinFormat,
} from '../formats.js';
import { isDuelMatch } from '../types.js';
import {
  computeGauntletStandings,
  generateGauntlet,
  projectGauntletStandings,
} from './gauntlet.js';
import { generateFixtures } from './index.js';

describe('gauntlet (stepladder) format', () => {
  describe('validation', () => {
    it('rejects entrant count below 2', () => {
      expect(() => generateGauntlet([{ entrantId: 'e1', seed: 1 }])).toThrow(InvalidEntrantsError);
    });

    it('rejects entrant count above 32', () => {
      const entrants33 = Array.from({ length: 33 }, (_, i) => ({
        entrantId: `e${i + 1}`,
        seed: i + 1,
      }));
      expect(() => generateGauntlet(entrants33)).toThrow(InvalidEntrantsError);
    });
  });

  describe('format classification', () => {
    it('asserts and classifies gauntlet correctly', () => {
      expect(assertSupportedFormat('gauntlet').ok).toBe(true);
      expect(isGauntletFormat('gauntlet')).toBe(true);
      expect(isGauntletFormat('single-elimination')).toBe(false);
      expect(isEliminationFormat('gauntlet')).toBe(true);
      expect(isRoundRobinFormat('gauntlet')).toBe(false);
    });
  });

  describe('4-entrant Gauntlet', () => {
    const entrants = [
      { entrantId: 'team-1', seed: 1 },
      { entrantId: 'team-2', seed: 2 },
      { entrantId: 'team-3', seed: 3 },
      { entrantId: 'team-4', seed: 4 },
    ];

    it('generates exactly 3 matches across 3 rounds', () => {
      const matches = generateGauntlet(entrants);
      expect(matches).toHaveLength(3);

      const [m1, m2, m3] = matches;
      expect(m1?.id).toBe('GNT-R1-M1');
      expect(m2?.id).toBe('GNT-R2-M1');
      expect(m3?.id).toBe('GNT-R3-M1');

      for (const m of matches) {
        expect(m.shape).toBe('duel');
        expect(m.bracket).toBe('winners');
        expect(m.position).toBe(1);
      }

      // Round 1: Seed 4 vs Seed 3
      if (m1 && isDuelMatch(m1)) {
        expect(m1.round).toBe(1);
        expect(m1.slotA).toEqual({ kind: 'entrant', entrantId: 'team-4', seed: 4 });
        expect(m1.slotB).toEqual({ kind: 'entrant', entrantId: 'team-3', seed: 3 });
      }

      // Round 2: Winner(M1) vs Seed 2
      if (m2 && isDuelMatch(m2)) {
        expect(m2.round).toBe(2);
        expect(m2.slotA).toEqual({ kind: 'winner-of', matchId: 'GNT-R1-M1' });
        expect(m2.slotB).toEqual({ kind: 'entrant', entrantId: 'team-2', seed: 2 });
      }

      // Round 3 (Grand Final): Winner(M2) vs Seed 1
      if (m3 && isDuelMatch(m3)) {
        expect(m3.round).toBe(3);
        expect(m3.slotA).toEqual({ kind: 'winner-of', matchId: 'GNT-R2-M1' });
        expect(m3.slotB).toEqual({ kind: 'entrant', entrantId: 'team-1', seed: 1 });
      }
    });

    it('supports custom idPrefix', () => {
      const matches = generateGauntlet(entrants, { idPrefix: 'LCK' });
      expect(matches[0]?.id).toBe('LCK-R1-M1');
      if (matches[1] && isDuelMatch(matches[1])) {
        expect(matches[1].slotA).toEqual({ kind: 'winner-of', matchId: 'LCK-R1-M1' });
      }
    });

    it('supports multi-match series with alternating homeSlot', () => {
      const matches = generateGauntlet(entrants, {
        series: { span: 3 },
      });
      // 3 matches * 3 games = 9 total games
      expect(matches).toHaveLength(9);
      expect(matches[0]?.id).toBe('GNT-R1-M1-1');
      expect(matches[1]?.id).toBe('GNT-R1-M1-2');
      expect(matches[2]?.id).toBe('GNT-R1-M1-3');
      if (matches[0] && isDuelMatch(matches[0])) expect(matches[0].homeSlot).toBe('A');
      if (matches[1] && isDuelMatch(matches[1])) expect(matches[1].homeSlot).toBe('B');
      if (matches[2] && isDuelMatch(matches[2])) expect(matches[2].homeSlot).toBe('A');
    });
  });

  describe('5-entrant Gauntlet (spec scenario)', () => {
    const entrants = [
      { entrantId: 'e1', seed: 1 },
      { entrantId: 'e2', seed: 2 },
      { entrantId: 'e3', seed: 3 },
      { entrantId: 'e4', seed: 4 },
      { entrantId: 'e5', seed: 5 },
    ];

    it('generates 4 sequential matches', () => {
      const matches = generateGauntlet(entrants);
      expect(matches).toHaveLength(4);

      const [m1, m2, m3, m4] = matches;
      expect(m1?.id).toBe('GNT-R1-M1');
      expect(m2?.id).toBe('GNT-R2-M1');
      expect(m3?.id).toBe('GNT-R3-M1');
      expect(m4?.id).toBe('GNT-R4-M1');

      if (m1 && isDuelMatch(m1)) {
        expect(m1.slotA).toEqual({ kind: 'entrant', entrantId: 'e5', seed: 5 });
        expect(m1.slotB).toEqual({ kind: 'entrant', entrantId: 'e4', seed: 4 });
      }
      if (m2 && isDuelMatch(m2)) {
        expect(m2.slotA).toEqual({ kind: 'winner-of', matchId: 'GNT-R1-M1' });
        expect(m2.slotB).toEqual({ kind: 'entrant', entrantId: 'e3', seed: 3 });
      }
      if (m3 && isDuelMatch(m3)) {
        expect(m3.slotA).toEqual({ kind: 'winner-of', matchId: 'GNT-R2-M1' });
        expect(m3.slotB).toEqual({ kind: 'entrant', entrantId: 'e2', seed: 2 });
      }
      if (m4 && isDuelMatch(m4)) {
        expect(m4.slotA).toEqual({ kind: 'winner-of', matchId: 'GNT-R3-M1' });
        expect(m4.slotB).toEqual({ kind: 'entrant', entrantId: 'e1', seed: 1 });
      }
    });

    it('advances seed 5 through the entire gauntlet and ranks in reverse elimination order', () => {
      const matches = generateGauntlet(entrants);

      // M1: e5 beats e4 -> e4 is 5th place
      // M2: e5 beats e3 -> e3 is 4th place
      // M3: e5 beats e2 -> e2 is 3rd place
      // M4: e5 beats e1 -> e1 is 2nd place (Runner-Up), e5 is 1st place (Champion)
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'GNT-R1-M1',
          sides: [
            { entrantId: 'e5', statistics: {} },
            { entrantId: 'e4', statistics: {} },
          ],
          winnerEntrantId: 'e5',
        },
        {
          matchId: 'GNT-R2-M1',
          sides: [
            { entrantId: 'e5', statistics: {} },
            { entrantId: 'e3', statistics: {} },
          ],
          winnerEntrantId: 'e5',
        },
        {
          matchId: 'GNT-R3-M1',
          sides: [
            { entrantId: 'e5', statistics: {} },
            { entrantId: 'e2', statistics: {} },
          ],
          winnerEntrantId: 'e5',
        },
        {
          matchId: 'GNT-R4-M1',
          sides: [
            { entrantId: 'e5', statistics: {} },
            { entrantId: 'e1', statistics: {} },
          ],
          winnerEntrantId: 'e5',
        },
      ];

      const res = projectGauntletStandings(entrants, matches, outcomes);
      expect(res.fullyResolved).toBe(true);
      expect(res.championId).toBe('e5');
      expect(res.runnerUpId).toBe('e1');

      expect(res.ranks).toEqual([
        { rank: 1, entrantId: 'e5', matchId: 'GNT-R4-M1', isChampion: true },
        { rank: 2, entrantId: 'e1', eliminatedInRound: 4, matchId: 'GNT-R4-M1' },
        { rank: 3, entrantId: 'e2', eliminatedInRound: 3, matchId: 'GNT-R3-M1' },
        { rank: 4, entrantId: 'e3', eliminatedInRound: 2, matchId: 'GNT-R2-M1' },
        { rank: 5, entrantId: 'e4', eliminatedInRound: 1, matchId: 'GNT-R1-M1' },
      ]);
    });
  });

  describe('8-entrant Gauntlet progression', () => {
    const entrants8 = Array.from({ length: 8 }, (_, i) => ({
      entrantId: `s${i + 1}`,
      seed: i + 1,
    }));

    it('generates 7 matches from R1 through R7', () => {
      const matches = generateGauntlet(entrants8);
      expect(matches).toHaveLength(7);

      for (let r = 1; r <= 7; r++) {
        expect(matches[r - 1]?.id).toBe(`GNT-R${r}-M1`);
        expect(matches[r - 1]?.round).toBe(r);
      }
    });

    it('handles partial resolution when tournament is in progress', () => {
      const matches = generateGauntlet(entrants8);
      // Only R1 and R2 played so far
      const partialOutcomes: RecordedOutcome[] = [
        {
          matchId: 'GNT-R1-M1',
          sides: [
            { entrantId: 's8', statistics: {} },
            { entrantId: 's7', statistics: {} },
          ],
          winnerEntrantId: 's7',
        },
        {
          matchId: 'GNT-R2-M1',
          sides: [
            { entrantId: 's7', statistics: {} },
            { entrantId: 's6', statistics: {} },
          ],
          winnerEntrantId: 's6',
        },
      ];

      const res = projectGauntletStandings(entrants8, matches, partialOutcomes);
      expect(res.fullyResolved).toBe(false);
      expect(res.championId).toBeUndefined();
      expect(res.runnerUpId).toBeUndefined();
      // s8 eliminated in R1 (8th place), s7 eliminated in R2 (7th place)
      expect(res.ranks).toEqual([
        { rank: 7, entrantId: 's7', eliminatedInRound: 2, matchId: 'GNT-R2-M1' },
        { rank: 8, entrantId: 's8', eliminatedInRound: 1, matchId: 'GNT-R1-M1' },
      ]);
    });
  });

  describe('integration via generateFixtures & computeGauntletStandings', () => {
    const entrants = [
      { entrantId: 't1', seed: 1 },
      { entrantId: 't2', seed: 2 },
      { entrantId: 't3', seed: 3 },
    ];

    it('generates gauntlet via generateFixtures entry point', () => {
      const res = generateFixtures({
        format: 'gauntlet',
        entrants,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.format).toBe('gauntlet');
        expect(res.value.entrantCount).toBe(3);
        expect(res.value.matches).toHaveLength(2);
        expect(res.value.rounds).toHaveLength(2);
      }
    });

    it('computes full standings with accounting and rank order', () => {
      const descriptor = fixtureDescriptor();
      const matches = generateGauntlet(entrants);
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'GNT-R1-M1',
          sides: [
            { entrantId: 't3', statistics: {} },
            { entrantId: 't2', statistics: {} },
          ],
          winnerEntrantId: 't2',
        },
        {
          matchId: 'GNT-R2-M1',
          sides: [
            { entrantId: 't2', statistics: {} },
            { entrantId: 't1', statistics: {} },
          ],
          winnerEntrantId: 't1',
        },
      ];

      const standings = computeGauntletStandings(descriptor, entrants, matches, outcomes);
      expect(standings.rows).toHaveLength(3);
      expect(standings.rows[0]?.entrantId).toBe('t1');
      expect(standings.rows[0]?.rank).toBe(1);
      expect(standings.rows[1]?.entrantId).toBe('t2');
      expect(standings.rows[1]?.rank).toBe(2);
      expect(standings.rows[2]?.entrantId).toBe('t3');
      expect(standings.rows[2]?.rank).toBe(3);
    });

    it('computes partial standings when tournament is in progress and with neutral ground series', () => {
      const descriptor = fixtureDescriptor();
      const seriesMatches = generateGauntlet(entrants, {
        series: { span: 3, resolutionClass: 'best-of', neutralGround: true },
        idPrefix: 'CUSTOM',
      });
      // Neutral ground should have undefined homeSlot
      expect(seriesMatches[0]?.id).toBe('CUSTOM-R1-M1-1');
      if (seriesMatches[0] && isDuelMatch(seriesMatches[0])) {
        expect(seriesMatches[0].homeSlot).toBeUndefined();
      }

      // Round 1 series played (2 wins for t3 in span 3)
      const partialOutcomes: RecordedOutcome[] = [
        {
          matchId: 'CUSTOM-R1-M1-1',
          sides: [
            { entrantId: 't3', statistics: {} },
            { entrantId: 't2', statistics: {} },
          ],
          winnerEntrantId: 't3',
        },
        {
          matchId: 'CUSTOM-R1-M1-2',
          sides: [
            { entrantId: 't3', statistics: {} },
            { entrantId: 't2', statistics: {} },
          ],
          winnerEntrantId: 't3',
        },
      ];

      const standings = computeGauntletStandings(
        descriptor,
        entrants,
        seriesMatches,
        partialOutcomes,
        undefined,
        { prefix: 'CUSTOM' },
      );
      expect(standings.rows).toHaveLength(3);
      // t2 was eliminated in R1 (rank 3), t1 and t3 sort by unranked/seed
      const t2Row = standings.rows.find((r) => r.entrantId === 't2');
      expect(t2Row?.rank).toBe(3);
    });
  });
});
