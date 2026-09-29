import {
  DEFAULT_PREVIEW_ENTRANT_COUNT,
  derivePreviewEntrantCount,
  derivePreviewPlaceholders,
  generatePreviewEntrants,
  generatePreviewMatches,
  generatePreviewNames,
  isIllustrativePreview,
  mapFixtureGraphToCanvasMatches,
} from './lib/wizard-preview.js';
import type { FixtureGraph } from '@copalibre/tournament-engine';

describe('wizard-preview', () => {
  describe('derivePreviewEntrantCount', () => {
    it('returns default count (8) when capacity is unset', () => {
      expect(derivePreviewEntrantCount(undefined)).toBe(DEFAULT_PREVIEW_ENTRANT_COUNT);
    });

    it('returns declared capacity when valid and at least 2', () => {
      expect(derivePreviewEntrantCount(16)).toBe(16);
      expect(derivePreviewEntrantCount(4)).toBe(4);
      expect(derivePreviewEntrantCount(64)).toBe(64);
    });

    it('falls back to default (8) for invalid or sub-minimum capacities', () => {
      expect(derivePreviewEntrantCount(0)).toBe(DEFAULT_PREVIEW_ENTRANT_COUNT);
      expect(derivePreviewEntrantCount(1)).toBe(DEFAULT_PREVIEW_ENTRANT_COUNT);
      expect(derivePreviewEntrantCount(-4)).toBe(DEFAULT_PREVIEW_ENTRANT_COUNT);
      expect(derivePreviewEntrantCount(Number.NaN)).toBe(DEFAULT_PREVIEW_ENTRANT_COUNT);
    });

    it('floors non-integer capacities', () => {
      expect(derivePreviewEntrantCount(12.7)).toBe(12);
    });
  });

  describe('generatePreviewEntrants', () => {
    it('generates synthetic seeded entrants with 1-based seeds and preview ids', () => {
      const entrants = generatePreviewEntrants(4);
      expect(entrants).toEqual([
        { entrantId: 'preview-1', seed: 1 },
        { entrantId: 'preview-2', seed: 2 },
        { entrantId: 'preview-3', seed: 3 },
        { entrantId: 'preview-4', seed: 4 },
      ]);
    });

    it('falls back to default count (8) if given count < 2', () => {
      const entrants = generatePreviewEntrants(1);
      expect(entrants).toHaveLength(DEFAULT_PREVIEW_ENTRANT_COUNT);
      expect(entrants[0]).toEqual({ entrantId: 'preview-1', seed: 1 });
      expect(entrants[7]).toEqual({ entrantId: 'preview-8', seed: 8 });
    });
  });

  describe('derivePreviewPlaceholders', () => {
    it('generates default 8 synthetic entrants when capacity is undefined', () => {
      const entrants = derivePreviewPlaceholders(undefined);
      expect(entrants).toHaveLength(8);
      expect(entrants.map((e) => e.entrantId)).toEqual([
        'preview-1',
        'preview-2',
        'preview-3',
        'preview-4',
        'preview-5',
        'preview-6',
        'preview-7',
        'preview-8',
      ]);
    });

    it('generates N synthetic entrants when capacity is set', () => {
      const entrants = derivePreviewPlaceholders(6);
      expect(entrants).toHaveLength(6);
      expect(entrants[5]).toEqual({ entrantId: 'preview-6', seed: 6 });
    });
  });

  describe('isIllustrativePreview', () => {
    it('returns true when capacity is unset or invalid', () => {
      expect(isIllustrativePreview(undefined)).toBe(true);
      expect(isIllustrativePreview(0)).toBe(true);
      expect(isIllustrativePreview(1)).toBe(true);
    });

    it('returns false when capacity is declared and valid', () => {
      expect(isIllustrativePreview(8)).toBe(false);
      expect(isIllustrativePreview(16)).toBe(false);
      expect(isIllustrativePreview(32)).toBe(false);
    });
  });

  describe('generatePreviewNames', () => {
    it('creates a dictionary mapping preview ids to display seed labels', () => {
      const entrants = generatePreviewEntrants(3);
      expect(generatePreviewNames(entrants)).toEqual({
        'preview-1': 'Seed 1',
        'preview-2': 'Seed 2',
        'preview-3': 'Seed 3',
      });
    });
  });

  describe('generatePreviewMatches', () => {
    it('returns empty array when format is undefined or empty', () => {
      const entrants = generatePreviewEntrants(8);
      expect(generatePreviewMatches(undefined, entrants)).toEqual([]);
      expect(generatePreviewMatches('', entrants)).toEqual([]);
    });

    it('returns empty array when format is unrecognized', () => {
      const entrants = generatePreviewEntrants(8);
      expect(generatePreviewMatches('non-existent-format', entrants)).toEqual([]);
    });

    it('generates expected structure for single-elimination with default 8 entrants', () => {
      const entrants = generatePreviewEntrants(8);
      const matches = generatePreviewMatches('single-elimination', entrants);

      // 8-team single elimination has 4 + 2 + 1 = 7 matches
      expect(matches).toHaveLength(7);
      expect(matches.every((m) => m.bracket === 'winners')).toBe(true);
      expect(matches.every((m) => m.status === 'scheduled')).toBe(true);

      const round1 = matches.filter((m) => m.round === 1);
      expect(round1).toHaveLength(4);
      expect(round1[0].slots).toEqual([
        { kind: 'entrant', entrantId: 'preview-1' },
        { kind: 'entrant', entrantId: 'preview-8' },
      ]);

      const round2 = matches.filter((m) => m.round === 2);
      expect(round2).toHaveLength(2);
      expect(round2[0].slots[0].kind).toBe('winner-of');

      const final = matches.find((m) => m.round === 3);
      expect(final).toBeDefined();
      expect(final?.slots[0].kind).toBe('winner-of');
      expect(final?.slots[1].kind).toBe('winner-of');
    });

    it('generates expected structure for double-elimination with default 8 entrants', () => {
      const entrants = generatePreviewEntrants(8);
      const matches = generatePreviewMatches('double-elimination', entrants);

      // 8-team double elimination has winners (7), losers (6), and grand finals (1 or 2)
      expect(matches.length).toBeGreaterThanOrEqual(14);

      const brackets = new Set(matches.map((m) => m.bracket));
      expect(brackets).toContain('winners');
      expect(brackets).toContain('losers');
      expect(brackets).toContain('grand-final');

      const losersMatches = matches.filter((m) => m.bracket === 'losers');
      expect(losersMatches.length).toBeGreaterThan(0);
      expect(losersMatches.some((m) => m.slots.some((s) => s.kind === 'loser-of'))).toBe(true);
    });

    it('generates expected structure for round-robin with default 8 entrants', () => {
      const entrants = generatePreviewEntrants(8);
      const matches = generatePreviewMatches('round-robin', entrants);

      // 8-team single-leg round-robin has 8 * 7 / 2 = 28 matches
      expect(matches).toHaveLength(28);
      expect(matches.every((m) => m.bracket === 'round-robin')).toBe(true);
      expect(matches.every((m) => m.slots.length === 2)).toBe(true);
      expect(
        matches.every((m) => m.slots[0].kind === 'entrant' && m.slots[1].kind === 'entrant'),
      ).toBe(true);
    });

    it('scales match count when capacity is set to 4 entrants for single-elimination', () => {
      const entrants = derivePreviewPlaceholders(4);
      const matches = generatePreviewMatches('single-elimination', entrants);

      // 4-team single elimination has 2 + 1 = 3 matches
      expect(matches).toHaveLength(3);
    });
  });

  describe('mapFixtureGraphToCanvasMatches', () => {
    it('maps all slot kinds properly', () => {
      const syntheticGraph: FixtureGraph = {
        format: 'single-elimination',
        entrantCount: 4,
        rounds: [],
        matches: [
          {
            id: 'M-1',
            bracket: 'winners',
            round: 1,
            position: 1,
            shape: 'duel',
            slotA: { kind: 'entrant', entrantId: 'preview-1', seed: 1 },
            slotB: { kind: 'bye' },
          },
          {
            id: 'M-2',
            bracket: 'winners',
            round: 2,
            position: 1,
            shape: 'duel',
            slotA: { kind: 'winner-of', matchId: 'M-1' },
            slotB: { kind: 'loser-of', matchId: 'M-3' },
          },
          {
            id: 'M-3',
            bracket: 'placement',
            round: 1,
            position: 1,
            shape: 'duel',
            slotA: { kind: 'placement-top', matchId: 'M-1', rank: 1 },
            slotB: { kind: 'entrant', entrantId: 'preview-2', seed: 2 },
          },
        ],
      };

      const canvasMatches = mapFixtureGraphToCanvasMatches(syntheticGraph);
      expect(canvasMatches).toHaveLength(3);
      expect(canvasMatches[0].slots).toEqual([
        { kind: 'entrant', entrantId: 'preview-1' },
        { kind: 'bye' },
      ]);
      expect(canvasMatches[1].slots).toEqual([
        { kind: 'winner-of', matchId: 'M-1' },
        { kind: 'loser-of', matchId: 'M-3' },
      ]);
      expect(canvasMatches[2].slots).toEqual([
        { kind: 'winner-of', matchId: 'M-1' },
        { kind: 'entrant', entrantId: 'preview-2' },
      ]);
    });
  });
});
