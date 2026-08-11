import { describe, expect, it } from '@jest/globals';
import {
  isDirty,
  lockedSeeds,
  randomizeUnlocked,
  swapSeeds,
  toggleLock,
  type SeedAssignment,
} from './lib/seeding.js';
import {
  DEFAULT_GEOMETRY,
  layoutBracket,
  snap,
  zoomIn,
  zoomOut,
  type BracketLayout,
  type CanvasMatch,
  type LaidOutMatch,
} from './lib/bracket-canvas.js';
import { canRedo, canUndo, initHistory, push, redo, undo } from './lib/history.js';

const seeds: readonly SeedAssignment[] = [
  { seed: 1, entrantId: 'a', locked: true },
  { seed: 2, entrantId: 'b', locked: true },
  { seed: 3, entrantId: 'c', locked: false },
  { seed: 4, entrantId: 'd', locked: false },
  { seed: 5, entrantId: 'e', locked: false },
];

describe('randomizeUnlocked', () => {
  it('never moves a locked seed', () => {
    // Always picks index 0, which is the permutation most likely to expose a
    // shuffle that reaches outside the unlocked pool.
    const result = randomizeUnlocked(seeds, () => 0);

    expect(result[0]).toEqual(seeds[0]);
    expect(result[1]).toEqual(seeds[1]);
  });

  it('reassigns only among the unlocked entrants', () => {
    const result = randomizeUnlocked(seeds, () => 0);
    const unlocked = result.slice(2).map((assignment) => assignment.entrantId);

    expect([...unlocked].sort()).toEqual(['c', 'd', 'e']);
  });

  it('places every entrant exactly once', () => {
    const result = randomizeUnlocked(seeds, () => 0.99);

    expect(new Set(result.map((assignment) => assignment.entrantId)).size).toBe(seeds.length);
  });

  it('leaves a fully locked order untouched', () => {
    const allLocked = seeds.map((assignment) => ({ ...assignment, locked: true }));

    expect(randomizeUnlocked(allLocked, () => 0)).toEqual(allLocked);
  });

  it('keeps the locks themselves', () => {
    expect(lockedSeeds(randomizeUnlocked(seeds, () => 0.5))).toEqual([1, 2]);
  });
});

describe('toggleLock and swapSeeds', () => {
  it('flips one seed and leaves the rest alone', () => {
    expect(lockedSeeds(toggleLock(seeds, 3))).toEqual([1, 2, 3]);
    expect(lockedSeeds(toggleLock(seeds, 1))).toEqual([2]);
  });

  it('swaps two unlocked seats', () => {
    const swapped = swapSeeds(seeds, 3, 5);

    expect(swapped[2]?.entrantId).toBe('e');
    expect(swapped[4]?.entrantId).toBe('c');
  });

  it('refuses a swap that would move a locked seat', () => {
    expect(swapSeeds(seeds, 1, 3)).toEqual(seeds);
    expect(swapSeeds(seeds, 3, 99)).toEqual(seeds);
  });

  it('reports an order that differs from the published one', () => {
    expect(isDirty(seeds, seeds)).toBe(false);
    expect(isDirty(swapSeeds(seeds, 3, 5), seeds)).toBe(true);
    expect(isDirty(seeds.slice(1), seeds)).toBe(true);
  });
});

/**
 * A four- and an eight-participant single-elimination bracket, written out by
 * hand in the shape the engine generates: round two takes the winners of the
 * two matches above it.
 */
function singleElimination(size: 4 | 8): readonly CanvasMatch[] {
  const firstRound = Array.from({ length: size / 2 }, (_value, index) => ({
    matchId: `SE-R1-M${index + 1}`,
    bracket: 'winners',
    round: 1,
    position: index + 1,
    status: 'scheduled',
    slots: [
      { kind: 'entrant' as const, entrantId: `e${index * 2 + 1}` },
      { kind: 'entrant' as const, entrantId: `e${index * 2 + 2}` },
    ],
  }));

  const later: CanvasMatch[] = [];
  let previous = firstRound.map((match) => match.matchId);
  let round = 2;
  while (previous.length > 1) {
    const current: string[] = [];
    for (let index = 0; index < previous.length; index += 2) {
      const matchId = `SE-R${round}-M${index / 2 + 1}`;
      current.push(matchId);
      later.push({
        matchId,
        bracket: 'winners',
        round,
        position: index / 2 + 1,
        status: 'scheduled',
        slots: [
          { kind: 'winner-of', matchId: previous[index] as string },
          { kind: 'winner-of', matchId: previous[index + 1] as string },
        ],
      });
    }
    previous = current;
    round += 1;
  }

  return [...firstRound, ...later];
}

/** Finds a laid-out node without a non-null assertion, which lint forbids. */
function nodeOf(layout: BracketLayout, matchId: string): LaidOutMatch {
  return layout.matches.find((node) => node.matchId === matchId) as LaidOutMatch;
}

