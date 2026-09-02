import { InvalidEntrantsError, UnsupportedFormatError } from '../errors.js';
import { expectGolden, summarise } from '../test-support/golden.js';
import type { TournamentFormat } from '@copalibre/domain';
import { isDuelMatch, type DuelMatch } from '../types.js';
import { generateFixtures, nextPowerOfTwo, seedSlotOrder } from './index.js';

const entrants = (n: number) =>
  Array.from({ length: n }, (_, index) => ({ entrantId: `e${index + 1}`, seed: index + 1 }));

function graph(format: TournamentFormat, n: number, homeAndAway = false) {
  const result = generateFixtures({ format, entrants: entrants(n), homeAndAway });
  if (!result.ok) throw result.error;
  return result.value;
}

/**
 * Every MVP format is a duel format, so the narrowing is an assertion as much
 * as a convenience: a generator emitting a placement match here is a defect.
 */
function duels(format: TournamentFormat, n: number, homeAndAway = false): readonly DuelMatch[] {
  const { matches } = graph(format, n, homeAndAway);
  const duelMatches = matches.filter(isDuelMatch);
  expect(duelMatches).toHaveLength(matches.length);
  return duelMatches;
}

describe('format guard', () => {
  it.each([
    'single-elimination',
    'double-elimination',
    'round-robin',
    'league',
    'round-robin-single-leg',
    'round-robin-home-away',
  ] as const)('accepts the duel format %s', (format) => {
    expect(generateFixtures({ format, entrants: entrants(4) }).ok).toBe(true);
  });

  it.each(['free-for-all', 'heats'] as const)('accepts the placement format %s', (format) => {
    // The allowlist is wider: what is duel-only is advancement, not
    // competition, so these generate rather than being refused.
    expect(generateFixtures({ format, entrants: entrants(4) }).ok).toBe(true);
  });

  it.each(['ladder', 'battle-royale', ''])('rejects "%s"', (format) => {
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
    const byeOpponents = duels('single-elimination', 5)
      .filter((m) => m.slotB.kind === 'bye' || m.slotA.kind === 'bye')
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
    const finals = duels('double-elimination', 8).filter((m) => m.bracket === 'grand-final');
    expect(finals).toHaveLength(2);
    expect(finals[0]?.conditional).toBeUndefined();
    expect(finals[1]?.conditional).toBe('bracket-reset');
  });

  it('never emits a match with no possible participant on either side', () => {
    for (const n of [4, 5, 6, 8, 11, 16]) {
      const matches = duels('double-elimination', n);
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
      const matches = duels('double-elimination', n);
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
    const pairs = duels('round-robin', n)
      .filter((m) => m.slotA.kind === 'entrant' && m.slotB.kind === 'entrant')
      .map((m) =>
        [(m.slotA as { entrantId: string }).entrantId, (m.slotB as { entrantId: string }).entrantId]
          .sort()
          .join('-'),
      );
    expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
    expect(pairs).toHaveLength((n * (n - 1)) / 2);
  });

  it('gives every entrant exactly one bye with an odd field', () => {
    const byeHolders = duels('round-robin', 5)
      .filter((m) => m.slotA.kind === 'bye' || m.slotB.kind === 'bye')
      .map((m) =>
        m.slotA.kind === 'entrant'
          ? m.slotA.entrantId
          : (m.slotB as { entrantId: string }).entrantId,
      );
    expect(new Set(byeHolders).size).toBe(5);
  });

  it('plays each pairing twice with sides reversed in home-and-away', () => {
    const matches = duels('round-robin-home-away', 4);
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

describe('multi-match series generation', () => {
  it('refuses series configuration on placement formats with UnsupportedFormatError', () => {
    for (const format of ['free-for-all', 'heats'] as const) {
      const result = generateFixtures({
        format,
        entrants: entrants(4),
        series: { span: 3, resolutionClass: 'best-of' },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(UnsupportedFormatError);
      }
    }
  });

  it('refuses invalid series configuration with SeriesConfigurationError', () => {
    const evenBestOf = generateFixtures({
      format: 'single-elimination',
      entrants: entrants(4),
      series: { span: 4, resolutionClass: 'best-of' },
    });
    expect(evenBestOf.ok).toBe(false);

    const spanOne = generateFixtures({
      format: 'single-elimination',
      entrants: entrants(4),
      series: { span: 1, resolutionClass: 'best-of' },
    });
    expect(spanOne.ok).toBe(false);
  });

  it('generates 3 matches per fixture with alternating home/away in single elimination', () => {
    const result = generateFixtures({
      format: 'single-elimination',
      entrants: entrants(4),
      series: { span: 3, resolutionClass: 'best-of', neutralGround: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 4 entrants = 2 rounds: R1 has 2 fixtures (6 matches), R2 has 1 fixture (3 matches) = 9 matches total
    expect(result.value.matches).toHaveLength(9);

    const r1m1Matches = result.value.matches.filter((m) => m.id.startsWith('SE-R1-M1'));
    expect(r1m1Matches).toHaveLength(3);
    expect(r1m1Matches.map((m) => (m as DuelMatch).matchNumber)).toEqual([1, 2, 3]);
    expect(r1m1Matches.map((m) => (m as DuelMatch).homeSlot)).toEqual(['A', 'B', 'A']);

    // Check contiguous match numbers starting from 1 across every fixture
    const fixtureIds = new Set(result.value.matches.map((m) => m.id.replace(/-[0-9]+$/, '')));
    for (const fId of fixtureIds) {
      const fMatches = result.value.matches.filter((m) => m.id.startsWith(fId)) as DuelMatch[];
      const numbers = fMatches.map((m) => m.matchNumber);
      expect(numbers).toEqual([1, 2, 3]);
    }
  });

  it('generates homeSlot as undefined when neutralGround is true', () => {
    const result = generateFixtures({
      format: 'single-elimination',
      entrants: entrants(4),
      series: { span: 3, resolutionClass: 'best-of', neutralGround: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const match of result.value.matches) {
      expect((match as DuelMatch).homeSlot).toBeUndefined();
    }
  });

  it('generates 5 matches per fixture in double elimination including grand final reset', () => {
    const result = generateFixtures({
      format: 'double-elimination',
      entrants: entrants(4),
      series: { span: 5, resolutionClass: 'best-of' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const gfReset = result.value.matches.filter(
      (m) => isDuelMatch(m) && m.bracket === 'grand-final' && m.round === 2,
    );
    expect(gfReset).toHaveLength(5);
    expect(gfReset.map((m) => (m as DuelMatch).matchNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(gfReset.every((m) => (m as DuelMatch).conditional === 'bracket-reset')).toBe(true);
  });

  it('generates N matches per pairing in round-robin preserving round structure', () => {
    const result = generateFixtures({
      format: 'round-robin',
      entrants: entrants(4),
      series: { span: 3, resolutionClass: 'best-of' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 4 entrants = 3 rounds, 2 pairings per round = 6 pairings * 3 matches = 18 matches
    expect(result.value.matches).toHaveLength(18);
    const r1p1 = result.value.matches.filter((m) => m.id.startsWith('RR-R1-M1'));
    expect(r1p1).toHaveLength(3);
    expect(r1p1.map((m) => (m as DuelMatch).matchNumber)).toEqual([1, 2, 3]);
  });

  it('matches golden fixture graphs for best-of-three single elimination and best-of-five double elimination', () => {
    const seBo3 = generateFixtures({
      format: 'single-elimination',
      entrants: entrants(4),
      series: { span: 3, resolutionClass: 'best-of' },
    });
    if (!seBo3.ok) throw seBo3.error;
    expectGolden('single-elimination-bo3-4', summarise(seBo3.value.matches));

    const deBo5 = generateFixtures({
      format: 'double-elimination',
      entrants: entrants(4),
      series: { span: 5, resolutionClass: 'best-of' },
    });
    if (!deBo5.ok) throw deBo5.error;
    expectGolden('double-elimination-bo5-4', summarise(deBo5.value.matches));
  });
});
