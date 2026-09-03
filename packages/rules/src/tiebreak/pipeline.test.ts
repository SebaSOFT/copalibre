import { expectGolden } from '../test-support/golden.js';
import {
  resolveTiebreak,
  deterministicTiebreakHash,
  type TiebreakPipeline,
  type TiebreakParameterDefinition,
  type EntrantValues,
} from './pipeline.js';

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

describe('the ratio comparator', () => {
  const kd: TiebreakParameterDefinition = {
    id: 'kd',
    label: 'K/D',
    ratio: { numerator: 'frags', denominator: 'deaths', zeroDenominator: 'numerator-only' },
    valueType: 'number',
    direction: 'higher_wins',
    missingValue: 'treat-as-worst',
    source: 'calculated',
  };
  const ratioPipeline: TiebreakPipeline = { id: 'kd-only', version: 1, parameters: [kd] };

  it('divides the two declared statistics rather than reading its own id', () => {
    const resolution = resolveTiebreak(ratioPipeline, ['volume', 'precise'], {
      volume: { frags: 40, deaths: 40 },
      precise: { frags: 20, deaths: 5 },
    });

    expect(resolution.rankedGroups).toEqual([['precise'], ['volume']]);
    // The trace shows the computed ratio, not the raw inputs: an operator
    // comparing 4 against 1 needs to see those numbers.
    expect(resolution.trace[0]?.values).toEqual({ precise: 4, volume: 1 });
  });

  it('ranks on the numerator alone when the denominator is zero and that is declared', () => {
    const resolution = resolveTiebreak(ratioPipeline, ['flawless', 'steady'], {
      flawless: { frags: 12, deaths: 0 },
      steady: { frags: 30, deaths: 10 },
    });

    expect(resolution.rankedGroups).toEqual([['flawless'], ['steady']]);
  });

  it('treats a zero denominator as absent where the discipline declares that', () => {
    const resolution = resolveTiebreak(
      {
        ...ratioPipeline,
        parameters: [
          {
            ...kd,
            ratio: { numerator: 'frags', denominator: 'deaths', zeroDenominator: 'treat-as-worst' },
          },
        ],
      },
      ['flawless', 'steady'],
      { flawless: { frags: 12, deaths: 0 }, steady: { frags: 30, deaths: 10 } },
    );

    expect(resolution.rankedGroups).toEqual([['steady'], ['flawless']]);
    expect(resolution.trace[0]?.values).toMatchObject({ flawless: null });
  });

  it.each([
    ['the numerator', { frags: undefined, deaths: 5 }],
    ['the denominator', { frags: 5, deaths: undefined }],
    ['a non-numeric operand', { frags: 'many', deaths: 5 }],
  ])('reads as absent when %s was never recorded', (_case, values) => {
    const resolution = resolveTiebreak(ratioPipeline, ['partial', 'complete'], {
      partial: values as Record<string, unknown>,
      complete: { frags: 1, deaths: 10 },
    });

    expect(resolution.rankedGroups).toEqual([['complete'], ['partial']]);
  });

  it('leaves equal ratios tied for the next comparator', () => {
    const resolution = resolveTiebreak(ratioPipeline, ['alfa', 'bravo'], {
      alfa: { frags: 10, deaths: 5 },
      bravo: { frags: 20, deaths: 10 },
    });

    expect(resolution.fullyResolved).toBe(false);
    expect(resolution.rankedGroups).toEqual([['alfa', 'bravo']]);
  });
});

describe('deterministicTiebreakHash', () => {
  it('produces identical hash for identical tournament, stage, and entrant IDs', () => {
    const h1 = deterministicTiebreakHash('tourney-1', 'stage-1', 'entrant-a');
    const h2 = deterministicTiebreakHash('tourney-1', 'stage-1', 'entrant-a');
    expect(h1).toBe(h2);
  });

  it('produces distinct hashes for different entrants', () => {
    const hA = deterministicTiebreakHash('tourney-1', 'stage-1', 'entrant-a');
    const hB = deterministicTiebreakHash('tourney-1', 'stage-1', 'entrant-b');
    expect(hA).not.toBe(hB);
  });

  it('produces distinct distributions across stages for same entrants', () => {
    const s1 = deterministicTiebreakHash('tourney-1', 'stage-1', 'entrant-a');
    const s2 = deterministicTiebreakHash('tourney-1', 'stage-2', 'entrant-a');
    expect(s1).not.toBe(s2);
  });
});

describe('administrative and random tiebreaker resolution', () => {
  const randomPipeline: TiebreakPipeline = {
    id: 'pipe-random',
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
        id: 'random',
        label: 'Seeded Coin Flip',
        valueType: 'number',
        direction: 'higher_wins',
        missingValue: 'treat-as-zero',
        source: 'random',
      },
    ],
  };

  it('deterministically breaks ties using seeded random comparator', () => {
    const seedContext = { tournamentId: 'world-cup-2026', stageId: 'group-a' };
    const values: EntrantValues = {
      alfa: { points: 10 },
      bravo: { points: 10 },
    };

    const res1 = resolveTiebreak(randomPipeline, ['alfa', 'bravo'], values, { seedContext });
    const res2 = resolveTiebreak(randomPipeline, ['alfa', 'bravo'], values, { seedContext });

    expect(res1.fullyResolved).toBe(true);
    expect(res2.fullyResolved).toBe(true);
    expect(res1.rankedGroups).toEqual(res2.rankedGroups);
    expect(res1.trace.length).toBeGreaterThan(0);
  });

  it('resolves ties using manual tiebreaker points override', () => {
    const manualPipeline: TiebreakPipeline = {
      id: 'pipe-manual',
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
          label: 'Administrative Tiebreaker',
          valueType: 'number',
          direction: 'higher_wins',
          missingValue: 'treat-as-zero',
          source: 'operator-entered',
        },
      ],
    };

    const values: EntrantValues = {
      alfa: { points: 10 },
      bravo: { points: 10 },
    };

    const manualPoints = {
      alfa: 2,
      bravo: 5,
    };

    const resolution = resolveTiebreak(manualPipeline, ['alfa', 'bravo'], values, {
      manualTiebreakerPoints: manualPoints,
    });

    expect(resolution.fullyResolved).toBe(true);
    // bravo has 5 manual points vs alfa with 2
    expect(resolution.rankedGroups).toEqual([['bravo'], ['alfa']]);
  });
});
