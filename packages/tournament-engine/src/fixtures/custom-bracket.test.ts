import { describe, expect, it } from '@jest/globals';
import { resolveAdvancement } from '../advancement/index.js';
import { CyclicFixtureGraphError, InvalidCustomBracketError } from '../errors.js';
import {
  assertSupportedFormat,
  isBracketGroupsFormat,
  isCustomBracketFormat,
  isEliminationFormat,
  isGauntletFormat,
  isRoundRobinFormat,
  isSwissFormat,
} from '../formats.js';
import { generateCustomBracketFixtures, generateFixtures, validateCustomBracket } from './index.js';
import type { CustomBracketDefinition, DuelMatch, SeededEntrant } from '../types.js';

describe('Custom Bracket (Declarative DAG) Format', () => {
  const entrants8: SeededEntrant[] = [
    { entrantId: 'e1', seed: 1 },
    { entrantId: 'e2', seed: 2 },
    { entrantId: 'e3', seed: 3 },
    { entrantId: 'e4', seed: 4 },
    { entrantId: 'e5', seed: 5 },
    { entrantId: 'e6', seed: 6 },
    { entrantId: 'e7', seed: 7 },
    { entrantId: 'e8', seed: 8 },
  ];

  describe('Scenario 1: Valid custom DAG generates cleanly', () => {
    const valid7MatchDef: CustomBracketDefinition = {
      matches: [
        // Round 1
        {
          id: 'CB-R1-M1',
          round: 1,
          position: 1,
          label: 'Quarterfinal 1',
          branch: 'winners',
          slotA: { kind: 'entrant', seed: 1 },
          slotB: { kind: 'entrant', seed: 8 },
        },
        {
          id: 'CB-R1-M2',
          round: 1,
          position: 2,
          label: 'Quarterfinal 2',
          branch: 'winners',
          slotA: { kind: 'entrant', seed: 4 },
          slotB: { kind: 'entrant', seed: 5 },
        },
        {
          id: 'CB-R1-M3',
          round: 1,
          position: 3,
          label: 'Quarterfinal 3',
          branch: 'winners',
          slotA: { kind: 'entrant', seed: 2 },
          slotB: { kind: 'entrant', seed: 7 },
        },
        {
          id: 'CB-R1-M4',
          round: 1,
          position: 4,
          label: 'Quarterfinal 4',
          branch: 'winners',
          slotA: { kind: 'entrant', seed: 3 },
          slotB: { kind: 'entrant', seed: 6 },
        },
        // Round 2: Upper semifinal & consolation matches
        {
          id: 'CB-R2-M1',
          round: 2,
          position: 1,
          label: 'Upper Semifinal 1',
          branch: 'winners',
          slotA: { kind: 'winner-of', matchId: 'CB-R1-M1' },
          slotB: { kind: 'winner-of', matchId: 'CB-R1-M2' },
        },
        {
          id: 'CB-R2-M2',
          round: 2,
          position: 2,
          label: 'Consolation Semifinal 1',
          branch: 'consolation',
          slotA: { kind: 'loser-of', matchId: 'CB-R1-M1' },
          slotB: { kind: 'loser-of', matchId: 'CB-R1-M2' },
        },
        {
          id: 'CB-R2-M3',
          round: 2,
          position: 3,
          label: 'Consolation Semifinal 2',
          branch: 'consolation',
          slotA: { kind: 'loser-of', matchId: 'CB-R1-M3' },
          slotB: { kind: 'loser-of', matchId: 'CB-R1-M4' },
        },
      ],
    };

    it('generates 7 matches with exact round, position, label, and branch metadata', () => {
      const res = generateFixtures({
        format: 'custom-bracket',
        entrants: entrants8,
        customBracket: valid7MatchDef,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value.format).toBe('custom-bracket');
      expect(res.value.entrantCount).toBe(8);
      expect(res.value.matches).toHaveLength(7);

      const m1 = res.value.matches[0] as DuelMatch;
      expect(m1.id).toBe('CB-R1-M1');
      expect(m1.round).toBe(1);
      expect(m1.position).toBe(1);
      expect(m1.label).toBe('Quarterfinal 1');
      expect(m1.branch).toBe('winners');
      expect(m1.bracket).toBe('winners');
      expect(m1.slotA).toEqual({ kind: 'entrant', entrantId: 'e1', seed: 1 });
      expect(m1.slotB).toEqual({ kind: 'entrant', entrantId: 'e8', seed: 8 });

      const m6 = res.value.matches[5] as DuelMatch;
      expect(m6.id).toBe('CB-R2-M2');
      expect(m6.round).toBe(2);
      expect(m6.position).toBe(2);
      expect(m6.label).toBe('Consolation Semifinal 1');
      expect(m6.branch).toBe('consolation');
      expect(m6.bracket).toBe('custom');
      expect(m6.slotA).toEqual({ kind: 'loser-of', matchId: 'CB-R1-M1' });
      expect(m6.slotB).toEqual({ kind: 'loser-of', matchId: 'CB-R1-M2' });
    });

    it('resolves advancement edges upon match completion per declared links', () => {
      // Record outcomes for Round 1:
      // M1: e1 beats e8
      // M2: e4 beats e5
      const outcomes = [
        {
          matchId: 'CB-R1-M1',
          sides: [
            { entrantId: 'e1', statistics: {} },
            { entrantId: 'e8', statistics: {} },
          ],
          winnerEntrantId: 'e1',
        },
        {
          matchId: 'CB-R1-M2',
          sides: [
            { entrantId: 'e4', statistics: {} },
            { entrantId: 'e5', statistics: {} },
          ],
          winnerEntrantId: 'e4',
        },
      ];

      const res = generateFixtures({
        format: 'custom-bracket',
        entrants: entrants8,
        customBracket: valid7MatchDef,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const resolved = resolveAdvancement(res.value, outcomes);

      // CB-R2-M1: winner of M1 (e1) vs winner of M2 (e4)
      const r2m1 = resolved.find((m) => m.matchId === 'CB-R2-M1');
      expect(r2m1?.slotA).toEqual({ state: 'entrant', entrantId: 'e1' });
      expect(r2m1?.slotB).toEqual({ state: 'entrant', entrantId: 'e4' });

      // CB-R2-M2: loser of M1 (e8) vs loser of M2 (e5)
      const r2m2 = resolved.find((m) => m.matchId === 'CB-R2-M2');
      expect(r2m2?.slotA).toEqual({ state: 'entrant', entrantId: 'e8' });
      expect(r2m2?.slotB).toEqual({ state: 'entrant', entrantId: 'e5' });

      // CB-R2-M3: M3 and M4 not played yet, so both slots pending
      const r2m3 = resolved.find((m) => m.matchId === 'CB-R2-M3');
      expect(r2m3?.slotA).toEqual({ state: 'pending' });
      expect(r2m3?.slotB).toEqual({ state: 'pending' });
    });
  });

  describe('Scenario 2: Cyclic reference is rejected', () => {
    it('rejects mutual cycle (A -> B and B -> A) with CyclicFixtureGraphError', () => {
      const cyclicDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'Match-A',
            round: 1,
            position: 1,
            slotA: { kind: 'winner-of', matchId: 'Match-B' },
            slotB: { kind: 'entrant', seed: 1 },
          },
          {
            id: 'Match-B',
            round: 1,
            position: 2,
            slotA: { kind: 'winner-of', matchId: 'Match-A' },
            slotB: { kind: 'entrant', seed: 2 },
          },
        ],
      };

      expect(() =>
        generateFixtures({
          format: 'custom-bracket',
          entrants: entrants8,
          customBracket: cyclicDef,
        }),
      ).toThrow(CyclicFixtureGraphError);

      expect(() => validateCustomBracket(entrants8, cyclicDef)).toThrow(CyclicFixtureGraphError);
    });

    it('rejects self-referential cycle (A -> A) with CyclicFixtureGraphError', () => {
      const selfDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'Match-Self',
            round: 1,
            position: 1,
            slotA: { kind: 'winner-of', matchId: 'Match-Self' },
            slotB: { kind: 'entrant', seed: 1 },
          },
        ],
      };

      expect(() => validateCustomBracket(entrants8, selfDef)).toThrow(CyclicFixtureGraphError);
    });

    it('rejects multi-node cycle (A -> B -> C -> A)', () => {
      const multiCycleDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'M1',
            round: 1,
            position: 1,
            slotA: { kind: 'winner-of', matchId: 'M3' },
            slotB: { kind: 'entrant', seed: 1 },
          },
          {
            id: 'M2',
            round: 1,
            position: 2,
            slotA: { kind: 'winner-of', matchId: 'M1' },
            slotB: { kind: 'entrant', seed: 2 },
          },
          {
            id: 'M3',
            round: 1,
            position: 3,
            slotA: { kind: 'winner-of', matchId: 'M2' },
            slotB: { kind: 'entrant', seed: 3 },
          },
        ],
      };

      expect(() => validateCustomBracket(entrants8, multiCycleDef)).toThrow(
        CyclicFixtureGraphError,
      );
    });
  });

  describe('Referential integrity and seed validation', () => {
    it('rejects out-of-bounds seed reference (seed > entrantCount)', () => {
      const oobDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'M1',
            round: 1,
            position: 1,
            slotA: { kind: 'entrant', seed: 9 }, // Only 8 entrants!
            slotB: { kind: 'entrant', seed: 2 },
          },
        ],
      };

      expect(() => validateCustomBracket(entrants8, oobDef)).toThrow(InvalidCustomBracketError);
      expect(() => validateCustomBracket(entrants8, oobDef)).toThrow(/out of bounds/);
    });

    it('rejects out-of-bounds seed reference (seed < 1)', () => {
      const oobDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'M1',
            round: 1,
            position: 1,
            slotA: { kind: 'entrant', seed: 0 },
            slotB: { kind: 'entrant', seed: 2 },
          },
        ],
      };

      expect(() => validateCustomBracket(entrants8, oobDef)).toThrow(InvalidCustomBracketError);
    });

    it('rejects non-existent matchId reference', () => {
      const ghostDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'M1',
            round: 1,
            position: 1,
            slotA: { kind: 'winner-of', matchId: 'DOES_NOT_EXIST' },
            slotB: { kind: 'entrant', seed: 1 },
          },
        ],
      };

      expect(() => validateCustomBracket(entrants8, ghostDef)).toThrow(InvalidCustomBracketError);
      expect(() => validateCustomBracket(entrants8, ghostDef)).toThrow(/does not exist/);
    });

    it('rejects match referencing a future round target', () => {
      const futureDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'M1',
            round: 1,
            position: 1,
            slotA: { kind: 'winner-of', matchId: 'M2' }, // M2 is in Round 2!
            slotB: { kind: 'entrant', seed: 1 },
          },
          {
            id: 'M2',
            round: 2,
            position: 1,
            slotA: { kind: 'entrant', seed: 2 },
            slotB: { kind: 'entrant', seed: 3 },
          },
        ],
      };

      expect(() => validateCustomBracket(entrants8, futureDef)).toThrow(InvalidCustomBracketError);
      expect(() => validateCustomBracket(entrants8, futureDef)).toThrow(
        /cannot be scheduled after/,
      );
    });

    it('rejects duplicate match IDs', () => {
      const dupDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'DUP-ID',
            round: 1,
            position: 1,
            slotA: { kind: 'entrant', seed: 1 },
            slotB: { kind: 'entrant', seed: 2 },
          },
          {
            id: 'DUP-ID',
            round: 1,
            position: 2,
            slotA: { kind: 'entrant', seed: 3 },
            slotB: { kind: 'entrant', seed: 4 },
          },
        ],
      };

      expect(() => validateCustomBracket(entrants8, dupDef)).toThrow(InvalidCustomBracketError);
      expect(() => validateCustomBracket(entrants8, dupDef)).toThrow(/Duplicate match identifier/);
    });

    it('rejects empty matches array', () => {
      expect(() => validateCustomBracket(entrants8, { matches: [] })).toThrow(
        InvalidCustomBracketError,
      );
    });

    it('rejects non-positive round or position', () => {
      expect(() =>
        validateCustomBracket(entrants8, {
          matches: [
            {
              id: 'M1',
              round: 0,
              position: 1,
              slotA: { kind: 'entrant', seed: 1 },
              slotB: { kind: 'entrant', seed: 2 },
            },
          ],
        }),
      ).toThrow(/positive integer round/);

      expect(() =>
        validateCustomBracket(entrants8, {
          matches: [
            {
              id: 'M1',
              round: 1,
              position: -1,
              slotA: { kind: 'entrant', seed: 1 },
              slotB: { kind: 'entrant', seed: 2 },
            },
          ],
        }),
      ).toThrow(/positive integer position/);
    });

    it('rejects custom-bracket format when customBracket input is missing', () => {
      expect(() =>
        generateFixtures({
          format: 'custom-bracket',
          entrants: entrants8,
        }),
      ).toThrow(InvalidCustomBracketError);
    });
  });

  describe('Byes, Series, and Bracket Predicates', () => {
    it('supports structural bye slots', () => {
      const byeDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'BYE-M1',
            round: 1,
            position: 1,
            slotA: { kind: 'entrant', seed: 1 },
            slotB: { kind: 'bye' },
          },
        ],
      };

      const matches = generateCustomBracketFixtures(entrants8, byeDef);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.slotB).toEqual({ kind: 'bye' });
    });

    it('supports multi-game series expansion (best-of-3)', () => {
      const seriesDef: CustomBracketDefinition = {
        matches: [
          {
            id: 'FINAL-M1',
            round: 1,
            position: 1,
            slotA: { kind: 'entrant', seed: 1 },
            slotB: { kind: 'entrant', seed: 2 },
            series: { span: 3 },
          },
        ],
      };

      const matches = generateCustomBracketFixtures(entrants8, seriesDef);
      expect(matches).toHaveLength(3);
      expect(matches[0]?.id).toBe('FINAL-M1-1');
      expect(matches[0]?.matchNumber).toBe(1);
      expect(matches[0]?.homeSlot).toBe('A');

      expect(matches[1]?.id).toBe('FINAL-M1-2');
      expect(matches[1]?.matchNumber).toBe(2);
      expect(matches[1]?.homeSlot).toBe('B');

      expect(matches[2]?.id).toBe('FINAL-M1-3');
      expect(matches[2]?.matchNumber).toBe(3);
      expect(matches[2]?.homeSlot).toBe('A');
    });

    it('format predicate functions classify custom-bracket correctly', () => {
      expect(assertSupportedFormat('custom-bracket').ok).toBe(true);
      expect(isCustomBracketFormat('custom-bracket')).toBe(true);
      expect(isCustomBracketFormat('single-elimination')).toBe(false);
      expect(isEliminationFormat('custom-bracket')).toBe(false);
      expect(isRoundRobinFormat('custom-bracket')).toBe(false);
      expect(isSwissFormat('custom-bracket')).toBe(false);
      expect(isGauntletFormat('custom-bracket')).toBe(false);
      expect(isBracketGroupsFormat('custom-bracket')).toBe(false);
    });
  });
});
