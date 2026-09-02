import { describe, expect, it } from '@jest/globals';
import type { RecordedOutcome } from '@copalibre/domain';
import { InvalidEntrantsError } from '../errors.js';
import { isDuelMatch } from '../types.js';
import { generateBracketGroups, resolveBracketGroupAdvancement } from './bracket-groups.js';
import { generateFixtures } from './index.js';
import { generateGroupedFixtures } from './grouped.js';
import {
  assertSupportedFormat,
  isBracketGroupsFormat,
  isRoundRobinFormat,
  isEliminationFormat,
} from '../formats.js';

describe('bracket-groups (GSL dual tournament)', () => {
  describe('validation', () => {
    it('rejects entrant counts below 4', () => {
      expect(() =>
        generateBracketGroups([
          { entrantId: 'e1', seed: 1 },
          { entrantId: 'e2', seed: 2 },
          { entrantId: 'e3', seed: 3 },
        ]),
      ).toThrow(InvalidEntrantsError);
    });

    it('rejects entrant counts that are not a multiple of 4', () => {
      expect(() =>
        generateBracketGroups([
          { entrantId: 'e1', seed: 1 },
          { entrantId: 'e2', seed: 2 },
          { entrantId: 'e3', seed: 3 },
          { entrantId: 'e4', seed: 4 },
          { entrantId: 'e5', seed: 5 },
        ]),
      ).toThrow(InvalidEntrantsError);
    });

    it('rejects group sizes other than 4', () => {
      expect(() =>
        generateBracketGroups(
          [
            { entrantId: 'e1', seed: 1 },
            { entrantId: 'e2', seed: 2 },
            { entrantId: 'e3', seed: 3 },
            { entrantId: 'e4', seed: 4 },
          ],
          { bracketGroups: { groupSize: 5 } },
        ),
      ).toThrow(InvalidEntrantsError);
    });
  });

  describe('4-entrant GSL group (single group)', () => {
    const entrants = [
      { entrantId: 'alfa', seed: 1 },
      { entrantId: 'bravo', seed: 2 },
      { entrantId: 'charlie', seed: 3 },
      { entrantId: 'delta', seed: 4 },
    ];

    it('generates exactly 5 matches across 3 rounds with correct declarative slot sources', () => {
      const matches = generateBracketGroups(entrants);
      expect(matches).toHaveLength(5);

      const [m1, m2, m3, m4, m5] = matches;
      expect(m1?.id).toBe('BG-G1-R1-M1');
      expect(m2?.id).toBe('BG-G1-R1-M2');
      expect(m3?.id).toBe('BG-G1-R2-M1');
      expect(m4?.id).toBe('BG-G1-R2-M2');
      expect(m5?.id).toBe('BG-G1-R3-M1');

      // All matches must be duels with bracket-groups kind
      for (const m of matches) {
        expect(m.shape).toBe('duel');
        expect(m.bracket).toBe('bracket-groups');
      }

      // Round 1 Opening Matches
      // M1: Seed 1 vs Seed 4
      if (m1 && isDuelMatch(m1)) {
        expect(m1.round).toBe(1);
        expect(m1.position).toBe(1);
        expect(m1.slotA).toEqual({ kind: 'entrant', entrantId: 'alfa', seed: 1 });
        expect(m1.slotB).toEqual({ kind: 'entrant', entrantId: 'delta', seed: 4 });
      }

      // M2: Seed 2 vs Seed 3
      if (m2 && isDuelMatch(m2)) {
        expect(m2.round).toBe(1);
        expect(m2.position).toBe(2);
        expect(m2.slotA).toEqual({ kind: 'entrant', entrantId: 'bravo', seed: 2 });
        expect(m2.slotB).toEqual({ kind: 'entrant', entrantId: 'charlie', seed: 3 });
      }

      // Round 2 Winners Match (Winner M1 vs Winner M2)
      if (m3 && isDuelMatch(m3)) {
        expect(m3.round).toBe(2);
        expect(m3.position).toBe(1);
        expect(m3.slotA).toEqual({ kind: 'winner-of', matchId: 'BG-G1-R1-M1' });
        expect(m3.slotB).toEqual({ kind: 'winner-of', matchId: 'BG-G1-R1-M2' });
      }

      // Round 2 Elimination Match (Loser M1 vs Loser M2)
      if (m4 && isDuelMatch(m4)) {
        expect(m4.round).toBe(2);
        expect(m4.position).toBe(2);
        expect(m4.slotA).toEqual({ kind: 'loser-of', matchId: 'BG-G1-R1-M1' });
        expect(m4.slotB).toEqual({ kind: 'loser-of', matchId: 'BG-G1-R1-M2' });
      }

      // Round 3 Decider Match (Loser M3 vs Winner M4)
      if (m5 && isDuelMatch(m5)) {
        expect(m5.round).toBe(3);
        expect(m5.position).toBe(1);
        expect(m5.slotA).toEqual({ kind: 'loser-of', matchId: 'BG-G1-R2-M1' });
        expect(m5.slotB).toEqual({ kind: 'winner-of', matchId: 'BG-G1-R2-M2' });
      }
    });

    it('supports custom idPrefix', () => {
      const matches = generateBracketGroups(entrants, { idPrefix: 'STAGE1' });
      expect(matches[0]?.id).toBe('STAGE1-G1-R1-M1');
      if (matches[2] && isDuelMatch(matches[2])) {
        expect(matches[2].slotA).toEqual({ kind: 'winner-of', matchId: 'STAGE1-G1-R1-M1' });
      }
    });

    it('supports multi-match series with alternating homeSlot', () => {
      const matches = generateBracketGroups(entrants, {
        series: { span: 3 },
      });
      // 5 matches * 3 legs = 15 total games
      expect(matches).toHaveLength(15);
      expect(matches[0]?.id).toBe('BG-G1-R1-M1-1');
      expect(matches[1]?.id).toBe('BG-G1-R1-M1-2');
      expect(matches[2]?.id).toBe('BG-G1-R1-M1-3');
      if (matches[0] && isDuelMatch(matches[0])) expect(matches[0].homeSlot).toBe('A');
      if (matches[1] && isDuelMatch(matches[1])) expect(matches[1].homeSlot).toBe('B');
      if (matches[2] && isDuelMatch(matches[2])) expect(matches[2].homeSlot).toBe('A');
    });
  });

  describe('16-entrant 4-group bracket generation (cross-group boundary isolation)', () => {
    const entrants = Array.from({ length: 16 }, (_, i) => ({
      entrantId: `team-${i + 1}`,
      seed: i + 1,
    }));

    it('partitions entrants via snake seeding across 4 groups', () => {
      const matches = generateBracketGroups(entrants, {
        bracketGroups: { seedingMethod: 'snake' },
      });
      // 4 groups * 5 matches = 20 matches
      expect(matches).toHaveLength(20);

      // Group 1: seeds 1, 8, 9, 16
      const g1m1 = matches.find((m) => m.id === 'BG-G1-R1-M1');
      const g1m2 = matches.find((m) => m.id === 'BG-G1-R1-M2');
      if (g1m1 && isDuelMatch(g1m1)) {
        expect(g1m1.slotA).toEqual({ kind: 'entrant', entrantId: 'team-1', seed: 1 });
        expect(g1m1.slotB).toEqual({ kind: 'entrant', entrantId: 'team-16', seed: 16 });
      }
      if (g1m2 && isDuelMatch(g1m2)) {
        expect(g1m2.slotA).toEqual({ kind: 'entrant', entrantId: 'team-8', seed: 8 });
        expect(g1m2.slotB).toEqual({ kind: 'entrant', entrantId: 'team-9', seed: 9 });
      }

      // Group 2: seeds 2, 7, 10, 15
      const g2m1 = matches.find((m) => m.id === 'BG-G2-R1-M1');
      const g2m2 = matches.find((m) => m.id === 'BG-G2-R1-M2');
      if (g2m1 && isDuelMatch(g2m1)) {
        expect(g2m1.slotA).toEqual({ kind: 'entrant', entrantId: 'team-2', seed: 2 });
        expect(g2m1.slotB).toEqual({ kind: 'entrant', entrantId: 'team-15', seed: 15 });
      }
      if (g2m2 && isDuelMatch(g2m2)) {
        expect(g2m2.slotA).toEqual({ kind: 'entrant', entrantId: 'team-7', seed: 7 });
        expect(g2m2.slotB).toEqual({ kind: 'entrant', entrantId: 'team-10', seed: 10 });
      }

      // Verify that advancement edges never cross group boundaries
      for (let g = 1; g <= 4; g++) {
        const groupMatches = matches.filter((m) => m.id.startsWith(`BG-G${g}-`));
        expect(groupMatches).toHaveLength(5);
        for (const gm of groupMatches) {
          if (isDuelMatch(gm)) {
            if (gm.slotA.kind === 'winner-of' || gm.slotA.kind === 'loser-of') {
              expect(gm.slotA.matchId.startsWith(`BG-G${g}-`)).toBe(true);
            }
            if (gm.slotB.kind === 'winner-of' || gm.slotB.kind === 'loser-of') {
              expect(gm.slotB.matchId.startsWith(`BG-G${g}-`)).toBe(true);
            }
          }
        }
      }
    });

    it('supports sequential seeding across groups', () => {
      const matches = generateBracketGroups(entrants, {
        bracketGroups: { seedingMethod: 'sequential' },
      });
      // Group 1 gets seeds 1, 2, 3, 4
      const g1m1 = matches.find((m) => m.id === 'BG-G1-R1-M1');
      const g1m2 = matches.find((m) => m.id === 'BG-G1-R1-M2');
      if (g1m1 && isDuelMatch(g1m1)) {
        expect(g1m1.slotA).toEqual({ kind: 'entrant', entrantId: 'team-1', seed: 1 });
        expect(g1m1.slotB).toEqual({ kind: 'entrant', entrantId: 'team-4', seed: 4 });
      }
      if (g1m2 && isDuelMatch(g1m2)) {
        expect(g1m2.slotA).toEqual({ kind: 'entrant', entrantId: 'team-2', seed: 2 });
        expect(g1m2.slotB).toEqual({ kind: 'entrant', entrantId: 'team-3', seed: 3 });
      }
    });
  });

  describe('advancement and qualification resolution', () => {
    const entrants = [
      { entrantId: 'A', seed: 1 },
      { entrantId: 'B', seed: 2 },
      { entrantId: 'C', seed: 3 },
      { entrantId: 'D', seed: 4 },
    ];
    const matches = generateBracketGroups(entrants);

    it('resolves group progression step by step until top 2 qualify', () => {
      // Step 1: Opening matches played
      // M1 (A vs D): A wins, D loses
      // M2 (B vs C): B wins, C loses
      const round1Outcomes: RecordedOutcome[] = [
        {
          matchId: 'BG-G1-R1-M1',
          sides: [
            { entrantId: 'A', statistics: {} },
            { entrantId: 'D', statistics: {} },
          ],
          winnerEntrantId: 'A',
        },
        {
          matchId: 'BG-G1-R1-M2',
          sides: [
            { entrantId: 'B', statistics: {} },
            { entrantId: 'C', statistics: {} },
          ],
          winnerEntrantId: 'B',
        },
      ];

      let qual = resolveBracketGroupAdvancement(matches, round1Outcomes);
      expect(qual).toHaveLength(1);
      expect(qual[0]?.fullyResolved).toBe(false);
      expect(qual[0]?.winnerId).toBeUndefined();

      // Step 2: Round 2 played
      // M3 (Winners: A vs B): A wins (A qualifies 1st place!)
      // M4 (Elimination: D vs C): C wins, D loses (D eliminated 4th place!)
      const round2Outcomes: RecordedOutcome[] = [
        ...round1Outcomes,
        {
          matchId: 'BG-G1-R2-M1',
          sides: [
            { entrantId: 'A', statistics: {} },
            { entrantId: 'B', statistics: {} },
          ],
          winnerEntrantId: 'A',
        },
        {
          matchId: 'BG-G1-R2-M2',
          sides: [
            { entrantId: 'D', statistics: {} },
            { entrantId: 'C', statistics: {} },
          ],
          winnerEntrantId: 'C',
        },
      ];

      qual = resolveBracketGroupAdvancement(matches, round2Outcomes);
      expect(qual[0]?.winnerId).toBe('A');
      expect(qual[0]?.fourthPlaceId).toBe('D');
      expect(qual[0]?.runnerUpId).toBeUndefined();
      expect(qual[0]?.fullyResolved).toBe(false);

      // Step 3: Decider match played
      // M5 (Decider: loser of M3 [B] vs winner of M4 [C])
      // C wins against B (C qualifies 2nd place, B eliminated 3rd place!)
      const finalOutcomes: RecordedOutcome[] = [
        ...round2Outcomes,
        {
          matchId: 'BG-G1-R3-M1',
          sides: [
            { entrantId: 'B', statistics: {} },
            { entrantId: 'C', statistics: {} },
          ],
          winnerEntrantId: 'C',
        },
      ];

      qual = resolveBracketGroupAdvancement(matches, finalOutcomes);
      expect(qual[0]?.fullyResolved).toBe(true);
      expect(qual[0]?.winnerId).toBe('A');
      expect(qual[0]?.runnerUpId).toBe('C');
      expect(qual[0]?.thirdPlaceId).toBe('B');
      expect(qual[0]?.fourthPlaceId).toBe('D');
      expect(qual[0]?.qualified).toEqual(['A', 'C']);
      expect(qual[0]?.eliminated).toEqual(['B', 'D']);
    });

    it('resolves multiple groups independently for 16-entrant tournament', () => {
      const entrants16 = Array.from({ length: 16 }, (_, i) => ({
        entrantId: `team-${i + 1}`,
        seed: i + 1,
      }));
      const matches16 = generateBracketGroups(entrants16);

      // Group 1 has matches played, Group 2-4 pending
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'BG-G1-R1-M1',
          sides: [
            { entrantId: 'team-1', statistics: {} },
            { entrantId: 'team-16', statistics: {} },
          ],
          winnerEntrantId: 'team-1',
        },
        {
          matchId: 'BG-G1-R1-M2',
          sides: [
            { entrantId: 'team-8', statistics: {} },
            { entrantId: 'team-9', statistics: {} },
          ],
          winnerEntrantId: 'team-8',
        },
        {
          matchId: 'BG-G1-R2-M1',
          sides: [
            { entrantId: 'team-1', statistics: {} },
            { entrantId: 'team-8', statistics: {} },
          ],
          winnerEntrantId: 'team-1',
        },
        {
          matchId: 'BG-G1-R2-M2',
          sides: [
            { entrantId: 'team-16', statistics: {} },
            { entrantId: 'team-9', statistics: {} },
          ],
          winnerEntrantId: 'team-9',
        },
        {
          matchId: 'BG-G1-R3-M1',
          sides: [
            { entrantId: 'team-8', statistics: {} },
            { entrantId: 'team-9', statistics: {} },
          ],
          winnerEntrantId: 'team-8',
        },
      ];

      const quals = resolveBracketGroupAdvancement(matches16, outcomes);
      expect(quals).toHaveLength(4);
      expect(quals[0]?.fullyResolved).toBe(true);
      expect(quals[0]?.qualified).toEqual(['team-1', 'team-8']);
      expect(quals[0]?.eliminated).toEqual(['team-9', 'team-16']);
      expect(quals[1]?.fullyResolved).toBe(false);
      expect(quals[2]?.fullyResolved).toBe(false);
      expect(quals[3]?.fullyResolved).toBe(false);
    });
  });

  describe('generateFixtures & generateGroupedFixtures integration', () => {
    const entrants = [
      { entrantId: 'e1', seed: 1 },
      { entrantId: 'e2', seed: 2 },
      { entrantId: 'e3', seed: 3 },
      { entrantId: 'e4', seed: 4 },
    ];

    it('generates bracket-groups via generateFixtures entry point', () => {
      const res = generateFixtures({
        format: 'bracket-groups',
        entrants,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.format).toBe('bracket-groups');
        expect(res.value.entrantCount).toBe(4);
        expect(res.value.matches).toHaveLength(5);
        expect(res.value.rounds).toHaveLength(3);
      }
    });

    it('generates bracket-groups via generateGroupedFixtures', () => {
      const res = generateGroupedFixtures({
        stageId: 'stage-1',
        format: 'bracket-groups',
        groups: [
          {
            zoneId: 'zone-1',
            groupId: 'group-A',
            entrants,
          },
        ],
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toHaveLength(5);
        expect(res.value[0]?.stageId).toBe('stage-1');
        expect(res.value[0]?.groupId).toBe('group-A');
      }
    });

    it('asserts supported format and classifies correctly', () => {
      expect(assertSupportedFormat('bracket-groups').ok).toBe(true);
      expect(isBracketGroupsFormat('bracket-groups')).toBe(true);
      expect(isBracketGroupsFormat('single-elimination')).toBe(false);
      expect(isRoundRobinFormat('bracket-groups')).toBe(false);
      expect(isEliminationFormat('bracket-groups')).toBe(false);
    });
  });
});
