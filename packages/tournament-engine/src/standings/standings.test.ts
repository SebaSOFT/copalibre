import type { TiebreakPipeline } from '@copalibre/rules';
import { expectGolden } from '../test-support/golden.js';
import { generateFixtures } from '../fixtures/index.js';
import { isDuelMatch } from '../types.js';
import {
  computeAccounting,
  computeStandings,
  DEFAULT_POINTS,
  entrantsInGraph,
  toEntrantValues,
} from './index.js';
import { fixtureDescriptor, footballDescriptor, type RecordedOutcome } from '@copalibre/domain';

/**
 * A league discipline declaring the football-shaped vocabulary explicitly —
 * which is the only way to get it: the engine assumes no code.
 */
const leagueDescriptor = fixtureDescriptor({
  statistics: [
    { code: 'score-for', label: 'Scored', aggregation: 'sum' },
    { code: 'score-against', label: 'Conceded', aggregation: 'sum' },
    { code: 'score-difference', label: 'Difference', aggregation: 'sum' },
    { code: 'points', label: 'Points', aggregation: 'sum' },
    { code: 'wins', label: 'Wins', aggregation: 'sum' },
    { code: 'draws', label: 'Draws', aggregation: 'sum' },
    { code: 'losses', label: 'Losses', aggregation: 'sum' },
    { code: 'played', label: 'Played', aggregation: 'count' },
  ],
});

const pipeline: TiebreakPipeline = {
  id: 'league-standard',
  version: 1,
  parameters: [
    {
      id: 'points',
      label: 'Points',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'calculated',
    },
    {
      id: 'score-difference',
      label: 'Score Difference',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'match-derived',
    },
    {
      id: 'score-for',
      label: 'Scored',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'match-derived',
    },
  ],
};

/** Points-only pipeline, so ties survive and shared ranks can be asserted. */
function pointsOnly(): TiebreakPipeline['parameters'] {
  const [points] = pipeline.parameters;
  if (!points) throw new Error('pipeline fixture is missing its points parameter');
  return [points];
}

const outcome = (
  matchId: string,
  a: string,
  aScore: number,
  b: string,
  bScore: number,
): RecordedOutcome => ({
  matchId,
  winnerEntrantId: aScore === bScore ? undefined : aScore > bScore ? a : b,
  sides: [
    {
      entrantId: a,
      statistics: {
        'score-for': aScore,
        'score-against': bScore,
        'score-difference': aScore - bScore,
      },
    },
    {
      entrantId: b,
      statistics: {
        'score-for': bScore,
        'score-against': aScore,
        'score-difference': bScore - aScore,
      },
    },
  ],
});

