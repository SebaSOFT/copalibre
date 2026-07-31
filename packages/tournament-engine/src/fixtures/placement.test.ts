import type { DrawConstraint, EntrantAttribute } from '@copalibre/domain';
import { resolveAdvancement } from '../advancement/index.js';
import { InvalidEntrantsError } from '../errors.js';
import { entrantsInGraph } from '../standings/index.js';
import { expectGolden, summarise } from '../test-support/golden.js';
import { isPlacementMatch, type SeededEntrant } from '../types.js';
import { generateFixtures } from './index.js';
import { buildPlacementStage, roundSeed } from './placement.js';

const entrants = (n: number): SeededEntrant[] =>
  Array.from({ length: n }, (_unused, index) => ({
    entrantId: `p${index + 1}`,
    seed: index + 1,
  }));

/** Which entrants ended up together, per round. */
function lobbiesByRound(matches: readonly { round: number; slots: readonly unknown[] }[]) {
  const rounds = new Map<number, string[][]>();
  for (const match of matches) {
    const members = match.slots.map((slot) => (slot as { entrantId: string }).entrantId);
    rounds.set(match.round, [...(rounds.get(match.round) ?? []), members]);
  }
  return rounds;
}

describe('free-for-all generation', () => {
  it('puts every entrant on one table per round', () => {
    const matches = buildPlacementStage('free-for-all', entrants(12), { rounds: 3 });

    expect(matches).toHaveLength(3);
    for (const match of matches) {
      expect(match.slots).toHaveLength(12);
      expect(match.shape).toBe('placement');
      expect(match.bracket).toBe('placement');
    }
  });

  it('defaults to a single round', () => {
    expect(buildPlacementStage('free-for-all', entrants(8))).toHaveLength(1);
  });

  it.each([
    [4, 1],
    [16, 4],
    [64, 6],
  ])('generates %i entrants over %i rounds', (count, rounds) => {
    const matches = buildPlacementStage('free-for-all', entrants(count), { rounds });
    expect(matches).toHaveLength(rounds);
    expect(matches.every((match) => match.slots.length === count)).toBe(true);
  });

  it('refuses a round count below one', () => {
    expect(() => buildPlacementStage('free-for-all', entrants(4), { rounds: 0 })).toThrow(
      InvalidEntrantsError,
    );
  });
});

describe('heats generation', () => {
  it('divides entrants into parallel lobbies', () => {
    const matches = buildPlacementStage('heats', entrants(16), { lobbySize: 4, drawSeed: 7 });

    expect(matches).toHaveLength(4);
    expect(matches.every((match) => match.slots.length === 4)).toBe(true);
  });

  it('balances lobbies when the field does not divide evenly', () => {
    // 10 entrants at 4 per lobby is three lobbies of 4, 3 and 3 — not 4, 4, 2.
    const matches = buildPlacementStage('heats', entrants(10), { lobbySize: 4, drawSeed: 3 });
    const sizes = matches.map((match) => match.slots.length).sort((a, b) => b - a);

    expect(matches).toHaveLength(3);
    expect(sizes).toEqual([4, 3, 3]);
  });

  it('gives every entrant exactly one lobby per round', () => {
    const matches = buildPlacementStage('heats', entrants(15), {
      lobbySize: 5,
      rounds: 3,
      drawSeed: 11,
    });

    for (const [round, lobbies] of lobbiesByRound(matches)) {
      const placed = lobbies.flat();
      expect(new Set(placed).size).toBe(15);
      expect(placed).toHaveLength(15);
      expect(round).toBeGreaterThan(0);
    }
  });

  it('lists a lobby in seed order, whatever order the draw produced', () => {
    const [first] = buildPlacementStage('heats', entrants(8), { lobbySize: 4, drawSeed: 2 });
    const seeds = (first?.slots ?? []).map((slot) => (slot as { seed: number }).seed);

    expect(seeds).toEqual([...seeds].sort((a, b) => a - b));
  });

  it('refuses a lobby that could not hold a contest', () => {
    expect(() => buildPlacementStage('heats', entrants(8), { lobbySize: 1 })).toThrow(
      /at least two entrants/,
    );
  });
});

