import type { TiebreakPipeline } from '@copalibre/rules';
import { tennisDescriptor, type RecordedOutcome } from '@copalibre/domain';
import { computeStandings } from './index.js';

/**
 * Regression cover for the defect that motivated 0009.
 *
 * A tennis group bound correctly by phase 8 (`primary-scoring → matches-won`,
 * `secondary-scoring → sets-won`, `tertiary-scoring → games-won`) still ranked
 * wrong, because accounting emitted a fixed football vocabulary: all three
 * comparators read `null`, degraded through `missingValue`, and left a group
 * tied that the results resolve outright. The binding reported `resolved` while
 * the table was wrong — a silent-wrong-ranking failure.
 */

const tennis = tennisDescriptor();

const pipeline: TiebreakPipeline = {
  id: 'tennis-group',
  version: 1,
  parameters: [
    {
      id: 'matches-won',
      label: 'Matches won',
      valueType: 'number',
      direction: 'higher_wins',
      // Deliberately the degrading behaviour: if accounting stops emitting the
      // code, this test fails on the values rather than quietly on the order.
      missingValue: 'treat-as-worst',
      source: 'match-derived',
    },
    {
      id: 'sets-won',
      label: 'Sets won',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-worst',
      source: 'match-derived',
    },
    {
      id: 'games-won',
      label: 'Games won',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-worst',
      source: 'match-derived',
    },
  ],
};

/** One completed tennis match, recorded at all three levels at once. */
function played(
  matchId: string,
  winner: string,
  loser: string,
  sets: readonly [number, number],
  games: readonly [number, number],
): RecordedOutcome {
  return {
    matchId,
    winnerEntrantId: winner,
    sides: [
      {
        entrantId: winner,
        statistics: {
          'matches-won': 1,
          'matches-lost': 0,
          'sets-won': sets[0],
          'sets-lost': sets[1],
          'games-won': games[0],
          'games-lost': games[1],
        },
      },
      {
        entrantId: loser,
        statistics: {
          'matches-won': 0,
          'matches-lost': 1,
          'sets-won': sets[1],
          'sets-lost': sets[0],
          'games-won': games[1],
          'games-lost': games[0],
        },
      },
    ],
  };
}

const group = ['alfa', 'bravo', 'charlie'];

describe('tennis group regression', () => {
  it('resolves the three-way tie the pre-0009 accounting could not', () => {
    const standings = computeStandings(
      tennis,
      group,
      [
        played('m1', 'alfa', 'bravo', [2, 1], [18, 14]),
        played('m2', 'bravo', 'charlie', [2, 0], [12, 6]),
        played('m3', 'charlie', 'alfa', [2, 1], [15, 13]),
      ],
      pipeline,
    );

    // Everyone is 1-1 on matches; sets separate charlie, games separate the rest.
    expect(standings.rows.map((row) => row.entrantId)).toEqual(['alfa', 'bravo', 'charlie']);
    expect(standings.rows.every((row) => !row.sharedRank)).toBe(true);
    expect(standings.fullyResolved).toBe(true);
  });

  it('reads a real value in every comparator instead of degrading through missingValue', () => {
    const standings = computeStandings(
      tennis,
      group,
      [
        played('m1', 'alfa', 'bravo', [2, 1], [18, 14]),
        played('m2', 'bravo', 'charlie', [2, 0], [12, 6]),
        played('m3', 'charlie', 'alfa', [2, 1], [15, 13]),
      ],
      pipeline,
    );

    const observed = standings.trace.flatMap((node) => Object.values(node.values ?? {}));
    expect(observed.length).toBeGreaterThan(0);
    expect(observed).not.toContain(null);
    expect(standings.trace.map((node) => node.id)).toEqual([
      'matches-won',
      'sets-won',
      'games-won',
    ]);
  });

  it('cascades a triple tie through matches, then sets, then games', () => {
    const standings = computeStandings(
      tennis,
      group,
      [
        // Each player is 1-1 and finishes on three sets; only games differ.
        played('m1', 'alfa', 'bravo', [2, 1], [19, 15]),
        played('m2', 'bravo', 'charlie', [2, 1], [18, 15]),
        played('m3', 'charlie', 'alfa', [2, 1], [17, 15]),
      ],
      pipeline,
    );

    const [matches, sets, games] = standings.trace;
    expect(matches).toMatchObject({ id: 'matches-won', outcome: 'tied-proceed' });
    expect(sets).toMatchObject({ id: 'sets-won', outcome: 'tied-proceed' });
    expect(games).toMatchObject({ id: 'games-won', outcome: 'resolved' });

    // alfa 19+15=34, bravo 15+18=33, charlie 15+17=32.
    expect(standings.rows.map((row) => row.statistics['games-won'])).toEqual([34, 33, 32]);
    expect(standings.rows.map((row) => row.entrantId)).toEqual(['alfa', 'bravo', 'charlie']);
    expect(standings.fullyResolved).toBe(true);
  });

  it('exposes every level the discipline scores at in the standings row', () => {
    const standings = computeStandings(
      tennis,
      ['alfa', 'bravo'],
      [played('m1', 'alfa', 'bravo', [2, 1], [18, 14])],
      pipeline,
    );

    expect(standings.rows[0]?.statistics).toEqual({
      'matches-won': 1,
      'matches-lost': 0,
      'sets-won': 2,
      'sets-lost': 1,
      'games-won': 18,
      'games-lost': 14,
      played: 1,
    });
  });
});