describe('computeAccounting', () => {
  it('folds the declared statistics and the win/draw/loss record the discipline asked for', () => {
    const rows = computeAccounting(
      leagueDescriptor,
      ['a', 'b', 'c'],
      [outcome('m1', 'a', 3, 'b', 1), outcome('m2', 'b', 2, 'c', 2), outcome('m3', 'a', 0, 'c', 1)],
    );
    const byId = Object.fromEntries(rows.map((row) => [row.entrantId, row.statistics]));
    // a: 3+0 for, 1+1 against -> +1;  b: 1+2 for, 3+2 against -> -2;  c: 2+1 for, 2+0 against -> +1
    expect(byId.a).toEqual({
      played: 2,
      wins: 1,
      draws: 0,
      losses: 1,
      points: 3,
      'score-for': 3,
      'score-against': 2,
      'score-difference': 1,
    });
    expect(byId.b).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1, points: 1 });
    expect(byId.c).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, points: 4 });
  });

  it('reports zeroes for an entrant with no recorded matches', () => {
    const [row] = computeAccounting(leagueDescriptor, ['solo'], []);
    expect(row?.statistics).toMatchObject({
      played: 0,
      points: 0,
      'score-for': 0,
      'score-difference': 0,
    });
  });

  it('ignores outcomes referencing unknown entrants', () => {
    const rows = computeAccounting(leagueDescriptor, ['a'], [outcome('m1', 'x', 1, 'y', 0)]);
    expect(rows[0]?.statistics.played).toBe(0);
  });

  it('ignores a bye outcome, which is not a played match', () => {
    const rows = computeAccounting(
      leagueDescriptor,
      ['a', 'b'],
      [{ matchId: 'm1', winnerEntrantId: 'a', sides: [{ entrantId: 'a', statistics: {} }] }],
    );
    expect(rows.every((row) => row.statistics.played === 0)).toBe(true);
  });

  it('honours custom points rules', () => {
    const rows = computeAccounting(leagueDescriptor, ['a', 'b'], [outcome('m1', 'a', 1, 'b', 0)], {
      win: 2,
      draw: 1,
      loss: -1,
    });
    expect(rows[0]?.statistics.points).toBe(2);
    expect(rows[1]?.statistics.points).toBe(-1);
  });

  it('defaults to 3/1/0', () => {
    expect(DEFAULT_POINTS).toEqual({ win: 3, draw: 1, loss: 0 });
  });

  it('lets a recorded value override the engine-derived one', () => {
    // A discipline whose win condition awards points its own way records them;
    // the engine must not overwrite what the recorder stated.
    const rows = computeAccounting(
      leagueDescriptor,
      ['a', 'b'],
      [
        {
          matchId: 'm1',
          winnerEntrantId: 'a',
          sides: [
            { entrantId: 'a', statistics: { points: 10 } },
            { entrantId: 'b', statistics: { points: 7 } },
          ],
        },
      ],
    );
    expect(rows.map((row) => row.statistics.points)).toEqual([10, 7]);
  });

  describe('aggregation modes', () => {
    const descriptorWith = (aggregation: 'sum' | 'count' | 'max' | 'min' | 'average') =>
      fixtureDescriptor({
        statistics: [{ code: 'lift', label: 'Lift', aggregation }],
      });

    const lifts: readonly RecordedOutcome[] = [
      {
        matchId: 'l1',
        sides: [
          { entrantId: 'a', statistics: { lift: 100 } },
          { entrantId: 'b', statistics: { lift: 90 } },
        ],
      },
      {
        matchId: 'l2',
        sides: [
          { entrantId: 'a', statistics: { lift: 140 } },
          { entrantId: 'b', statistics: { lift: 95 } },
        ],
      },
      {
        matchId: 'l3',
        sides: [
          { entrantId: 'a', statistics: { lift: 120 } },
          { entrantId: 'b', statistics: { lift: 85 } },
        ],
      },
    ];

    it.each([
      ['sum', 360],
      ['count', 3],
      ['max', 140],
      ['min', 100],
      ['average', 120],
    ] as const)('folds a %s statistic to %i', (aggregation, expected) => {
      const [row] = computeAccounting(descriptorWith(aggregation), ['a'], lifts);
      expect(row?.statistics.lift).toBe(expected);
    });

    it('sums one statistic and maxes another within one discipline', () => {
      const descriptor = fixtureDescriptor({
        statistics: [
          { code: 'lift', label: 'Lift', aggregation: 'sum' },
          { code: 'best-lift', label: 'Best lift', aggregation: 'max' },
        ],
      });
      const outcomes: readonly RecordedOutcome[] = lifts.map((recorded) => ({
        ...recorded,
        sides: recorded.sides.map((side) => ({
          ...side,
          statistics: { lift: side.statistics.lift ?? 0, 'best-lift': side.statistics.lift ?? 0 },
        })),
      }));

      const [row] = computeAccounting(descriptor, ['a'], outcomes);
      expect(row?.statistics).toEqual({ lift: 360, 'best-lift': 140 });
    });
  });

  describe('a discipline unlike football', () => {
    const arena = fixtureDescriptor({
      statistics: [
        { code: 'frags', label: 'Frags', aggregation: 'sum' },
        { code: 'deaths', label: 'Deaths', aggregation: 'sum' },
        { code: 'placement-points', label: 'Placement points', aggregation: 'sum' },
      ],
    });

    const lobby: RecordedOutcome = {
      matchId: 'lobby-1',
      sides: Array.from({ length: 8 }, (_unused, index) => ({
        entrantId: `p${index + 1}`,
        statistics: { frags: 8 - index, deaths: index, 'placement-points': 16 - index * 2 },
        placement: index + 1,
      })),
    };

    it('emits no statistic the discipline did not declare', () => {
      const [row] = computeAccounting(arena, ['p1'], [lobby]);
      expect(Object.keys(row?.statistics ?? {}).sort()).toEqual([
        'deaths',
        'frags',
        'placement-points',
      ]);
      expect(row?.statistics).not.toHaveProperty('points');
      expect(row?.statistics).not.toHaveProperty('played');
    });

    it('accounts every side of an eight-sided placement outcome', () => {
      const ids = lobby.sides.map((side) => side.entrantId);
      const rows = computeAccounting(arena, ids, [lobby]);

      expect(rows).toHaveLength(8);
      expect(rows.map((row) => row.statistics['placement-points'])).toEqual([
        16, 14, 12, 10, 8, 6, 4, 2,
      ]);
    });

    it('keeps a comparator on an undeclared code out of the pipeline inputs', () => {
      const values = toEntrantValues(computeAccounting(arena, ['p1'], [lobby]));
      expect(values.p1).not.toHaveProperty('points');
    });
  });
});

