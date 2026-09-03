import { describe, expect, it } from '@jest/globals';
import type { RecordedOutcome } from '@copalibre/domain';
import { isPlacementFormat } from '@copalibre/domain';
import { resolveAdvancement, playableMatches } from '../advancement/index.js';
import { InvalidEntrantsError } from '../errors.js';
import {
  assertSupportedFormat,
  isBracketGroupsFormat,
  isCustomBracketFormat,
  isEliminationFormat,
  isFFABracketFormat,
  isGauntletFormat,
  isRoundRobinFormat,
  isSwissFormat,
} from '../formats.js';
import { generateFFABracketFixtures, generateFixtures } from './index.js';
import type { PlacementMatch, SeededEntrant } from '../types.js';

describe('FFA Elimination Brackets Format Support', () => {
  const entrants64: SeededEntrant[] = Array.from({ length: 64 }, (_, i) => ({
    entrantId: `player-${i + 1}`,
    seed: i + 1,
  }));

  describe('Scenario: 64-player Battle Royale bracket (4 lobbies of 16 -> 1 lobby of 16)', () => {
    it('generates 4 Round 1 matches and 1 Grand Final match', () => {
      const res = generateFixtures({
        format: 'ffa-bracket',
        entrants: entrants64,
        ffaBracket: {
          lobbySize: 16,
          advancingCount: 4,
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const { matches } = res.value;
      expect(matches).toHaveLength(5);

      // Round 1 has 4 matches (M1, M2, M3, M4)
      const r1Matches = matches.filter((m) => m.round === 1) as PlacementMatch[];
      expect(r1Matches).toHaveLength(4);

      for (let i = 0; i < 4; i++) {
        const m = r1Matches[i];
        expect(m).toBeDefined();
        if (!m) continue;
        expect(m.id).toBe(`FFA-R1-M${i + 1}`);
        expect(m.round).toBe(1);
        expect(m.position).toBe(i + 1);
        expect(m.shape).toBe('placement');
        expect(m.bracket).toBe('placement');
        expect(m.slots).toHaveLength(16);
        expect(m.slots.every((s) => s.kind === 'entrant')).toBe(true);
      }

      // Round 2 has 1 Grand Final match (M5)
      const r2Matches = matches.filter((m) => m.round === 2) as PlacementMatch[];
      expect(r2Matches).toHaveLength(1);

      const m5 = r2Matches[0];
      expect(m5).toBeDefined();
      if (!m5) continueTest();
      expect(m5.id).toBe('FFA-R2-M1');
      expect(m5.round).toBe(2);
      expect(m5.position).toBe(1);
      expect(m5.label).toBe('Grand Final');
      expect(m5.slots).toHaveLength(16);

      // Verify slots are sourced from top-4 of M1-M4
      for (let p = 1; p <= 4; p++) {
        const sourceMatchId = `FFA-R1-M${p}`;
        for (let rank = 1; rank <= 4; rank++) {
          const matchingSlot = m5.slots.find(
            (s) => s.kind === 'placement-top' && s.matchId === sourceMatchId && s.rank === rank,
          );
          expect(matchingSlot).toBeDefined();
        }
      }
    });
  });

  describe('Scenario: Anti-colocation slot distribution', () => {
    it('distributes advancing players across downstream lobbies evenly', () => {
      // 128 entrants with lobbySize 16 and advancingCount 4:
      // Round 1: 8 lobbies of 16 (M1..M8)
      // Round 2: 2 downstream matches (M1, M2 in R2, effectively 5th and 6th matches in sequence)
      const entrants128: SeededEntrant[] = Array.from({ length: 128 }, (_, i) => ({
        entrantId: `p-${i + 1}`,
        seed: i + 1,
      }));

      const matches = generateFFABracketFixtures('ffa-bracket', entrants128, {
        lobbySize: 16,
        advancingCount: 4,
      });

      // Round 2 matches: R2-M1 (M9) and R2-M2 (M10)
      const r2Matches = matches.filter((m) => m.round === 2);
      expect(r2Matches).toHaveLength(2);

      const m5 = r2Matches[0]; // First downstream match
      const m6 = r2Matches[1]; // Second downstream match
      expect(m5).toBeDefined();
      expect(m6).toBeDefined();
      if (!m5 || !m6) return;

      // Check M1's top-4 distribution:
      // Rank 1 and 3 mapped to M5; Rank 2 and 4 mapped to M6
      const m1Rank1InM5 = m5.slots.some(
        (s) => s.kind === 'placement-top' && s.matchId === 'FFA-R1-M1' && s.rank === 1,
      );
      const m1Rank3InM5 = m5.slots.some(
        (s) => s.kind === 'placement-top' && s.matchId === 'FFA-R1-M1' && s.rank === 3,
      );
      const m1Rank2InM6 = m6.slots.some(
        (s) => s.kind === 'placement-top' && s.matchId === 'FFA-R1-M1' && s.rank === 2,
      );
      const m1Rank4InM6 = m6.slots.some(
        (s) => s.kind === 'placement-top' && s.matchId === 'FFA-R1-M1' && s.rank === 4,
      );

      expect(m1Rank1InM5).toBe(true);
      expect(m1Rank3InM5).toBe(true);
      expect(m1Rank2InM6).toBe(true);
      expect(m1Rank4InM6).toBe(true);
    });
  });

  describe('Scenario: FFA placement advancement from Round 1 into Round 2 upon match finalization', () => {
    it('resolves placement-top slots once round 1 outcomes are recorded', () => {
      const res = generateFixtures({
        format: 'ffa-bracket',
        entrants: entrants64,
        ffaBracket: {
          lobbySize: 16,
          advancingCount: 4,
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const graph = res.value;

      // Before any results: Round 1 matches are playable, Grand Final is pending
      const initialPlayable = playableMatches(graph, []);
      expect(initialPlayable).toEqual(['FFA-R1-M1', 'FFA-R1-M2', 'FFA-R1-M3', 'FFA-R1-M4']);

      const initialResolved = resolveAdvancement(graph, []);
      const gfInitial = initialResolved.find((m) => m.matchId === 'FFA-R2-M1');
      expect(gfInitial?.playable).toBe(false);
      expect(gfInitial?.slots?.every((s) => s.state === 'pending')).toBe(true);

      // Record outcomes for R1-M1..R1-M4:
      // In each match, entrants at index 0..15 place 1..16
      const outcomes: RecordedOutcome[] = [1, 2, 3, 4].map((matchNum) => {
        const match = graph.matches.find((m) => m.id === `FFA-R1-M${matchNum}`) as PlacementMatch;
        const sides = match.slots.map((s, idx) => ({
          entrantId: (s as { entrantId: string }).entrantId,
          statistics: { score: 100 - idx },
          placement: idx + 1,
        }));
        return {
          matchId: match.id,
          sides,
          winnerEntrantId: sides[0]?.entrantId,
        };
      });

      const afterResolved = resolveAdvancement(graph, outcomes);
      const gfAfter = afterResolved.find((m) => m.matchId === 'FFA-R2-M1');
      expect(gfAfter?.playable).toBe(true);
      expect(gfAfter?.slots).toHaveLength(16);

      // Every slot in Grand Final is now an entrant
      expect(gfAfter?.slots?.every((s) => s.state === 'entrant')).toBe(true);

      // The advancing entrants must be the rank 1..4 finishers from each match
      const expectedEntrantIds = new Set<string>();
      for (const out of outcomes) {
        for (let r = 0; r < 4; r++) {
          const entrantId = out.sides[r]?.entrantId;
          if (entrantId) expectedEntrantIds.add(entrantId);
        }
      }
      expect(expectedEntrantIds.size).toBe(16);

      const actualEntrantIds = new Set(
        gfAfter?.slots?.map((s) => (s as { entrantId: string }).entrantId),
      );
      expect(actualEntrantIds).toEqual(expectedEntrantIds);
    });
  });

  describe('FFA Bracket Groups & Thresholds', () => {
    it('generates independent FFA bracket groups feeding a Grand Final lobby', () => {
      const entrants32 = entrants64.slice(0, 32);
      const matches = generateFFABracketFixtures('ffa-bracket-groups', entrants32, {
        lobbySize: 8,
        advancingCount: 2,
        groupCount: 2,
      });

      // Group 1 matches, Group 2 matches, and Grand Final
      const g1Matches = matches.filter((m) => m.id.startsWith('FFA-G1-'));
      const g2Matches = matches.filter((m) => m.id.startsWith('FFA-G2-'));
      const gfMatch = matches.find((m) => m.id === 'FFA-GF-R1-M1');

      expect(g1Matches.length).toBeGreaterThan(0);
      expect(g2Matches.length).toBeGreaterThan(0);
      expect(gfMatch).toBeDefined();
      expect(gfMatch?.slots).toHaveLength(4); // 2 qualifiers from G1 + 2 qualifiers from G2
    });

    it('honors thresholdFinalists to truncate early into a final lobby', () => {
      // 32 entrants, lobbySize 8, advancingCount 4, thresholdFinalists: 8
      // Round 1: 4 lobbies of 8 -> 16 advancing
      // With thresholdFinalists = 16, round 2 is directly 1 lobby of 16
      const entrants32 = entrants64.slice(0, 32);
      const matches = generateFFABracketFixtures('ffa-bracket', entrants32, {
        lobbySize: 8,
        advancingCount: 4,
        thresholdFinalists: 16,
      });

      const r2Matches = matches.filter((m) => m.round === 2);
      expect(r2Matches).toHaveLength(1);
      expect(r2Matches[0]?.label).toBe('Grand Final');
    });
  });

  describe('Validation and format allowlist', () => {
    it('rejects fewer than 2 entrants', () => {
      expect(() =>
        generateFFABracketFixtures('ffa-bracket', [{ entrantId: 'e1', seed: 1 }]),
      ).toThrow(InvalidEntrantsError);
    });

    it('rejects lobbySize less than 2', () => {
      expect(() =>
        generateFFABracketFixtures('ffa-bracket', entrants64.slice(0, 4), { lobbySize: 1 }),
      ).toThrow(InvalidEntrantsError);
    });

    it('rejects advancingCount >= lobbySize', () => {
      expect(() =>
        generateFFABracketFixtures('ffa-bracket', entrants64.slice(0, 8), {
          lobbySize: 4,
          advancingCount: 4,
        }),
      ).toThrow(InvalidEntrantsError);
    });

    it('rejects advancingCount < 1', () => {
      expect(() =>
        generateFFABracketFixtures('ffa-bracket', entrants64.slice(0, 8), {
          lobbySize: 4,
          advancingCount: 0,
        }),
      ).toThrow(InvalidEntrantsError);
    });

    it('generates with default options for 64 entrants and small entrant counts', () => {
      const def64 = generateFFABracketFixtures('ffa-bracket', entrants64);
      expect(def64.length).toBeGreaterThan(0);

      const def4 = generateFFABracketFixtures('ffa-bracket', entrants64.slice(0, 4));
      expect(def4.length).toBeGreaterThan(0);

      // Entrants <= lobbySize produces a single Grand Final lobby directly
      const singleLobby = generateFFABracketFixtures('ffa-bracket', entrants64.slice(0, 8), {
        lobbySize: 16,
      });
      expect(singleLobby).toHaveLength(1);
      expect(singleLobby[0]?.label).toBe('Grand Final');
    });

    it('resolves placement-top when placement field is omitted on sides', () => {
      const fixtures = generateFFABracketFixtures('ffa-bracket', entrants64.slice(0, 8), {
        lobbySize: 4,
        advancingCount: 2,
      });
      const graph = {
        format: 'ffa-bracket' as const,
        entrantCount: 8,
        matches: fixtures,
        rounds: [],
      };

      // Outcomes without explicit placement field (order in sides determines rank)
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'FFA-R1-M1',
          sides: [
            { entrantId: 'p1', statistics: {} },
            { entrantId: 'p2', statistics: {} },
          ],
        },
        {
          matchId: 'FFA-R1-M2',
          sides: [
            { entrantId: 'p3', statistics: {} },
            { entrantId: 'p4', statistics: {} },
          ],
        },
      ];

      const resolved = resolveAdvancement(graph, outcomes);
      const final = resolved.find((m) => m.matchId === 'FFA-R2-M1');
      expect(final?.playable).toBe(true);
      expect(final?.slots?.[0]).toEqual({ state: 'entrant', entrantId: 'p1' });
    });

    it('resolves placement-top to empty if rank exceeds sides length', () => {
      const graph = {
        format: 'ffa-bracket' as const,
        entrantCount: 4,
        matches: [
          {
            id: 'M1',
            shape: 'placement' as const,
            bracket: 'placement' as const,
            round: 1,
            position: 1,
            slots: [],
          },
          {
            id: 'M2',
            shape: 'placement' as const,
            bracket: 'placement' as const,
            round: 2,
            position: 1,
            slots: [{ kind: 'placement-top' as const, matchId: 'M1', rank: 99 }],
          },
        ],
        rounds: [],
      };

      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'M1',
          sides: [{ entrantId: 'p1', statistics: {}, placement: 1 }],
        },
      ];

      const resolved = resolveAdvancement(graph, outcomes);
      const m2 = resolved.find((m) => m.matchId === 'M2');
      expect(m2?.slots?.[0]).toEqual({ state: 'empty' });
    });

    it('handles cyclic placement-top dependencies by returning pending', () => {
      const graph = {
        format: 'ffa-bracket' as const,
        entrantCount: 4,
        matches: [
          {
            id: 'M1',
            shape: 'placement' as const,
            bracket: 'placement' as const,
            round: 1,
            position: 1,
            slots: [{ kind: 'placement-top' as const, matchId: 'M2', rank: 1 }],
          },
          {
            id: 'M2',
            shape: 'placement' as const,
            bracket: 'placement' as const,
            round: 1,
            position: 2,
            slots: [{ kind: 'placement-top' as const, matchId: 'M1', rank: 1 }],
          },
        ],
        rounds: [],
      };

      const resolved = resolveAdvancement(graph, []);
      expect(resolved[0]?.slots?.[0]).toEqual({ state: 'pending' });
    });

    it('format predicates classify ffa-bracket correctly', () => {
      expect(assertSupportedFormat('ffa-bracket').ok).toBe(true);
      expect(assertSupportedFormat('ffa-bracket-groups').ok).toBe(true);
      expect(isFFABracketFormat('ffa-bracket')).toBe(true);
      expect(isFFABracketFormat('ffa-bracket-groups')).toBe(true);
      expect(isFFABracketFormat('single-elimination')).toBe(false);
      expect(isPlacementFormat('ffa-bracket')).toBe(true);
      expect(isPlacementFormat('ffa-bracket-groups')).toBe(true);
      expect(isEliminationFormat('ffa-bracket')).toBe(false);
      expect(isRoundRobinFormat('ffa-bracket')).toBe(false);
      expect(isSwissFormat('ffa-bracket')).toBe(false);
      expect(isGauntletFormat('ffa-bracket')).toBe(false);
      expect(isBracketGroupsFormat('ffa-bracket')).toBe(false);
      expect(isCustomBracketFormat('ffa-bracket')).toBe(false);
    });
  });
});

function continueTest(): never {
  throw new Error('Test continuation failed');
}
