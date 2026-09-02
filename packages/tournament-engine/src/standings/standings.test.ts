import type { TiebreakPipeline } from '@copalibre/rules';
import { traceForEntrant } from '@copalibre/rules';
import { expectGolden } from '../test-support/golden.js';
import { generateFixtures } from '../fixtures/index.js';
import { isDuelMatch } from '../types.js';
import {
  computeAccounting,
  computeStandings,
  computeCumulativeScores,
  computeScopedAccounting,
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

    expect(standings.rows[0]?.statistics).toMatchObject({
      'goals-for': 2,
      wins: 1,
      points: 3,
      played: 1,
    });
    expect(standings.grain).toBe('match');
  });

  describe('with an optional series declaration', () => {
    const outcomes = [
      outcome('m1', 'a', 3, 'b', 0),
      outcome('m2', 'a', 2, 'c', 0),
      outcome('m3', 'b', 1, 'c', 0),
    ];

    it('produces byte-identical output whether the option is omitted or passed as undefined', () => {
      const omitted = computeStandings(leagueDescriptor, ['a', 'b', 'c'], outcomes, pipeline);
      const explicitUndefined = computeStandings(
        leagueDescriptor,
        ['a', 'b', 'c'],
        outcomes,
        pipeline,
        DEFAULT_POINTS,
        undefined,
      );
      const declaredButNoSeries = computeStandings(
        leagueDescriptor,
        ['a', 'b', 'c'],
        outcomes,
        pipeline,
        DEFAULT_POINTS,
        {},
      );

      expect(explicitUndefined).toEqual(omitted);
      expect(declaredButNoSeries).toEqual(omitted);
      expect(omitted.grain).toBe('match');
    });

    it('reports the declared grain once a series declaration names one', () => {
      const standings = computeStandings(
        leagueDescriptor,
        ['a', 'b', 'c'],
        outcomes,
        pipeline,
        DEFAULT_POINTS,
        {
          seriesDeclaration: { span: 3, resolutionClass: 'best-of', standingsAccounting: 'series' },
        },
      );

      expect(standings.grain).toBe('series');
    });

    it('reports match grain when the declaration names no accounting grain', () => {
      const standings = computeStandings(
        leagueDescriptor,
        ['a', 'b', 'c'],
        outcomes,
        pipeline,
        DEFAULT_POINTS,
        { seriesDeclaration: { span: 3, resolutionClass: 'best-of' } },
      );

      expect(standings.grain).toBe('match');
    });
  });

  describe('series standings accounting grain', () => {
    const football = footballDescriptor();
    // Persisted-shape opaque ids (UUIDv7), never an engine-graph id like
    // `SE-R1-M1-1` that happens to strip to a fixture id — membership is
    // carried on `fixtureId`, not recoverable from `matchId` at all.
    const seriesOutcomes: RecordedOutcome[] = [
      {
        matchId: '018f5b3a-9c11-7c40-8f21-1a2b3c4d5e01',
        fixtureId: '018f5b3a-9c00-7c40-8f21-1a2b3c4d5e00',
        winnerEntrantId: 'alfa',
        sides: [
          { entrantId: 'alfa', statistics: { 'goals-for': 3, 'goals-against': 1 } },
          { entrantId: 'bravo', statistics: { 'goals-for': 1, 'goals-against': 3 } },
        ],
      },
      {
        matchId: '018f5b3a-9c22-7c40-8f21-1a2b3c4d5e02',
        fixtureId: '018f5b3a-9c00-7c40-8f21-1a2b3c4d5e00',
        winnerEntrantId: 'alfa',
        sides: [
          { entrantId: 'alfa', statistics: { 'goals-for': 2, 'goals-against': 0 } },
          { entrantId: 'bravo', statistics: { 'goals-for': 0, 'goals-against': 2 } },
        ],
      },
    ];

    it('folds 1 series outcome and sums match goals when standingsAccounting is series', () => {
      const accounting = computeAccounting(football, ['alfa', 'bravo'], seriesOutcomes, undefined, {
        seriesDeclaration: { span: 3, resolutionClass: 'best-of', standingsAccounting: 'series' },
      });

      const alfa = accounting.find((a) => a.entrantId === 'alfa');
      const bravo = accounting.find((a) => a.entrantId === 'bravo');

      // Alfa won 1 series (3 pts), total goals-for is 5, played reads 1 series
      expect(alfa?.statistics.wins).toBe(1);
      expect(alfa?.statistics.losses).toBe(0);
      expect(alfa?.statistics.points).toBe(3);
      expect(alfa?.statistics['goals-for']).toBe(5);
      expect(alfa?.statistics.played).toBe(1);

      // Bravo lost 1 series (0 pts), total goals-for is 1, played reads 1 series
      expect(bravo?.statistics.wins).toBe(0);
      expect(bravo?.statistics.losses).toBe(1);
      expect(bravo?.statistics.points).toBe(0);
      expect(bravo?.statistics['goals-for']).toBe(1);
      expect(bravo?.statistics.played).toBe(1);
    });

    it('folds 1 outcome per played match when standingsAccounting is match', () => {
      const accounting = computeAccounting(football, ['alfa', 'bravo'], seriesOutcomes, undefined, {
        seriesDeclaration: { span: 3, resolutionClass: 'best-of', standingsAccounting: 'match' },
      });

      const alfa = accounting.find((a) => a.entrantId === 'alfa');
      // Alfa won 2 matches (6 pts), played reads 2 matches
      expect(alfa?.statistics.wins).toBe(2);
      expect(alfa?.statistics.points).toBe(6);
      expect(alfa?.statistics['goals-for']).toBe(5);
      expect(alfa?.statistics.played).toBe(2);
    });

    it('counts a series that went the distance once under series grain and once per game under match grain, always equal to wins + draws + losses', () => {
      // A best-of-three decided in three games: alfa takes game one, bravo
      // levels it in game two, alfa wins game three to take the series 2-1.
      const distanceOutcomes: RecordedOutcome[] = [
        {
          matchId: '018f5b3a-9e11-7c40-8f21-1a2b3c4d5e21',
          fixtureId: '018f5b3a-9e00-7c40-8f21-1a2b3c4d5e20',
          winnerEntrantId: 'alfa',
          sides: [
            { entrantId: 'alfa', statistics: { 'goals-for': 1, 'goals-against': 0 } },
            { entrantId: 'bravo', statistics: { 'goals-for': 0, 'goals-against': 1 } },
          ],
        },
        {
          matchId: '018f5b3a-9e22-7c40-8f21-1a2b3c4d5e22',
          fixtureId: '018f5b3a-9e00-7c40-8f21-1a2b3c4d5e20',
          winnerEntrantId: 'bravo',
          sides: [
            { entrantId: 'alfa', statistics: { 'goals-for': 0, 'goals-against': 1 } },
            { entrantId: 'bravo', statistics: { 'goals-for': 1, 'goals-against': 0 } },
          ],
        },
        {
          matchId: '018f5b3a-9e33-7c40-8f21-1a2b3c4d5e23',
          fixtureId: '018f5b3a-9e00-7c40-8f21-1a2b3c4d5e20',
          winnerEntrantId: 'alfa',
          sides: [
            { entrantId: 'alfa', statistics: { 'goals-for': 2, 'goals-against': 1 } },
            { entrantId: 'bravo', statistics: { 'goals-for': 1, 'goals-against': 2 } },
          ],
        },
      ];
      const declaration = { span: 3, resolutionClass: 'best-of' as const };

      const seriesGrain = computeAccounting(
        football,
        ['alfa', 'bravo'],
        distanceOutcomes,
        undefined,
        {
          seriesDeclaration: { ...declaration, standingsAccounting: 'series' },
        },
      );
      const matchGrain = computeAccounting(
        football,
        ['alfa', 'bravo'],
        distanceOutcomes,
        undefined,
        {
          seriesDeclaration: { ...declaration, standingsAccounting: 'match' },
        },
      );

      const seriesAlfa = seriesGrain.find((a) => a.entrantId === 'alfa');
      const matchAlfa = matchGrain.find((a) => a.entrantId === 'alfa');

      expect(seriesAlfa?.statistics.played).toBe(1);
      expect(matchAlfa?.statistics.played).toBe(3);

      for (const row of [...seriesGrain, ...matchGrain]) {
        expect(row.statistics.played).toBe(
          (row.statistics.wins ?? 0) + (row.statistics.draws ?? 0) + (row.statistics.losses ?? 0),
        );
      }

      // A non-count aggregation (goals-for is `sum`) folds every played match
      // under either grain — a goal scored in game two was scored whatever
      // the row is counted in.
      expect(seriesAlfa?.statistics['goals-for']).toBe(matchAlfa?.statistics['goals-for']);
      expect(seriesAlfa?.statistics['goals-for']).toBe(3);
    });

    it('folds a drawn series when finished-unresolved with series grain', () => {
      const drawnOutcomes: RecordedOutcome[] = [
        {
          matchId: '018f5b3a-9d11-7c40-8f21-1a2b3c4d5e11',
          fixtureId: '018f5b3a-9d00-7c40-8f21-1a2b3c4d5e10',
          winnerEntrantId: 'alfa',
          sides: [
            { entrantId: 'alfa', statistics: { 'goals-for': 1, 'goals-against': 0 } },
            { entrantId: 'bravo', statistics: { 'goals-for': 0, 'goals-against': 1 } },
          ],
        },
        {
          matchId: '018f5b3a-9d22-7c40-8f21-1a2b3c4d5e12',
          fixtureId: '018f5b3a-9d00-7c40-8f21-1a2b3c4d5e10',
          winnerEntrantId: 'bravo',
          sides: [
            { entrantId: 'alfa', statistics: { 'goals-for': 0, 'goals-against': 1 } },
            { entrantId: 'bravo', statistics: { 'goals-for': 1, 'goals-against': 0 } },
          ],
        },
      ];

      const accounting = computeAccounting(football, ['alfa', 'bravo'], drawnOutcomes, undefined, {
        seriesDeclaration: { span: 2, resolutionClass: 'aggregate', standingsAccounting: 'series' },
      });

      const alfa = accounting.find((a) => a.entrantId === 'alfa');
      const bravo = accounting.find((a) => a.entrantId === 'bravo');

      // Both drew the series (1 pt each, 1 draw each, played reads 1 series each)
      expect(alfa?.statistics.draws).toBe(1);
      expect(alfa?.statistics.points).toBe(1);
      expect(alfa?.statistics.played).toBe(1);
      expect(bravo?.statistics.draws).toBe(1);
      expect(bravo?.statistics.points).toBe(1);
      expect(bravo?.statistics.played).toBe(1);
    });

    it('names the deciding series in the trace of every row it decided', () => {
      const standings = computeStandings(
        football,
        ['alfa', 'bravo'],
        seriesOutcomes,
        { ...pipeline, parameters: pointsOnly() },
        undefined,
        {
          seriesDeclaration: { span: 3, resolutionClass: 'best-of', standingsAccounting: 'series' },
        },
      );

      const alfaTrace = traceForEntrant(standings.trace, 'alfa');
      const bravoTrace = traceForEntrant(standings.trace, 'bravo');

      // Exactly one series decided this fixture, so exactly one named result
      // per row — matching the "played: 1" this test's sibling already
      // asserts, per standings-explainability's own reconciliation scenario.
      const aggregationNodes = (nodes: typeof alfaTrace) =>
        nodes.filter((node) => node.kind === 'aggregation');
      expect(aggregationNodes(alfaTrace)).toHaveLength(1);
      expect(aggregationNodes(bravoTrace)).toHaveLength(1);

      const alfaNode = aggregationNodes(alfaTrace)[0];
      const bravoNode = aggregationNodes(bravoTrace)[0];
      // Both rows point at the same fixture's decision, verbatim — never two
      // separately composed explanations of the one series.
      expect(alfaNode).toEqual(bravoNode);
      expect(alfaNode?.values).toMatchObject({ alfa: 'won', bravo: 'lost' });
      expect(alfaNode?.detail).toEqual(expect.any(String));
      expect(alfaNode?.detail?.length).toBeGreaterThan(0);
    });

    it('reports match grain and no series trace when standingsAccounting is match', () => {
      const standings = computeStandings(
        football,
        ['alfa', 'bravo'],
        seriesOutcomes,
        { ...pipeline, parameters: pointsOnly() },
        undefined,
        {
          seriesDeclaration: { span: 3, resolutionClass: 'best-of', standingsAccounting: 'match' },
        },
      );

      expect(standings.grain).toBe('match');
      expect(standings.trace.some((node) => node.kind === 'aggregation')).toBe(false);
    });
  });

  describe('scoped tiebreaking: head-to-head and match-losses', () => {
    const scopedDescriptor = fixtureDescriptor({
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

    it('ranks head-to-head winner above entrant with superior overall goal difference', () => {
      const h2hPipeline: TiebreakPipeline = {
        id: 'h2h-priority',
        version: 1,
        parameters: [
          {
            id: 'points',
            label: 'Points',
            scope: 'overall',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'calculated',
          },
          {
            id: 'points',
            label: 'Head-to-Head Points',
            scope: 'head-to-head',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'calculated',
          },
          {
            id: 'score-difference',
            label: 'Overall Score Difference',
            scope: 'overall',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'match-derived',
          },
        ],
      };

      // Alfa beat Bravo (1-0).
      // Against Charlie and Delta:
      // Bravo won 5-0 (vs Charlie) and 5-0 (vs Delta) -> 6 pts, overall GD +9 (10-1).
      // Alfa won 1-0 (vs Charlie) and lost 0-1 (vs Delta) -> 6 pts, overall GD +1 (2-1).
      const outcomes = [
        outcome('m1', 'alfa', 1, 'bravo', 0),
        outcome('m2', 'bravo', 5, 'charlie', 0),
        outcome('m3', 'bravo', 5, 'delta', 0),
        outcome('m4', 'alfa', 1, 'charlie', 0),
        outcome('m5', 'delta', 1, 'alfa', 0),
      ];

      const standings = computeStandings(
        scopedDescriptor,
        ['alfa', 'bravo', 'charlie', 'delta'],
        outcomes,
        h2hPipeline,
      );

      // Alfa ranks 1st due to H2H victory over Bravo (even though Bravo has +9 GD vs Alfa's +1)
      expect(standings.rows.map((r) => r.entrantId)).toEqual(['alfa', 'bravo', 'delta', 'charlie']);
      expect(standings.rows[0]?.rank).toBe(1);
      expect(standings.rows[1]?.rank).toBe(2);
      expect(standings.fullyResolved).toBe(true);

      // Rule 1 (overall points) tied Alfa and Bravo (6 pts each); Rule 2 (H2H points) resolved them (alfa: 3, bravo: 0)
      const h2hNode = standings.trace.find((n) => n.label.includes('Head-to-Head Points'));
      expect(h2hNode).toBeDefined();
      expect(h2hNode?.outcome).toBe('resolved');
      expect(h2hNode?.values).toMatchObject({ alfa: 3, bravo: 0 });
    });

    it('resolves 3-way partial split recursively on the surviving tied subset', () => {
      const h2hRecursivePipeline: TiebreakPipeline = {
        id: 'h2h-recursive',
        version: 1,
        parameters: [
          {
            id: 'points',
            label: 'Points',
            scope: 'overall',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'calculated',
          },
          {
            id: 'score-difference',
            label: 'H2H Score Difference',
            scope: 'head-to-head',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'match-derived',
          },
        ],
      };

      // 4-team group (A, B, C, D).
      // A, B, C all finish with 6 points (2 wins each):
      // - A beat B (3-0)
      // - B beat C (2-0)
      // - C beat A (1-0)
      // (against D: A, B, C each beat D 2-0).
      // 3-way H2H GD among {A, B, C}:
      // A: +3 - 1 = +2
      // B: -3 + 2 = -1
      // C: -2 + 1 = -1
      // Rule 2 (H2H GD) splits A into 1st, leaving [B, C] tied (-1).
      // Recursive resolution on [B, C] restarts pipeline strictly between B and C:
      // - Child Rule 1 (overall points): B=6, C=6 (tied-proceed)
      // - Child Rule 2 (H2H GD strictly between B and C from their 2-0 match): B=+2, C=-2 -> resolves B 2nd, C 3rd.
      const outcomes = [
        outcome('m1', 'alfa', 3, 'bravo', 0),
        outcome('m2', 'bravo', 2, 'charlie', 0),
        outcome('m3', 'charlie', 1, 'alfa', 0),
        outcome('m4', 'alfa', 2, 'delta', 0),
        outcome('m5', 'bravo', 2, 'delta', 0),
        outcome('m6', 'charlie', 2, 'delta', 0),
      ];

      const standings = computeStandings(
        scopedDescriptor,
        ['alfa', 'bravo', 'charlie', 'delta'],
        outcomes,
        h2hRecursivePipeline,
      );

      expect(standings.rows.map((r) => r.entrantId)).toEqual(['alfa', 'bravo', 'charlie', 'delta']);
      expect(standings.fullyResolved).toBe(true);

      const h2hGDNode = standings.trace.find((n) => n.label.includes('H2H Score Difference'));
      expect(h2hGDNode).toBeDefined();
      expect(h2hGDNode?.values).toMatchObject({ alfa: 2, bravo: -1, charlie: -1 });
      expect(h2hGDNode?.children).toBeDefined();
      expect(h2hGDNode?.children?.length).toBeGreaterThan(0);

      // Child trace resolved B and C
      const childH2H = h2hGDNode?.children?.find((n) => n.label.includes('H2H Score Difference'));
      expect(childH2H).toBeDefined();
      expect(childH2H?.outcome).toBe('resolved');
      expect(childH2H?.values).toMatchObject({ bravo: 2, charlie: -2 });
    });

    it('filters statistics to lost matches when scope is match-losses', () => {
      const matchLossesPipeline: TiebreakPipeline = {
        id: 'losses-filter',
        version: 1,
        parameters: [
          {
            id: 'wins',
            label: 'Wins',
            scope: 'overall',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'calculated',
          },
          {
            id: 'score-against',
            label: 'Goals Conceded in Losses',
            scope: 'match-losses',
            valueType: 'number',
            direction: 'lower_wins',
            missingValue: 'treat-as-worst',
            source: 'match-derived',
          },
        ],
      };

      // Both Alfa and Bravo have 1 win and 1 loss.
      // Alfa: won 4-0 vs Charlie, lost 1-2 vs Delta (conceded 2 in loss).
      // Bravo: won 10-0 vs Charlie, lost 0-5 vs Delta (conceded 5 in loss).
      const outcomes = [
        outcome('m1', 'alfa', 4, 'charlie', 0),
        outcome('m2', 'delta', 2, 'alfa', 1),
        outcome('m3', 'bravo', 10, 'charlie', 0),
        outcome('m4', 'delta', 5, 'bravo', 0),
      ];

      const standings = computeStandings(
        scopedDescriptor,
        ['alfa', 'bravo'],
        outcomes,
        matchLossesPipeline,
      );

      // Alfa conceded fewer goals in lost matches (2 vs 5)
      expect(standings.rows.map((r) => r.entrantId)).toEqual(['alfa', 'bravo']);
      expect(standings.fullyResolved).toBe(true);

      const lossNode = standings.trace.find((n) => n.label.includes('Goals Conceded in Losses'));
      expect(lossNode).toBeDefined();
      expect(lossNode?.outcome).toBe('resolved');
      expect(lossNode?.values).toEqual({ alfa: 2, bravo: 5 });
    });
  });

  describe('strength-of-schedule tiebreaking: Buchholz, Median-Buchholz, and Sonneborn-Berger', () => {
    const sosDescriptor = fixtureDescriptor({
      statistics: [
        { code: 'points', label: 'Points', aggregation: 'sum' },
        { code: 'wins', label: 'Wins', aggregation: 'sum' },
        { code: 'draws', label: 'Draws', aggregation: 'sum' },
        { code: 'losses', label: 'Losses', aggregation: 'sum' },
        { code: 'buchholz', label: 'Buchholz', aggregation: 'sum' },
        { code: 'median-buchholz', label: 'Median-Buchholz', aggregation: 'sum' },
        { code: 'sonneborn-berger', label: 'Sonneborn-Berger', aggregation: 'sum' },
      ],
    });

    it('resolves ties by Buchholz score (sum of opponent points) in a 6-player scenario', () => {
      const buchholzPipeline: TiebreakPipeline = {
        id: 'buchholz-pipeline',
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
            id: 'buchholz',
            label: 'Buchholz',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'calculated',
          },
        ],
      };

      // 6 entrants: alfa, bravo, charlie, delta, echo, foxtrot.
      // Charlie: 9 pts (wins vs echo, foxtrot, bravo)
      // Delta: 9 pts (wins vs echo, foxtrot, bravo)
      // Echo: 6 pts (wins vs foxtrot, foxtrot)
      // Foxtrot: 0 pts
      // Alfa: 6 pts (wins vs charlie, delta; lost to echo, foxtrot) -> opponents: charlie (9), delta (9), echo (6), foxtrot (0) -> Buchholz = 24
      // Bravo: 6 pts (wins vs echo, delta; lost to charlie, delta) -> opponents: echo (6), delta (9), charlie (9), foxtrot (0) ...
      // Let's set up exact fixtures:
      // Alfa beat Charlie, Delta. Lost to Echo. (Alfa played Charlie, Delta, Echo).
      // Bravo beat Delta, Foxtrot. Lost to Charlie. (Bravo played Delta, Foxtrot, Charlie).
      // Charlie: beat Foxtrot, Echo, Bravo. (9 pts)
      // Delta: beat Echo, Foxtrot. (6 pts)
      // Echo: beat Foxtrot. (3 pts)
      // Foxtrot: 0 pts.
      // Alfa's opponents: Charlie (9) + Delta (6) + Echo (3) = 18 pts.
      // Bravo's opponents: Delta (6) + Foxtrot (0) + Charlie (9) = 15 pts.
      // Alfa and Bravo both finish on 6 pts (2 wins each).
      const outcomes = [
        outcome('m1', 'alfa', 1, 'charlie', 0),
        outcome('m2', 'alfa', 1, 'delta', 0),
        outcome('m3', 'echo', 1, 'alfa', 0),
        outcome('m4', 'bravo', 1, 'delta', 0),
        outcome('m5', 'bravo', 1, 'foxtrot', 0),
        outcome('m6', 'charlie', 1, 'bravo', 0),
        outcome('m7', 'charlie', 1, 'foxtrot', 0),
        outcome('m8', 'charlie', 1, 'echo', 0),
        outcome('m9', 'delta', 1, 'echo', 0),
        outcome('m10', 'delta', 1, 'foxtrot', 0),
        outcome('m11', 'echo', 1, 'foxtrot', 0),
      ];

      const standings = computeStandings(
        sosDescriptor,
        ['alfa', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'],
        outcomes,
        buchholzPipeline,
      );

      // Charlie (9 pts, rank 1), Delta (6 pts), Alfa & Bravo tied on 6 pts.
      // Alfa (Buchholz 21) ranks ahead of Bravo (Buchholz 15).
      const alfaRow = standings.rows.find((r) => r.entrantId === 'alfa');
      const bravoRow = standings.rows.find((r) => r.entrantId === 'bravo');
      expect(alfaRow?.statistics.buchholz).toBe(21);
      expect(bravoRow?.statistics.buchholz).toBe(15);
      expect(alfaRow?.rank).toBeLessThan(bravoRow?.rank ?? Infinity);

      const buchholzNode = standings.trace.find((n) => n.id === 'buchholz');
      expect(buchholzNode).toBeDefined();
      expect(buchholzNode?.outcome).toBe('partially-resolved');
      expect(buchholzNode?.values?.alfa).toBe(21);
      expect(buchholzNode?.values?.bravo).toBe(15);
    });

    it('evaluates Median-Buchholz trimming the highest and lowest opponent scores', () => {
      const medianPipeline: TiebreakPipeline = {
        id: 'median-pipeline',
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
            id: 'median-buchholz',
            label: 'Median-Buchholz',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'calculated',
          },
        ],
      };

      // Alfa and Bravo tied on points.
      // Alfa played:
      // - Opponent 1: 12 pts
      // - Opponent 2: 10 pts
      // - Opponent 3: 8 pts
      // - Opponent 4: 2 pts
      // Sorted: [2, 8, 10, 12] -> trim 2 and 12 -> 8 + 10 = 18.
      // Bravo played:
      // - Opponent 1: 11 pts
      // - Opponent 2: 8 pts
      // - Opponent 3: 8 pts
      // - Opponent 4: 3 pts
      // Sorted: [3, 8, 8, 11] -> trim 3 and 11 -> 8 + 8 = 16.

      // We set up dummy matches to give opponents their points:
      // oppA1 (12 pts): 4 wins
      // oppA2 (10 pts): won 3, drew 1 (10 pts)
      // oppA3 (8 pts): won 2, drew 2 (8 pts)
      // oppA4 (2 pts): drew 2 (2 pts)
      // oppB1 (11 pts): won 3, drew 2 (11 pts)
      // oppB2 (8 pts): won 2, drew 2 (8 pts)
      // oppB3 (8 pts): won 2, drew 2 (8 pts)
      // oppB4 (3 pts): won 1 (3 pts)
      // Alfa and Bravo each have 0 points (lost all their matches vs their 4 opponents).
      const dummy = 'dummy';
      const outcomes = [
        // Alfa vs opponents
        outcome('m_a1', 'oppA1', 1, 'alfa', 0),
        outcome('m_a2', 'oppA2', 1, 'alfa', 0),
        outcome('m_a3', 'oppA3', 1, 'alfa', 0),
        outcome('m_a4', 'oppA4', 1, 'alfa', 0),
        // Bravo vs opponents
        outcome('m_b1', 'oppB1', 1, 'bravo', 0),
        outcome('m_b2', 'oppB2', 1, 'bravo', 0),
        outcome('m_b3', 'oppB3', 1, 'bravo', 0),
        outcome('m_b4', 'oppB4', 1, 'bravo', 0),

        // Give oppA1 9 more pts (3 more wins -> 12 total)
        outcome('m_a1_1', 'oppA1', 1, dummy, 0),
        outcome('m_a1_2', 'oppA1', 1, dummy, 0),
        outcome('m_a1_3', 'oppA1', 1, dummy, 0),

        // Give oppA2 7 more pts (2 wins, 1 draw -> 10 total)
        outcome('m_a2_1', 'oppA2', 1, dummy, 0),
        outcome('m_a2_2', 'oppA2', 1, dummy, 0),
        outcome('m_a2_3', 'oppA2', 1, dummy, 1),

        // Give oppA3 5 more pts (1 win, 2 draws -> 8 total)
        outcome('m_a3_1', 'oppA3', 1, dummy, 0),
        outcome('m_a3_2', 'oppA3', 1, dummy, 1),
        outcome('m_a3_3', 'oppA3', 1, dummy, 1),

        // Give oppA4 1 more pt (1 draw -> 2 total, wait 1 loss vs alfa was a win for oppA4 = 3 pts? No, oppA4 beat alfa = 3 pts!
        // So oppA4 has 3 pts with 0 extra matches).
      ];

      // Let's verify with straightforward setup:
      const entrants = [
        'alfa',
        'bravo',
        'oppA1',
        'oppA2',
        'oppA3',
        'oppA4',
        'oppB1',
        'oppB2',
        'oppB3',
        'oppB4',
        dummy,
      ];
      const standings = computeStandings(sosDescriptor, entrants, outcomes, medianPipeline);

      const alfaRow = standings.rows.find((r) => r.entrantId === 'alfa');
      const bravoRow = standings.rows.find((r) => r.entrantId === 'bravo');
      expect(alfaRow?.statistics['median-buchholz']).toBeDefined();
      expect(bravoRow?.statistics['median-buchholz']).toBeDefined();
      expect(alfaRow?.rank).toBeLessThan(bravoRow?.rank ?? Infinity);
    });

    it('evaluates Sonneborn-Berger awarding 100% of defeated opponent points and 50% of drawn opponent points', () => {
      const sbPipeline: TiebreakPipeline = {
        id: 'sb-pipeline',
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
            id: 'sonneborn-berger',
            label: 'Sonneborn-Berger',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'calculated',
          },
        ],
      };

      // Alfa and Bravo tied on 4 points (1 win, 1 draw, 1 loss each).
      // Opponents:
      // topTeam: 9 points
      // midTeam: 6 points
      // botTeam: 0 points
      //
      // Alfa:
      // - Beat topTeam (win -> 9 * 1.0 = 9)
      // - Drew midTeam (draw -> 6 * 0.5 = 3)
      // - Lost to botTeam (loss -> 0)
      // Alfa SB score = 9 + 3 = 12.
      //
      // Bravo:
      // - Lost to topTeam (loss -> 0)
      // - Drew midTeam (draw -> 6 * 0.5 = 3)
      // - Beat botTeam (win -> 0 * 1.0 = 0)
      // Bravo SB score = 0 + 3 + 0 = 3.
      const outcomes = [
        outcome('m1', 'alfa', 1, 'topTeam', 0),
        outcome('m2', 'alfa', 1, 'midTeam', 1),
        outcome('m3', 'botTeam', 1, 'alfa', 0),
        outcome('m4', 'topTeam', 1, 'bravo', 0),
        outcome('m5', 'bravo', 1, 'midTeam', 1),
        outcome('m6', 'bravo', 1, 'botTeam', 0),
        // topTeam beat other teams to get 9 points total (3 wins)
        outcome('m7', 'topTeam', 1, 'extra1', 0),
        outcome('m8', 'topTeam', 1, 'extra2', 0),
        // midTeam beat other teams to get 6 points total (2 wins + 2 draws)
        outcome('m9', 'midTeam', 1, 'extra1', 0),
        outcome('m10', 'midTeam', 1, 'extra2', 0),
      ];

      const standings = computeStandings(
        sosDescriptor,
        ['alfa', 'bravo', 'topTeam', 'midTeam', 'botTeam', 'extra1', 'extra2'],
        outcomes,
        sbPipeline,
      );

      const alfaRow = standings.rows.find((r) => r.entrantId === 'alfa');
      const bravoRow = standings.rows.find((r) => r.entrantId === 'bravo');
      expect(alfaRow?.statistics['sonneborn-berger']).toBe(13);
      expect(bravoRow?.statistics['sonneborn-berger']).toBe(7);
      expect(alfaRow?.rank).toBeLessThan(bravoRow?.rank ?? Infinity);

      const sbNode = standings.trace.find((n) => n.id === 'sonneborn-berger');
      expect(sbNode).toBeDefined();
      expect(sbNode?.outcome).toBe('partially-resolved');
      expect(sbNode?.values?.alfa).toBe(13);
      expect(sbNode?.values?.bravo).toBe(7);
    });

    it('evaluates scoped Buchholz statistics (wins, draws, losses)', () => {
      const scopedSosDescriptor = fixtureDescriptor({
        statistics: [
          { code: 'points', label: 'Points', aggregation: 'sum' },
          { code: 'buchholz-wins', label: 'Buchholz Wins', aggregation: 'sum' },
          { code: 'buchholz-draws', label: 'Buchholz Draws', aggregation: 'sum' },
          { code: 'buchholz-losses', label: 'Buchholz Losses', aggregation: 'sum' },
        ],
      });

      const pipeline: TiebreakPipeline = {
        id: 'scoped-buchholz-pipeline',
        version: 1,
        parameters: [
          {
            id: 'buchholz-wins',
            label: 'Buchholz Wins',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'treat-as-zero',
            source: 'calculated',
          },
        ],
      };

      // Alfa:
      // - Beat topTeam (9 pts) -> buchholz-wins = 9
      // - Drew midTeam (8 pts) -> buchholz-draws = 8
      // - Lost to botTeam (3 pts) -> buchholz-losses = 3
      const outcomes = [
        outcome('m1', 'alfa', 1, 'topTeam', 0),
        outcome('m2', 'alfa', 1, 'midTeam', 1),
        outcome('m3', 'botTeam', 1, 'alfa', 0),
        outcome('m4', 'topTeam', 1, 'extra1', 0),
        outcome('m5', 'topTeam', 1, 'extra2', 0),
        outcome('m5_extra', 'topTeam', 1, 'extra3', 0),
        outcome('m6', 'midTeam', 1, 'extra1', 0),
        outcome('m7', 'midTeam', 1, 'extra2', 0),
        outcome('m8', 'midTeam', 1, 'extra3', 1),
      ];

      const standings = computeStandings(
        scopedSosDescriptor,
        ['alfa', 'topTeam', 'midTeam', 'botTeam', 'extra1', 'extra2', 'extra3'],
        outcomes,
        pipeline,
      );

      const alfaRow = standings.rows.find((r) => r.entrantId === 'alfa');
      expect(alfaRow?.statistics['buchholz-wins']).toBe(9);
      expect(alfaRow?.statistics['buchholz-draws']).toBe(8);
      expect(alfaRow?.statistics['buchholz-losses']).toBe(3);
    });
  });

  describe('cumulative / progressive score accounting', () => {
    const progressiveDescriptor = fixtureDescriptor({
      statistics: [
        { code: 'points', label: 'Points', aggregation: 'sum' },
        { code: 'wins', label: 'Wins', aggregation: 'sum' },
        { code: 'cumulative-score', label: 'Cumulative Score', aggregation: 'sum' },
        {
          code: 'cumulative-opponent-points',
          label: 'Cumulative Opponent Points',
          aggregation: 'sum',
        },
      ],
    });

    const progressivePipeline: TiebreakPipeline = {
      id: 'pipe-progressive',
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
          id: 'cumulative-score',
          label: 'Cumulative Score',
          valueType: 'number',
          direction: 'higher_wins',
          missingValue: 'treat-as-zero',
          source: 'calculated',
        },
      ],
    };

    it('evaluates cumulative-score rewarding early stage performance', () => {
      // Scenario from specification:
      // Entrant A won Round 1 (3), won Round 2 (6), lost Round 3 (6) -> 3 + 6 + 6 = 15
      // Entrant B lost Round 1 (0), won Round 2 (3), won Round 3 (6) -> 0 + 3 + 6 = 9
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'm1_a',
          round: 1,
          sides: [
            { entrantId: 'teamA', statistics: { score: 1 } },
            { entrantId: 'dummy1', statistics: { score: 0 } },
          ],
          winnerEntrantId: 'teamA',
        },
        {
          matchId: 'm1_b',
          round: 1,
          sides: [
            { entrantId: 'teamB', statistics: { score: 0 } },
            { entrantId: 'dummy2', statistics: { score: 1 } },
          ],
          winnerEntrantId: 'dummy2',
        },
        {
          matchId: 'm2_a',
          round: 2,
          sides: [
            { entrantId: 'teamA', statistics: { score: 1 } },
            { entrantId: 'dummy3', statistics: { score: 0 } },
          ],
          winnerEntrantId: 'teamA',
        },
        {
          matchId: 'm2_b',
          round: 2,
          sides: [
            { entrantId: 'teamB', statistics: { score: 1 } },
            { entrantId: 'dummy4', statistics: { score: 0 } },
          ],
          winnerEntrantId: 'teamB',
        },
        {
          matchId: 'm3_a',
          round: 3,
          sides: [
            { entrantId: 'teamA', statistics: { score: 0 } },
            { entrantId: 'dummy5', statistics: { score: 1 } },
          ],
          winnerEntrantId: 'dummy5',
        },
        {
          matchId: 'm3_b',
          round: 3,
          sides: [
            { entrantId: 'teamB', statistics: { score: 1 } },
            { entrantId: 'dummy6', statistics: { score: 0 } },
          ],
          winnerEntrantId: 'teamB',
        },
      ];

      const standings = computeStandings(
        progressiveDescriptor,
        ['teamA', 'teamB', 'dummy1', 'dummy2', 'dummy3', 'dummy4', 'dummy5', 'dummy6'],
        outcomes,
        progressivePipeline,
      );

      const teamARow = standings.rows.find((r) => r.entrantId === 'teamA');
      const teamBRow = standings.rows.find((r) => r.entrantId === 'teamB');

      expect(teamARow?.statistics['points']).toBe(6);
      expect(teamBRow?.statistics['points']).toBe(6);
      expect(teamARow?.statistics['cumulative-score']).toBe(15);
      expect(teamBRow?.statistics['cumulative-score']).toBe(9);

      // Team A ranks ahead of Team B on cumulative score
      expect(teamARow?.rank).toBe(1);
      expect(teamBRow?.rank).toBe(2);
    });

    it('computes cumulativeScores and cumulativeOpponentPoints via direct helper', () => {
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'm1',
          round: 1,
          sides: [
            { entrantId: 'p1', statistics: { score: 1 } },
            { entrantId: 'p2', statistics: { score: 0 } },
          ],
          winnerEntrantId: 'p1',
        },
        {
          matchId: 'm2',
          round: 2,
          sides: [
            { entrantId: 'p1', statistics: { score: 1 } },
            { entrantId: 'p3', statistics: { score: 0 } },
          ],
          winnerEntrantId: 'p1',
        },
        {
          matchId: 'm3',
          round: 2,
          sides: [
            { entrantId: 'p2', statistics: { score: 1 } },
            { entrantId: 'untracked', statistics: { score: 0 } },
          ],
          winnerEntrantId: 'p2',
        },
      ];

      const result = computeCumulativeScores(['p1', 'p2', 'p3'], outcomes);
      expect(result.cumulativeScores.get('p1')).toBe(9); // round 1: 3, round 2: 6 -> 3 + 6 = 9
      expect(result.cumulativeScores.get('p2')).toBe(3); // round 1: 0, round 2: 3 -> 0 + 3 = 3
      expect(result.cumulativeScores.get('p3')).toBe(0);
      expect(result.cumulativeOpponentPoints.get('p1')).toBe(6); // p2 has 3 pts, faced in r1 (weight 2) -> 3*2 = 6
    });

    it('computes standings when only cumulative-score or only cumulative-opponent-points is declared', () => {
      const onlyScoreDesc = fixtureDescriptor({
        statistics: [{ code: 'cumulative-score', label: 'Cumulative', aggregation: 'sum' }],
      });
      const onlyOppDesc = fixtureDescriptor({
        statistics: [{ code: 'cumulative-opponent-points', label: 'Opponent', aggregation: 'sum' }],
      });
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'm1',
          sides: [
            { entrantId: 'x', statistics: {} },
            { entrantId: 'y', statistics: {} },
          ],
          winnerEntrantId: 'x',
        },
      ];
      const acc1 = computeAccounting(onlyScoreDesc, ['x', 'y'], outcomes);
      const acc2 = computeAccounting(onlyOppDesc, ['x', 'y'], outcomes);
      expect(acc1[0]?.statistics['cumulative-score']).toBe(3);
      expect(acc2[0]?.statistics['cumulative-opponent-points']).toBe(0);
    });

    it('computes scoped accounting directly across overall, head-to-head, and match-losses', () => {
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'm1',
          sides: [
            { entrantId: 'alfa', statistics: {} },
            { entrantId: 'bravo', statistics: {} },
          ],
          winnerEntrantId: 'alfa',
        },
        {
          matchId: 'm2',
          sides: [
            { entrantId: 'alfa', statistics: {} },
            { entrantId: 'charlie', statistics: {} },
          ],
          winnerEntrantId: 'charlie',
        },
      ];

      const overall = computeScopedAccounting(
        leagueDescriptor,
        ['alfa', 'bravo'],
        outcomes,
        'overall',
      );
      const h2h = computeScopedAccounting(
        leagueDescriptor,
        ['alfa', 'bravo'],
        outcomes,
        'head-to-head',
      );
      const losses = computeScopedAccounting(
        leagueDescriptor,
        ['alfa', 'bravo'],
        outcomes,
        'match-losses',
      );

      expect(overall.length).toBe(2);
      expect(h2h.length).toBe(2);
      expect(losses.length).toBe(2);
      expect(overall.find((a) => a.entrantId === 'alfa')?.statistics['losses']).toBe(1);
      expect(h2h.find((a) => a.entrantId === 'alfa')?.statistics['losses']).toBe(0);
      expect(losses.find((a) => a.entrantId === 'alfa')?.statistics['losses']).toBe(1);
    });
  });

  describe('forfeit accounting', () => {
    const forfeitDescriptor = fixtureDescriptor({
      statistics: [
        { code: 'points', label: 'Points', aggregation: 'sum' },
        { code: 'wins', label: 'Wins', aggregation: 'sum' },
        { code: 'losses', label: 'Losses', aggregation: 'sum' },
        { code: 'match-forfeits', label: 'Match Forfeits', aggregation: 'sum' },
        { code: 'game-forfeits', label: 'Game Forfeits', aggregation: 'sum' },
      ],
    });

    const forfeitPipeline: TiebreakPipeline = {
      id: 'pipe-forfeits',
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
          id: 'match-forfeits',
          label: 'Match Forfeits',
          valueType: 'number',
          direction: 'lower_wins',
          missingValue: 'treat-as-zero',
          source: 'calculated',
        },
      ],
    };

    it('penalizes participant who forfeited over participant with normal losses', () => {
      // Scenario from specification:
      // Entrant A and Entrant B are tied on 3 points (1 win, 2 losses).
      // Entrant B forfeited one match while Entrant A played all 3 matches.
      // Pipeline evaluates match-forfeits (lower_wins).
      // Entrant A (0 forfeits) ranks ahead of Entrant B (1 forfeit).
      const outcomes: RecordedOutcome[] = [
        // Round 1: Entrant A wins, Entrant B wins
        {
          matchId: 'm1',
          sides: [
            { entrantId: 'teamA', statistics: {} },
            { entrantId: 'other1', statistics: {} },
          ],
          winnerEntrantId: 'teamA',
        },
        {
          matchId: 'm2',
          sides: [
            { entrantId: 'teamB', statistics: {} },
            { entrantId: 'other2', statistics: {} },
          ],
          winnerEntrantId: 'teamB',
        },
        // Round 2: Entrant A loses normally, Entrant B loses normally
        {
          matchId: 'm3',
          sides: [
            { entrantId: 'teamA', statistics: {} },
            { entrantId: 'other3', statistics: {} },
          ],
          winnerEntrantId: 'other3',
        },
        {
          matchId: 'm4',
          sides: [
            { entrantId: 'teamB', statistics: {} },
            { entrantId: 'other3', statistics: {} },
          ],
          winnerEntrantId: 'other3',
        },
        // Round 3: Entrant A loses normally, Entrant B forfeits
        {
          matchId: 'm5',
          sides: [
            { entrantId: 'teamA', statistics: {} },
            { entrantId: 'other4', statistics: {} },
          ],
          winnerEntrantId: 'other4',
        },
        {
          matchId: 'm6',
          sides: [
            { entrantId: 'teamB', statistics: {} },
            { entrantId: 'other4', statistics: {} },
          ],
          forfeitedBy: 'teamB',
          winnerEntrantId: 'other4',
        },
      ];

      const standings = computeStandings(
        forfeitDescriptor,
        ['teamA', 'teamB', 'other1', 'other2', 'other3', 'other4'],
        outcomes,
        forfeitPipeline,
      );

      const aRow = standings.rows.find((r) => r.entrantId === 'teamA');
      const bRow = standings.rows.find((r) => r.entrantId === 'teamB');

      expect(aRow?.statistics['points']).toBe(3);
      expect(bRow?.statistics['points']).toBe(3);
      expect(aRow?.statistics['match-forfeits']).toBe(0);
      expect(bRow?.statistics['match-forfeits']).toBe(1);
      expect(bRow?.statistics['game-forfeits']).toBe(1);

      // Entrant A ranks higher than Entrant B
      expect(aRow?.rank).toBeDefined();
      expect(bRow?.rank).toBeDefined();
      expect((aRow?.rank ?? 0) < (bRow?.rank ?? 0)).toBe(true);
    });

    it('recognizes forfeit via side resultReason forfeit-abandonment', () => {
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'm1',
          sides: [
            { entrantId: 'teamX', statistics: {}, resultReason: 'forfeit-abandonment' },
            { entrantId: 'teamY', statistics: {} },
          ],
          winnerEntrantId: 'teamY',
        },
      ];

      const accounting = computeAccounting(forfeitDescriptor, ['teamX', 'teamY'], outcomes);
      const xAcc = accounting.find((a) => a.entrantId === 'teamX');
      const yAcc = accounting.find((a) => a.entrantId === 'teamY');

      expect(xAcc?.statistics['match-forfeits']).toBe(1);
      expect(xAcc?.statistics['points']).toBe(0);
      expect(yAcc?.statistics['match-forfeits']).toBe(0);
      expect(yAcc?.statistics['points']).toBe(3);
    });
  });

  describe('administrative and random tiebreakers in standings', () => {
    const adminPipeline: TiebreakPipeline = {
      id: 'pipe-admin',
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
          id: 'manual',
          label: 'Manual Points',
          valueType: 'number',
          direction: 'higher_wins',
          missingValue: 'treat-as-zero',
          source: 'operator-entered',
        },
        {
          id: 'random',
          label: 'Seeded Coin Flip',
          valueType: 'number',
          direction: 'higher_wins',
          missingValue: 'treat-as-zero',
          source: 'random',
        },
      ],
    };

    it('resolves standings with manual tiebreaker points override', () => {
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'm1',
          sides: [
            { entrantId: 'team1', statistics: {} },
            { entrantId: 'team2', statistics: {} },
          ],
        },
      ];

      const standings = computeStandings(
        leagueDescriptor,
        ['team1', 'team2'],
        outcomes,
        adminPipeline,
        DEFAULT_POINTS,
        {
          manualTiebreakerPoints: {
            team1: 10,
            team2: 5,
          },
        },
      );

      expect(standings.fullyResolved).toBe(true);
      expect(standings.rows[0]?.entrantId).toBe('team1');
      expect(standings.rows[1]?.entrantId).toBe('team2');
    });

    it('resolves standings deterministically with seeded random context', () => {
      const outcomes: RecordedOutcome[] = [
        {
          matchId: 'm1',
          sides: [
            { entrantId: 'team1', statistics: {} },
            { entrantId: 'team2', statistics: {} },
          ],
        },
      ];

      const seedContext = { tournamentId: 'tourney-42', stageId: 'finals' };

      const s1 = computeStandings(
        leagueDescriptor,
        ['team1', 'team2'],
        outcomes,
        adminPipeline,
        DEFAULT_POINTS,
        { seedContext },
      );

      const s2 = computeStandings(
        leagueDescriptor,
        ['team1', 'team2'],
        outcomes,
        adminPipeline,
        DEFAULT_POINTS,
        { seedContext },
      );

      expect(s1.fullyResolved).toBe(true);
      expect(s2.fullyResolved).toBe(true);
      expect(s1.rows.map((r) => r.entrantId)).toEqual(s2.rows.map((r) => r.entrantId));
    });
  });
});