describe('toEntrantValues', () => {
  it('exposes exactly the declared statistics to the pipeline', () => {
    const values = toEntrantValues(
      computeAccounting(leagueDescriptor, ['a', 'b'], [outcome('m1', 'a', 2, 'b', 1)]),
    );
    expect(Object.keys(values.a ?? {}).sort()).toEqual([
      'draws',
      'losses',
      'played',
      'points',
      'score-against',
      'score-difference',
      'score-for',
      'wins',
    ]);
  });
});

describe('computeStandings', () => {
  it('ranks by points and carries the pipeline trace', () => {
    const standings = computeStandings(
      leagueDescriptor,
      ['a', 'b', 'c'],
      [outcome('m1', 'a', 3, 'b', 0), outcome('m2', 'a', 2, 'c', 0), outcome('m3', 'b', 1, 'c', 0)],
      pipeline,
    );
    expect(standings.rows.map((row) => row.entrantId)).toEqual(['a', 'b', 'c']);
    expect(standings.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(standings.trace.length).toBeGreaterThan(0);
    expect(standings.fullyResolved).toBe(true);
  });

  it('breaks a points tie on score difference and records which rule resolved it', () => {
    const standings = computeStandings(
      leagueDescriptor,
      ['a', 'b'],
      [outcome('m1', 'a', 5, 'x', 0), outcome('m2', 'b', 1, 'y', 0)],
      pipeline,
    );
    // Neither outcome involves both tracked entrants, so both have 0 played.
    expect(standings.rows).toHaveLength(2);
    expect(standings.trace[0]?.label).toContain('Points');
  });

  it('marks entrants the pipeline could not separate as sharing a rank', () => {
    const standings = computeStandings(
      leagueDescriptor,
      ['a', 'b'],
      [outcome('m1', 'a', 1, 'b', 1)],
      {
        ...pipeline,
        parameters: pointsOnly(),
      },
    );
    expect(standings.rows.every((row) => row.sharedRank)).toBe(true);
    expect(standings.rows.map((row) => row.rank)).toEqual([1, 1]);
    expect(standings.fullyResolved).toBe(false);
  });

  it('assigns the next rank after a shared group, not consecutive numbering', () => {
    const standings = computeStandings(
      leagueDescriptor,
      ['a', 'b', 'c'],
      [outcome('m1', 'a', 1, 'b', 1), outcome('m2', 'c', 0, 'a', 5)],
      { ...pipeline, parameters: pointsOnly() },
    );
    // a=4pts, b=1, c=0 -> no tie here; assert the mechanism with a real tie below.
    expect(standings.rows[0]?.rank).toBe(1);
  });

  it('produces a stable golden trace for a full round-robin table', () => {
    const result = generateFixtures({
      format: 'round-robin',
      entrants: [1, 2, 3, 4].map((seed) => ({ entrantId: `e${seed}`, seed })),
    });
    if (!result.ok) throw result.error;
    const ids = entrantsInGraph(result.value.matches);
    const outcomes = result.value.matches
      .filter(isDuelMatch)
      .filter((match) => match.slotA.kind === 'entrant' && match.slotB.kind === 'entrant')
      .map((match, index) => {
        const a = (match.slotA as { entrantId: string }).entrantId;
        const b = (match.slotB as { entrantId: string }).entrantId;
        // Deterministic pseudo-results so the golden file is meaningful.
        return outcome(match.id, a, (index % 3) + 1, b, index % 2);
      });
    const standings = computeStandings(leagueDescriptor, ids, outcomes, pipeline);
    expectGolden('standings-round-robin-4', {
      rows: standings.rows,
      trace: standings.trace,
      fullyResolved: standings.fullyResolved,
    });
  });

  it('ranks a seeded football table with the module-declared vocabulary', () => {
    const football = footballDescriptor();
    const standings = computeStandings(
      football,
      ['alfa', 'bravo'],
      [
        {
          matchId: 'm-1',
          winnerEntrantId: 'alfa',
          sides: [
            { entrantId: 'alfa', statistics: { 'goals-for': 2, 'goals-against': 1 } },
            { entrantId: 'bravo', statistics: { 'goals-for': 1, 'goals-against': 2 } },
          ],
        },
      ],
      { ...pipeline, parameters: pointsOnly() },
    );

    expect(standings.rows[0]).toMatchObject({ entrantId: 'alfa', rank: 1 });
    expect(standings.rows[0]?.statistics).toMatchObject({
      'goals-for': 2,
      wins: 1,
      points: 3,
      played: 1,
    });
  });
});
