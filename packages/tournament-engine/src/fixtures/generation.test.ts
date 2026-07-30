import { InvalidEntrantsError, UnsupportedFormatError } from '../errors.js';
import { expectGolden, summarise } from '../test-support/golden.js';
import type { TournamentFormat } from '@copalibre/domain';
import { generateFixtures, nextPowerOfTwo, seedSlotOrder } from './index.js';

const entrants = (n: number) =>
  Array.from({ length: n }, (_, index) => ({ entrantId: `e${index + 1}`, seed: index + 1 }));

function graph(format: TournamentFormat, n: number, homeAndAway = false) {
  const result = generateFixtures({ format, entrants: entrants(n), homeAndAway });
  if (!result.ok) throw result.error;
  return result.value;
}

describe('format guard', () => {
  it.each([
    'single-elimination',
    'double-elimination',
    'round-robin',
    'league',
    'round-robin-single-leg',
    'round-robin-home-away',
  ] as const)('accepts the MVP format %s', (format) => {
    expect(generateFixtures({ format, entrants: entrants(4) }).ok).toBe(true);
  });

  it.each(['swiss', 'free-for-all', 'ladder', ''])('rejects "%s"', (format) => {
    const result = generateFixtures({
      format: format as TournamentFormat,
      entrants: entrants(4),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(UnsupportedFormatError);
      expect(result.error.message).toContain('not supported');
    }
  });
});

describe('entrant validation', () => {
  it.each([
    ['fewer than two entrants', [{ entrantId: 'e1', seed: 1 }]],
    [
      'duplicate seeds',
      [
        { entrantId: 'e1', seed: 1 },
        { entrantId: 'e2', seed: 1 },
      ],
    ],
    [
      'duplicate ids',
      [
        { entrantId: 'e1', seed: 1 },
        { entrantId: 'e1', seed: 2 },
      ],
    ],
    [
      'zero seed',
      [
        { entrantId: 'e1', seed: 0 },
        { entrantId: 'e2', seed: 1 },
      ],
    ],
    [
      'fractional seed',
      [
        { entrantId: 'e1', seed: 1.5 },
        { entrantId: 'e2', seed: 2 },
      ],
    ],
  ])('rejects %s', (_label, list) => {
    const result = generateFixtures({ format: 'single-elimination', entrants: list });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(InvalidEntrantsError);
  });
});

describe('seeding helpers', () => {
  it('produces the conventional bracket order', () => {
    expect(seedSlotOrder(2)).toEqual([1, 2]);
    expect(seedSlotOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedSlotOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('keeps the top two seeds apart until the final', () => {
    const order = seedSlotOrder(16);
    expect(order.indexOf(1) < order.length / 2).toBe(true);
    expect(order.indexOf(2) >= order.length / 2).toBe(true);
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 4],
    [5, 8],
    [8, 8],
    [9, 16],
    [11, 16],
  ])('pads %i entrants to %i slots', (n, expected) => {
    expect(nextPowerOfTwo(n)).toBe(expected);
  });
});

describe('single elimination', () => {
  it.each([4, 8, 16])('matches the golden bracket for %i entrants', (n) => {
    expectGolden(`single-elimination-${n}`, summarise(graph('single-elimination', n).matches));
  });

  it.each([5, 6, 11])('matches the golden bracket for %i entrants (with byes)', (n) => {
    expectGolden(`single-elimination-${n}`, summarise(graph('single-elimination', n).matches));
  });

  it.each([
    [4, 3],
    [8, 7],
    [16, 15],
  ])('generates n-1 matches for %i entrants', (n, expected) => {
    expect(graph('single-elimination', n).matches).toHaveLength(expected);
  });

  it('gives byes to the top seeds', () => {
    const byeOpponents = graph('single-elimination', 5)
      .matches.filter((m) => m.slotB.kind === 'bye' || m.slotA.kind === 'bye')
      .map((m) => (m.slotA.kind === 'entrant' ? m.slotA.seed : (m.slotB as { seed: number }).seed));
    // 5 entrants in an 8-slot bracket: seeds 1, 2 and 3 receive byes.
    expect(byeOpponents.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});

describe('double elimination', () => {
  it.each([4, 8, 16])('matches the golden bracket for %i entrants', (n) => {
    expectGolden(`double-elimination-${n}`, summarise(graph('double-elimination', n).matches));
  });

  it.each([5, 6, 11])('matches the golden bracket for %i entrants (with byes)', (n) => {
    expectGolden(`double-elimination-${n}`, summarise(graph('double-elimination', n).matches));
  });

  it.each([
    [4, 2],
    [8, 4],
    [16, 6],
  ])('builds 2*log2(%i)-2 = %i losers-bracket rounds', (n, expectedRounds) => {
    const lb = graph('double-elimination', n).matches.filter((m) => m.bracket === 'losers');
    expect(new Set(lb.map((m) => m.round)).size).toBe(expectedRounds);
  });

  it.each([
    [4, 7],
    [8, 15],
    [16, 31],
  ])('generates 2n-2 matches plus the reset for %i entrants', (n, expected) => {
    expect(graph('double-elimination', n).matches).toHaveLength(expected);
  });

  it('generates the grand final and a conditional bracket reset', () => {
    const finals = graph('double-elimination', 8).matches.filter(
      (m) => m.bracket === 'grand-final',
    );
    expect(finals).toHaveLength(2);
    expect(finals[0]?.conditional).toBeUndefined();
    expect(finals[1]?.conditional).toBe('bracket-reset');
  });

  it('never emits a match with no possible participant on either side', () => {
    for (const n of [4, 5, 6, 8, 11, 16]) {
      const { matches } = graph('double-elimination', n);
      const byId = new Map(matches.map((m) => [m.id, m]));
      const empty = (
        slot: (typeof matches)[number]['slotA'],
        seen = new Set<string>(),
      ): boolean => {
        if (slot.kind === 'bye') return true;
        if (slot.kind === 'entrant') return false;
        if (seen.has(slot.matchId)) return true;
        const source = byId.get(slot.matchId);
        if (!source) return true;
        const next = new Set(seen).add(slot.matchId);
        const a = empty(source.slotA, next);
        const b = empty(source.slotB, next);
        return slot.kind === 'loser-of' ? a || b : a && b;
      };
      const phantom = matches.filter((m) => empty(m.slotA) && empty(m.slotB));
      expect(phantom.map((m) => `${n}:${m.id}`)).toEqual([]);
    }
  });

  it('references only matches that exist', () => {
    for (const n of [4, 5, 8, 11, 16]) {
      const { matches } = graph('double-elimination', n);
      const ids = new Set(matches.map((m) => m.id));
      const dangling = matches
        .flatMap((m) => [m.slotA, m.slotB])
        .filter((s) => (s.kind === 'winner-of' || s.kind === 'loser-of') && !ids.has(s.matchId));
      expect(dangling).toEqual([]);
    }
  });
});

describe('round robin and league', () => {
  it.each([4, 5, 6])('matches the golden schedule for %i entrants', (n) => {
    expectGolden(`round-robin-${n}`, summarise(graph('round-robin', n).matches));
  });

  it('matches the golden league schedule', () => {
    expectGolden('league-6', summarise(graph('league', 6).matches));
  });

  it('matches the golden home-and-away schedule', () => {
    expectGolden('round-robin-home-away-4', summarise(graph('round-robin-home-away', 4).matches));
  });

  it.each([4, 5, 6, 7, 8])('has every pair meet exactly once for %i entrants', (n) => {
    const pairs = graph('round-robin', n)
      .matches.filter((m) => m.slotA.kind === 'entrant' && m.slotB.kind === 'entrant')
      .map((m) =>
        [(m.slotA as { entrantId: string }).entrantId, (m.slotB as { entrantId: string }).entrantId]
          .sort()
          .join('-'),
      );
    expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
    expect(pairs).toHaveLength((n * (n - 1)) / 2);
  });

  it('gives every entrant exactly one bye with an odd field', () => {
    const byeHolders = graph('round-robin', 5)
      .matches.filter((m) => m.slotA.kind === 'bye' || m.slotB.kind === 'bye')
      .map((m) =>
        m.slotA.kind === 'entrant'
          ? m.slotA.entrantId
          : (m.slotB as { entrantId: string }).entrantId,
      );
    expect(new Set(byeHolders).size).toBe(5);
  });

  it('plays each pairing twice with sides reversed in home-and-away', () => {
    const { matches } = graph('round-robin-home-away', 4);
    expect(matches).toHaveLength(12);
    const firstLeg = matches.slice(0, 6);
    const secondLeg = matches.slice(6);
    for (const [index, match] of firstLeg.entries()) {
      expect(secondLeg[index]?.slotA).toEqual(match.slotB);
      expect(secondLeg[index]?.slotB).toEqual(match.slotA);
    }
  });

  it('treats single-leg as one pass and league as the same shape', () => {
    expect(graph('round-robin-single-leg', 6).matches).toHaveLength(15);
    expect(graph('league', 6).matches).toHaveLength(15);
  });
});

describe('determinism', () => {
  it.each([
    'single-elimination',
    'double-elimination',
    'round-robin',
    'league',
    'round-robin-single-leg',
    'round-robin-home-away',
  ] as const)('regenerates %s identically', (format) => {
    const once = JSON.stringify(graph(format, 8));
    const twice = JSON.stringify(graph(format, 8));
    expect(once).toBe(twice);
  });

  it('summarises rounds for every bracket', () => {
    const { rounds } = graph('double-elimination', 8);
    expect(rounds.map((r) => r.bracket)).toEqual(
      expect.arrayContaining(['winners', 'losers', 'grand-final']),
    );
    expect(rounds.every((r) => r.matchIds.length > 0)).toBe(true);
  });
});
