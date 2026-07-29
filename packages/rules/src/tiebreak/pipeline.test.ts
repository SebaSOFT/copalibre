import { expectGolden } from '../test-support/golden';
import {
  resolveTiebreak,
  type TiebreakPipeline,
  type TiebreakParameterDefinition,
} from './pipeline';

const points: TiebreakParameterDefinition = {
  id: 'points',
  label: 'Points',
  valueType: 'number',
  direction: 'higher_wins',
  missingValue: 'treat-as-zero',
  source: 'calculated',
};

const goalsConceded: TiebreakParameterDefinition = {
  id: 'goals-conceded',
  label: 'Goals Conceded',
  valueType: 'number',
  direction: 'lower_wins',
  missingValue: 'treat-as-worst',
  source: 'match-derived',
};

const disciplineTier: TiebreakParameterDefinition = {
  id: 'discipline-tier',
  label: 'Discipline Tier',
  valueType: 'ordered-value',
  direction: { orderedValues: ['gold', 'silver', 'bronze'] },
  missingValue: 'invalid',
  source: 'operator-entered',
};

const pipeline: TiebreakPipeline = {
  id: 'standard-test-pipeline',
  version: 1,
  parameters: [points, goalsConceded, disciplineTier],
};

describe('resolveTiebreak', () => {
  it('resolves at the first discriminating comparator (higher_wins)', () => {
    const resolution = resolveTiebreak(pipeline, ['alfa', 'bravo'], {
      alfa: { points: 9 },
      bravo: { points: 7 },
    });
    expect(resolution.fullyResolved).toBe(true);
    expect(resolution.rankedGroups).toEqual([['alfa'], ['bravo']]);
    expect(resolution.trace).toHaveLength(1);
    expect(resolution.trace[0]).toMatchObject({
      id: 'points',
      label: 'Rule 1 (Points)',
      outcome: 'resolved',
    });
    expectGolden('tiebreak-higher-wins', resolution);
  });

  it('falls through to lower_wins when the first comparator ties', () => {
    const resolution = resolveTiebreak(pipeline, ['alfa', 'bravo'], {
      alfa: { points: 9, 'goals-conceded': 4 },
      bravo: { points: 9, 'goals-conceded': 7 },
    });
    expect(resolution.fullyResolved).toBe(true);
    expect(resolution.rankedGroups).toEqual([['alfa'], ['bravo']]);
    expect(resolution.trace.map((node) => node.outcome)).toEqual(['tied-proceed', 'resolved']);
    expectGolden('tiebreak-lower-wins-second', resolution);
  });

  it('resolves via explicit ordered values', () => {
    const resolution = resolveTiebreak(
      { ...pipeline, parameters: [disciplineTier] },
      ['alfa', 'bravo', 'charlie'],
      {
        alfa: { 'discipline-tier': 'silver' },
        bravo: { 'discipline-tier': 'gold' },
        charlie: { 'discipline-tier': 'bronze' },
      },
    );
    expect(resolution.fullyResolved).toBe(true);
    expect(resolution.rankedGroups).toEqual([['bravo'], ['alfa'], ['charlie']]);
    expectGolden('tiebreak-ordered-values', resolution);
  });

  it('partially resolves a three-way tie and continues on the residual group', () => {
    const resolution = resolveTiebreak(pipeline, ['alfa', 'bravo', 'charlie'], {
      alfa: { points: 9, 'goals-conceded': 3 },
      bravo: { points: 9, 'goals-conceded': 3 },
      charlie: { points: 7 },
    });
    // charlie split off by points; alfa/bravo still tied through the pipeline
    // (identical conceded, no tier values -> both invalid -> still tied).
    expect(resolution.fullyResolved).toBe(false);
    expect(resolution.rankedGroups).toEqual([['alfa', 'bravo'], ['charlie']]);
    expect(resolution.trace.at(-1)).toMatchObject({
      id: 'pipeline-exhausted',
      outcome: 'unresolved-tie',
    });
    expectGolden('tiebreak-unresolved', resolution);
  });

  it('treats missing values per declared behavior (treat-as-zero vs treat-as-worst)', () => {
    const zeroed = resolveTiebreak({ ...pipeline, parameters: [points] }, ['alfa', 'bravo'], {
      alfa: { points: -2 },
      bravo: {},
    });
    // bravo missing -> treated as 0, which beats alfa's -2.
    expect(zeroed.rankedGroups).toEqual([['bravo'], ['alfa']]);

    const worst = resolveTiebreak({ ...pipeline, parameters: [goalsConceded] }, ['alfa', 'bravo'], {
      alfa: { 'goals-conceded': 99 },
      bravo: {},
    });
    // bravo missing -> worst, so alfa wins even with terrible defense.
    expect(worst.rankedGroups).toEqual([['alfa'], ['bravo']]);
  });

  it('is deterministic: identical inputs produce identical resolutions', () => {
    const run = () =>
      resolveTiebreak(pipeline, ['alfa', 'bravo', 'charlie'], {
        alfa: { points: 9, 'goals-conceded': 3 },
        bravo: { points: 9, 'goals-conceded': 5 },
        charlie: { points: 9, 'goals-conceded': 5, 'discipline-tier': 'gold' },
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('handles a single-entrant group without touching any comparator', () => {
    const resolution = resolveTiebreak(pipeline, ['solo'], { solo: { points: 1 } });
    expect(resolution.fullyResolved).toBe(true);
    expect(resolution.trace).toHaveLength(0);
  });
});
