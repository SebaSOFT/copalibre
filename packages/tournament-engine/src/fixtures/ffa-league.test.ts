import { describe, expect, it } from '@jest/globals';
import {
  battleRoyaleDescriptor,
  isPlacementFormat,
  type DisciplineDescriptor,
  type RecordedOutcome,
} from '@copalibre/domain';
import { InvalidEntrantsError, UnsupportedFormatError } from '../errors.js';
import {
  assertSupportedFormat,
  isBracketGroupsFormat,
  isCustomBracketFormat,
  isEliminationFormat,
  isFFABracketFormat,
  isFFALeagueFormat,
  isGauntletFormat,
  isRoundRobinFormat,
  isSwissFormat,
} from '../formats.js';
import { computeAccounting } from '../standings/index.js';
import {
  generateFFALeagueFixtures,
  generateFixtures,
  generateGroupedFixtures,
} from './index.js';
import type { PlacementMatch, SeededEntrant } from '../types.js';

describe('FFA League Multi-Division Format Support', () => {
  const div1Entrants: SeededEntrant[] = Array.from({ length: 16 }, (_, i) => ({
    entrantId: `d1-player-${i + 1}`,
    seed: i + 1,
  }));

  const div2Entrants: SeededEntrant[] = Array.from({ length: 16 }, (_, i) => ({
    entrantId: `d2-player-${i + 1}`,
    seed: i + 17,
  }));

  const all32Entrants: SeededEntrant[] = [...div1Entrants, ...div2Entrants];

  const testDescriptor: DisciplineDescriptor = battleRoyaleDescriptor({
    descriptorId: 'br-desc',
    alias: 'battle-royale',
  });

  describe('Scenario: 32-player FFA League with 2 divisions of 16 across 5 game days', () => {
    it('generates 10 total placement matches (1 match per division per round)', () => {
      const res = generateFixtures({
        format: 'ffa-league',
        entrants: all32Entrants,
        ffaLeague: {
          rounds: 5,
          lobbySize: 16,
          divisions: [
            { divisionId: 'D1', name: 'Division 1', entrants: div1Entrants },
            { divisionId: 'D2', name: 'Division 2', entrants: div2Entrants },
          ],
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const { matches } = res.value;
      expect(matches).toHaveLength(10);

      // 5 matches for Division 1, 5 matches for Division 2
      const d1Matches = matches.filter((m) => m.id.startsWith('FFA-L-D1-'));
      const d2Matches = matches.filter((m) => m.id.startsWith('FFA-L-D2-'));

      expect(d1Matches).toHaveLength(5);
      expect(d2Matches).toHaveLength(5);

      for (let r = 1; r <= 5; r++) {
        const m1 = d1Matches.find((m) => m.round === r) as PlacementMatch;
        expect(m1).toBeDefined();
        expect(m1.id).toBe(`FFA-L-D1-R${r}-M1`);
        expect(m1.shape).toBe('placement');
        expect(m1.bracket).toBe('placement');
        expect(m1.position).toBe(1);
        expect(m1.slots).toHaveLength(16);
        expect(m1.slots.map((s) => (s as { entrantId: string }).entrantId)).toEqual(
          div1Entrants.map((e) => e.entrantId),
        );

        const m2 = d2Matches.find((m) => m.round === r) as PlacementMatch;
        expect(m2).toBeDefined();
        expect(m2.id).toBe(`FFA-L-D2-R${r}-M1`);
        expect(m2.shape).toBe('placement');
        expect(m2.bracket).toBe('placement');
        expect(m2.position).toBe(1);
        expect(m2.slots).toHaveLength(16);
        expect(m2.slots.map((s) => (s as { entrantId: string }).entrantId)).toEqual(
          div2Entrants.map((e) => e.entrantId),
        );
      }
    });

    it('computes cumulative placement and performance points independently per division across all 5 rounds', () => {
      // Build 5 rounds of outcomes for Division 1 and Division 2
      const d1Outcomes: RecordedOutcome[] = [];
      const d2Outcomes: RecordedOutcome[] = [];

      for (let r = 1; r <= 5; r++) {
        // In D1, d1-player-1 always gets 20 pts (placement 1), d1-player-2 gets 15 pts, etc.
        d1Outcomes.push({
          matchId: `FFA-L-D1-R${r}-M1`,
          sides: div1Entrants.map((e, idx) => ({
            entrantId: e.entrantId,
            statistics: { points: Math.max(1, 20 - idx) },
            placement: idx + 1,
          })),
          winnerEntrantId: 'd1-player-1',
        });

        // In D2, d2-player-16 always wins with 25 pts, d2-player-1 gets 10 pts, etc.
        d2Outcomes.push({
          matchId: `FFA-L-D2-R${r}-M1`,
          sides: div2Entrants.map((e, idx) => ({
            entrantId: e.entrantId,
            statistics: { points: idx === 15 ? 25 : 10 },
            placement: idx === 15 ? 1 : idx + 2,
          })),
          winnerEntrantId: 'd2-player-16',
        });
      }

      // Compute accounting for Division 1
      const d1EntrantIds = div1Entrants.map((e) => e.entrantId);
      const d1Accounting = computeAccounting(testDescriptor, d1EntrantIds, d1Outcomes);

      // d1-player-1 should have 20 * 5 = 100 points
      const d1WinnerRow = d1Accounting.find((row) => row.entrantId === 'd1-player-1');
      expect(d1WinnerRow).toBeDefined();
      expect(d1WinnerRow?.statistics.points).toBe(100);

      // Compute accounting for Division 2
      const d2EntrantIds = div2Entrants.map((e) => e.entrantId);
      const d2Accounting = computeAccounting(testDescriptor, d2EntrantIds, d2Outcomes);

      // d2-player-16 should have 25 * 5 = 125 points
      const d2WinnerRow = d2Accounting.find((row) => row.entrantId === 'd2-player-16');
      expect(d2WinnerRow).toBeDefined();
      expect(d2WinnerRow?.statistics.points).toBe(125);

      // Verify that Division 1 entrants do not appear in Division 2 accounting and vice-versa
      expect(d1Accounting.some((row) => row.entrantId.startsWith('d2-'))).toBe(false);
      expect(d2Accounting.some((row) => row.entrantId.startsWith('d1-'))).toBe(false);
    });
  });

  describe('Automatic division partitioning and multi-lobby rotation', () => {
    it('partitions entrants into divisions using divisionCount when divisions are omitted', () => {
      const res = generateFixtures({
        format: 'ffa-league',
        entrants: all32Entrants,
        ffaLeague: {
          rounds: 3,
          lobbySize: 16,
          divisionCount: 2,
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const { matches } = res.value;
      expect(matches).toHaveLength(6); // 2 divisions * 3 rounds = 6 matches

      const d1Matches = matches.filter((m) => m.id.startsWith('FFA-L-D1-'));
      const d2Matches = matches.filter((m) => m.id.startsWith('FFA-L-D2-'));
      expect(d1Matches).toHaveLength(3);
      expect(d2Matches).toHaveLength(3);
    });

    it('generates multiple lobbies per round when division entrants exceed lobbySize', () => {
      // 32 entrants in 1 division with lobbySize 16 and 2 rounds
      const matches = generateFFALeagueFixtures('ffa-league', all32Entrants, {
        rounds: 2,
        lobbySize: 16,
      });

      expect(matches).toHaveLength(4); // 2 lobbies * 2 rounds = 4 matches

      const r1Matches = matches.filter((m) => m.round === 1);
      const r2Matches = matches.filter((m) => m.round === 2);

      expect(r1Matches).toHaveLength(2);
      expect(r2Matches).toHaveLength(2);

      expect(r1Matches[0]?.id).toBe('FFA-L-D1-R1-M1');
      expect(r1Matches[1]?.id).toBe('FFA-L-D1-R1-M2');
      expect(r2Matches[0]?.id).toBe('FFA-L-D1-R2-M1');
      expect(r2Matches[1]?.id).toBe('FFA-L-D1-R2-M2');
    });

    it('integrates with generateGroupedFixtures', () => {
      const res = generateGroupedFixtures({
        stageId: 'stage-league',
        format: 'ffa-league',
        groups: [
          { zoneId: 'zone-1', groupId: 'div-1', entrants: div1Entrants },
          { zoneId: 'zone-1', groupId: 'div-2', entrants: div2Entrants },
        ],
        ffaLeague: {
          rounds: 2,
          lobbySize: 16,
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const scopedFixtures = res.value;
      expect(scopedFixtures).toHaveLength(4); // 2 matches for div-1 + 2 matches for div-2
      expect(scopedFixtures.filter((f) => f.groupId === 'div-1')).toHaveLength(2);
      expect(scopedFixtures.filter((f) => f.groupId === 'div-2')).toHaveLength(2);
    });
  });

  describe('Validation and allowlists', () => {
    it('rejects fewer than 2 entrants', () => {
      expect(() => generateFFALeagueFixtures('ffa-league', [{ entrantId: 'e1', seed: 1 }])).toThrow(
        InvalidEntrantsError,
      );
    });

    it('rejects division with 0 entrants', () => {
      expect(() =>
        generateFFALeagueFixtures('ffa-league', all32Entrants, {
          divisions: [
            { divisionId: 'D1', entrants: div1Entrants },
            { divisionId: 'D2', entrants: [] },
          ],
        }),
      ).toThrow(InvalidEntrantsError);
    });

    it('rejects invalid rounds or lobbySize', () => {
      expect(() => generateFFALeagueFixtures('ffa-league', all32Entrants, { rounds: 0 })).toThrow(
        InvalidEntrantsError,
      );

      expect(() =>
        generateFFALeagueFixtures('ffa-league', all32Entrants, { lobbySize: 1 }),
      ).toThrow(InvalidEntrantsError);
    });

    it('rejects series configuration for ffa-league', () => {
      const res = generateFixtures({
        format: 'ffa-league',
        entrants: all32Entrants,
        series: {
          span: 3,
          resolutionClass: 'best-of',
        },
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error).toBeInstanceOf(UnsupportedFormatError);
    });

    it('correctly classifies ffa-league in format predicates', () => {
      expect(assertSupportedFormat('ffa-league').ok).toBe(true);
      expect(isFFALeagueFormat('ffa-league')).toBe(true);
      expect(isFFALeagueFormat('league')).toBe(false);
      expect(isFFABracketFormat('ffa-league')).toBe(false);
      expect(isPlacementFormat('ffa-league')).toBe(true);
      expect(isEliminationFormat('ffa-league')).toBe(false);
      expect(isRoundRobinFormat('ffa-league')).toBe(false);
      expect(isSwissFormat('ffa-league')).toBe(false);
      expect(isGauntletFormat('ffa-league')).toBe(false);
      expect(isBracketGroupsFormat('ffa-league')).toBe(false);
      expect(isCustomBracketFormat('ffa-league')).toBe(false);
    });
  });
});