describe('rotation across rounds', () => {
  it('changes lobby composition between rounds', () => {
    const matches = buildPlacementStage('heats', entrants(16), {
      lobbySize: 4,
      rounds: 2,
      drawSeed: 20260731,
    });
    const rounds = lobbiesByRound(matches);

    const first = (rounds.get(1) ?? []).map((lobby) => [...lobby].sort().join(','));
    const second = (rounds.get(2) ?? []).map((lobby) => [...lobby].sort().join(','));

    // Four rounds of the same sixteen players in the same four lobbies would
    // measure the lobby, not the player.
    expect(second).not.toEqual(first);
  });

  it('reproduces every round from one recorded stage seed', () => {
    const options = { lobbySize: 4, rounds: 3, drawSeed: 99 } as const;
    const first = buildPlacementStage('heats', entrants(16), options);
    const again = buildPlacementStage('heats', entrants(16), options);

    expect(summarise(again)).toEqual(summarise(first));
  });

  it('produces a different stage from a different seed', () => {
    const a = buildPlacementStage('heats', entrants(16), { lobbySize: 4, drawSeed: 1 });
    const b = buildPlacementStage('heats', entrants(16), { lobbySize: 4, drawSeed: 2 });

    expect(summarise(b)).not.toEqual(summarise(a));
  });

  it('derives round seeds that no neighbouring stage collides with', () => {
    // Stage 7 round 2 and stage 8 round 1 must not draw the same lobbies.
    expect(roundSeed(7, 2)).not.toBe(roundSeed(8, 1));
    expect(roundSeed(7, 1)).toBe(roundSeed(7, 1));
  });
});

describe('constraints within a lobby', () => {
  const region = (value: string): EntrantAttribute[] => [
    { key: 'region', value, kind: 'categorical' },
  ];

  it('keeps entrants sharing a region out of one lobby', () => {
    const separate: DrawConstraint = {
      kind: 'separation',
      hook: 'draw.assign-group',
      attribute: 'region',
      scope: 'group',
    };
    const attributes = new Map<string, readonly EntrantAttribute[]>([
      ['p1', region('san-juan')],
      ['p2', region('san-juan')],
      ['p3', region('cordoba')],
      ['p4', region('cordoba')],
      ['p5', region('santa-fe')],
      ['p6', region('santa-fe')],
      ['p7', region('mendoza')],
      ['p8', region('mendoza')],
    ]);

    const matches = buildPlacementStage('heats', entrants(8), {
      lobbySize: 2,
      drawSeed: 5,
      constraints: [separate],
      attributes,
    });

    for (const match of matches) {
      const regions = match.slots.map(
        (slot) => attributes.get((slot as { entrantId: string }).entrantId)?.[0]?.value,
      );
      expect(new Set(regions).size).toBe(regions.length);
    }
  });

  it('surfaces an unsatisfiable lobby allocation with the phase-10 diagnostic', () => {
    const attributes = new Map<string, readonly EntrantAttribute[]>(
      entrants(8).map((entrant) => [entrant.entrantId, region('san-juan')]),
    );

    expect(() =>
      buildPlacementStage('heats', entrants(8), {
        lobbySize: 2,
        drawSeed: 5,
        constraints: [
          { kind: 'separation', hook: 'draw.assign-group', attribute: 'region', scope: 'group' },
        ],
        attributes,
      }),
    ).toThrow(/8 entrants carry region=san-juan, but only 4 group\(s\) could separate them/);
  });
});

describe('a placement stage in the fixture graph', () => {
  it('generates through the single entry point', () => {
    const graph = generateFixtures({
      format: 'heats',
      entrants: entrants(12),
      placement: { lobbySize: 4, rounds: 2, drawSeed: 42 },
    });
    if (!graph.ok) throw graph.error;

    expect(graph.value.matches).toHaveLength(6);
    expect(graph.value.matches.every(isPlacementMatch)).toBe(true);
    expect(graph.value.rounds.map((round) => round.round)).toEqual([1, 2]);
  });

  it('contributes every entrant to the stage table', () => {
    const graph = generateFixtures({
      format: 'free-for-all',
      entrants: entrants(9),
      placement: { rounds: 2 },
    });
    if (!graph.ok) throw graph.error;

    expect(entrantsInGraph(graph.value.matches)).toHaveLength(9);
  });

  it('is never traversed by advancement', () => {
    const graph = generateFixtures({
      format: 'heats',
      entrants: entrants(8),
      placement: { lobbySize: 4, drawSeed: 1 },
    });
    if (!graph.ok) throw graph.error;

    // No duel matches, so nothing to resolve — and crucially, no error either.
    expect(resolveAdvancement(graph.value, [])).toEqual([]);
  });

  it('matches the golden stage for both formats', () => {
    const ffa = generateFixtures({
      format: 'free-for-all',
      entrants: entrants(8),
      placement: { rounds: 2 },
    });
    const heats = generateFixtures({
      format: 'heats',
      entrants: entrants(12),
      placement: { lobbySize: 4, rounds: 2, drawSeed: 20260731 },
    });
    if (!ffa.ok) throw ffa.error;
    if (!heats.ok) throw heats.error;

    expectGolden('placement-free-for-all-8', summarise(ffa.value.matches));
    expectGolden('placement-heats-12', summarise(heats.value.matches));
  });
});