describe('layoutBracket', () => {
  it('centres a round-two match between the two that feed it (4 participants)', () => {
    const layout = layoutBracket(singleElimination(4));
    const first = nodeOf(layout, 'SE-R1-M1');
    const second = nodeOf(layout, 'SE-R1-M2');
    const final = nodeOf(layout, 'SE-R2-M1');

    const centre = (node: { y: number; height: number }): number => node.y + node.height / 2;
    // Within half a grid step: positions are snapped so nodes stay aligned
    // under zoom, and the ideal midpoint rarely lands on the grid.
    expect(Math.abs(centre(final) - (centre(first) + centre(second)) / 2)).toBeLessThanOrEqual(
      DEFAULT_GEOMETRY.grid / 2,
    );
  });

  it('advances one column per round', () => {
    const layout = layoutBracket(singleElimination(8));
    const columnPitch = DEFAULT_GEOMETRY.nodeWidth + DEFAULT_GEOMETRY.columnGap;

    expect(layout.matches.find((node) => node.matchId === 'SE-R1-M1')?.x).toBe(0);
    expect(layout.matches.find((node) => node.matchId === 'SE-R2-M1')?.x).toBe(columnPitch);
    expect(layout.matches.find((node) => node.matchId === 'SE-R3-M1')?.x).toBe(columnPitch * 2);
  });

  it('draws one connector per advancement edge (8 participants)', () => {
    const layout = layoutBracket(singleElimination(8));

    // Four quarter-finals feed two semis; two semis feed one final: six edges.
    expect(layout.connectors).toHaveLength(6);
    for (const connector of layout.connectors) {
      expect(connector.points).toHaveLength(4);
      const [from] = connector.points;
      const to = connector.points[connector.points.length - 1];
      expect(from?.x ?? 0).toBeLessThan(to?.x ?? 0);
    }
  });

  it('places the grand final beyond both brackets and renders the losers side', () => {
    const doubleElim: readonly CanvasMatch[] = [
      {
        matchId: 'WB-R1-M1',
        bracket: 'winners',
        round: 1,
        position: 1,
        status: 'finalized',
        slots: [
          { kind: 'entrant', entrantId: 'a', score: 3 },
          { kind: 'entrant', entrantId: 'b', score: 1 },
        ],
      },
      {
        matchId: 'LB-R1-M1',
        bracket: 'losers',
        round: 1,
        position: 1,
        status: 'scheduled',
        slots: [{ kind: 'loser-of', matchId: 'WB-R1-M1' }, { kind: 'bye' }],
      },
      {
        matchId: 'GF-R1-M1',
        bracket: 'grand-final',
        round: 1,
        position: 1,
        status: 'scheduled',
        format: 'BO5',
        slots: [
          { kind: 'winner-of', matchId: 'WB-R1-M1' },
          { kind: 'winner-of', matchId: 'LB-R1-M1' },
        ],
      },
    ];

    const layout = layoutBracket(doubleElim);
    const winners = nodeOf(layout, 'WB-R1-M1');
    const losers = nodeOf(layout, 'LB-R1-M1');
    const final = nodeOf(layout, 'GF-R1-M1');

    expect(losers.y).toBeGreaterThan(winners.y);
    expect(final.x).toBeGreaterThan(winners.x);
    expect(layout.connectors.map((connector) => connector.kind)).toContain('loser-of');
    expect(final.format).toBe('BO5');
  });

  it('names an unresolved slot instead of leaving it blank', () => {
    const layout = layoutBracket(singleElimination(4));
    const final = nodeOf(layout, 'SE-R2-M1');

    expect(final.slots.every((slot) => slot.pending)).toBe(true);
    expect(final.slots[0]?.label).toBe('Ganador del SE-R1-M1');
  });

  it('returns an empty canvas for a stage with no structure', () => {
    expect(layoutBracket([])).toMatchObject({ matches: [], connectors: [], width: 0, height: 0 });
  });
});

describe('snap and zoom', () => {
  it('snaps to the grid and passes a zero grid straight through', () => {
    expect(snap(13, 8)).toBe(16);
    expect(snap(13, 0)).toBe(13);
  });

  it('steps between the declared zoom stops and stops at the ends', () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomIn(2)).toBe(2);
    expect(zoomOut(0.5)).toBe(0.5);
  });
});

describe('history', () => {
  it('walks back and forward through the recorded states', () => {
    let history = initHistory('a');
    history = push(history, 'b');
    history = push(history, 'c');

    expect(canUndo(history)).toBe(true);
    history = undo(history);
    expect(history.present).toBe('b');
    history = redo(history);
    expect(history.present).toBe('c');
  });

  it('drops the redo branch once a new state is recorded', () => {
    let history = push(initHistory('a'), 'b');
    history = undo(history);
    history = push(history, 'z');

    expect(canRedo(history)).toBe(false);
    expect(history.present).toBe('z');
  });

  it('is a no-op at either end', () => {
    const empty = initHistory('a');

    expect(undo(empty)).toBe(empty);
    expect(redo(empty)).toBe(empty);
  });

  it('forgets the oldest states past the limit', () => {
    let history = initHistory('0', 2);
    for (const value of ['1', '2', '3']) history = push(history, value);

    expect(history.past).toEqual(['1', '2']);
  });
});
