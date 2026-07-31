import {
  bindCapabilities,
  fixtureDescriptor,
  type CapabilityBinding,
  type TournamentProfile,
} from '@copalibre/domain';
import { bindTiebreakPipeline, type TiebreakPipeline } from '@copalibre/rules';
import { QualificationError } from '../errors.js';
import type { EntrantAccounting } from '../standings/index.js';
import { applyCutResolution, evaluateQualification } from './index.js';

/** A shooter's stage table: frags, deaths, and the matches played. */
const accounting = (
  rows: readonly { id: string; frags: number; deaths: number }[],
): readonly EntrantAccounting[] =>
  rows.map((row) => ({
    entrantId: row.id,
    statistics: { frags: row.frags, deaths: row.deaths, played: 5 },
  }));

const byFrags: TiebreakPipeline = {
  id: 'most-frags',
  version: 1,
  parameters: [
    {
      id: 'frags',
      label: 'Frags',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-worst',
      source: 'match-derived',
    },
  ],
};

const byKd: TiebreakPipeline = {
  id: 'kd-ratio',
  version: 1,
  parameters: [
    {
      id: 'kd',
      label: 'K/D',
      ratio: { numerator: 'frags', denominator: 'deaths', zeroDenominator: 'numerator-only' },
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-worst',
      source: 'calculated',
    },
  ],
};

describe('qualification cut', () => {
  const field = accounting([
    { id: 'alfa', frags: 40, deaths: 10 },
    { id: 'bravo', frags: 30, deaths: 15 },
    { id: 'charlie', frags: 20, deaths: 20 },
    { id: 'delta', frags: 10, deaths: 25 },
  ]);

  it('advances the top N in comparator order', () => {
    const outcome = evaluateQualification({ accounting: field, pipeline: byFrags, advance: 2 });

    expect(outcome.resolved).toBe(true);
    expect(outcome.qualified).toEqual(['alfa', 'bravo']);
    expect(outcome.eliminated).toEqual(['charlie', 'delta']);
  });

  it('emits the cut on the existing trace contract, after the comparator trace', () => {
    const { trace } = evaluateQualification({ accounting: field, pipeline: byFrags, advance: 2 });

    expect(trace.at(-1)).toMatchObject({
      kind: 'threshold',
      id: 'qualification-cut',
      outcome: 'resolved',
      values: { advance: 2 },
    });
    expect(trace[0]?.kind).toBe('comparator');
  });

  it('advances everyone when the cut takes the whole field', () => {
    const outcome = evaluateQualification({ accounting: field, pipeline: byFrags, advance: 4 });
    expect(outcome.qualified).toHaveLength(4);
    expect(outcome.eliminated).toEqual([]);
  });

  it.each([[0], [-1], [1.5]])('refuses an advance count of %p', (advance) => {
    expect(() => evaluateQualification({ accounting: field, pipeline: byFrags, advance })).toThrow(
      QualificationError,
    );
  });

  it('refuses to advance more entrants than the stage holds', () => {
    expect(() =>
      evaluateQualification({ accounting: field, pipeline: byFrags, advance: 9 }),
    ).toThrow(/cannot advance 9 of 4/);
  });
});

describe('the ratio comparator', () => {
  it('ranks by K/D rather than by raw frags', () => {
    const field = accounting([
      { id: 'volume', frags: 40, deaths: 40 }, // 1.0
      { id: 'precise', frags: 20, deaths: 5 }, // 4.0
    ]);

    const outcome = evaluateQualification({ accounting: field, pipeline: byKd, advance: 1 });
    expect(outcome.qualified).toEqual(['precise']);
  });

  it('ranks a zero-death entrant on frags alone where the discipline declares it', () => {
    const field = accounting([
      { id: 'flawless', frags: 12, deaths: 0 },
      { id: 'steady', frags: 30, deaths: 10 }, // 3.0
    ]);

    // 12 (numerator alone) beats 3.0 — the declared behaviour, and the reason it
    // must be declared: an infinite ratio would be a different answer.
    const outcome = evaluateQualification({ accounting: field, pipeline: byKd, advance: 1 });
    expect(outcome.qualified).toEqual(['flawless']);
  });

  it('treats a zero-death entrant as worst where the discipline declares that instead', () => {
    const pipeline: TiebreakPipeline = {
      ...byKd,
      parameters: [
        {
          ...byKd.parameters[0],
          id: 'kd',
          label: 'K/D',
          valueType: 'number',
          direction: 'higher_wins',
          missingValue: 'treat-as-worst',
          source: 'calculated',
          ratio: { numerator: 'frags', denominator: 'deaths', zeroDenominator: 'treat-as-worst' },
        },
      ],
    };
    const field = accounting([
      { id: 'flawless', frags: 12, deaths: 0 },
      { id: 'steady', frags: 30, deaths: 10 },
    ]);

    expect(evaluateQualification({ accounting: field, pipeline, advance: 1 }).qualified).toEqual([
      'steady',
    ]);
  });

  it('degrades through missingValue when a ratio operand was never recorded', () => {
    const field: readonly EntrantAccounting[] = [
      { entrantId: 'partial', statistics: { frags: 10 } },
      { entrantId: 'complete', statistics: { frags: 5, deaths: 5 } },
    ];

    expect(
      evaluateQualification({ accounting: field, pipeline: byKd, advance: 1 }).qualified,
    ).toEqual(['complete']);
  });

  it('binds both operands through the capability binding', () => {
    const shooter = fixtureDescriptor({
      statistics: [
        { code: 'kills', label: 'Kills', aggregation: 'sum' },
        { code: 'downs', label: 'Downs', aggregation: 'sum' },
      ],
      scoringInputs: [],
    });
    const profile = {
      profileId: '01890000-0000-7000-8000-0000000000c1',
      version: '1.0.0',
      name: 'Arena Circuit',
      attribution: { author: 'CopaLibre', licence: 'CC-BY-4.0' },
      requires: [
        { capability: 'primary-scoring', satisfiedBy: ['frags', 'kills'], necessity: 'required' },
        { capability: 'deaths', satisfiedBy: ['deaths', 'downs'], necessity: 'required' },
      ],
      stages: [{ number: 1, name: 'Group', format: 'round-robin' }],
      points: { win: 3, draw: 1, loss: 0 },
      tiebreak: [],
    } as unknown as TournamentProfile;

    const binding = bindCapabilities(shooter, profile);
    if (!binding.ok) throw binding.error;

    const bound = bindTiebreakPipeline(
      {
        id: 'kd',
        version: 1,
        parameters: [
          {
            capability: 'primary-scoring',
            label: 'K/D',
            direction: 'higher_wins',
            missingValue: 'treat-as-worst',
            ratio: {
              numeratorCapability: 'primary-scoring',
              denominatorCapability: 'deaths',
              zeroDenominator: 'numerator-only',
            },
          },
        ],
      },
      binding.value as CapabilityBinding,
    );

    // The profile said "K/D"; this discipline calls them kills and downs.
    expect(bound.parameters[0]?.ratio).toEqual({
      numerator: 'kills',
      denominator: 'downs',
      zeroDenominator: 'numerator-only',
    });
    expect(bound.parameters[0]?.bound).toBe(true);

    const field: readonly EntrantAccounting[] = [
      { entrantId: 'alfa', statistics: { kills: 40, downs: 10 } },
      { entrantId: 'bravo', statistics: { kills: 30, downs: 3 } },
    ];
    expect(
      evaluateQualification({ accounting: field, pipeline: bound, advance: 1 }).qualified,
    ).toEqual(['bravo']);
  });

  it('reads as unbound when only one operand resolves', () => {
    const descriptor = fixtureDescriptor({
      statistics: [{ code: 'kills', label: 'Kills', aggregation: 'sum' }],
      scoringInputs: [],
    });
    const profile = {
      profileId: '01890000-0000-7000-8000-0000000000c2',
      version: '1.0.0',
      name: 'Arena Circuit',
      attribution: { author: 'CopaLibre', licence: 'CC-BY-4.0' },
      requires: [
        { capability: 'primary-scoring', satisfiedBy: ['kills'], necessity: 'required' },
        { capability: 'deaths', satisfiedBy: ['downs'], necessity: 'optional' },
      ],
      stages: [{ number: 1, name: 'Group', format: 'round-robin' }],
      points: { win: 3, draw: 1, loss: 0 },
      tiebreak: [],
    } as unknown as TournamentProfile;

    const binding = bindCapabilities(descriptor, profile);
    if (!binding.ok) throw binding.error;

    const bound = bindTiebreakPipeline(
      {
        id: 'kd',
        version: 1,
        parameters: [
          {
            capability: 'primary-scoring',
            label: 'K/D',
            direction: 'higher_wins',
            missingValue: 'treat-as-worst',
            ratio: {
              numeratorCapability: 'primary-scoring',
              denominatorCapability: 'deaths',
              zeroDenominator: 'numerator-only',
            },
          },
        ],
      },
      binding.value as CapabilityBinding,
    );

    expect(bound.parameters[0]?.bound).toBe(false);
    expect(bound.parameters[0]?.unboundCapability).toBe('primary-scoring');
    expect(bound.parameters[0]?.ratio).toBeUndefined();
  });
});

describe('a contested cut', () => {
  const tied = accounting([
    { id: 'alfa', frags: 40, deaths: 10 },
    { id: 'bravo', frags: 20, deaths: 10 },
    { id: 'charlie', frags: 20, deaths: 10 },
    { id: 'delta', frags: 5, deaths: 30 },
  ]);

  const input = { accounting: tied, pipeline: byFrags, advance: 2 };

  it('never selects arbitrarily when the line falls inside a tie', () => {
    const outcome = evaluateQualification(input);

    expect(outcome.resolved).toBe(false);
    expect(outcome.qualified).toEqual([]);
    expect(outcome.contested).toEqual({
      entrantIds: ['bravo', 'charlie'],
      places: [2, 3],
      slots: 1,
    });
  });

  it('says in the trace which entrants contest which places', () => {
    const { trace } = evaluateQualification(input);
    expect(trace.at(-1)).toMatchObject({
      outcome: 'unresolved-tie',
      values: { contested: ['bravo', 'charlie'], slots: 1 },
    });
  });

  it('resolves through a declared method and records it', () => {
    const contested = evaluateQualification(input);
    const resolved = applyCutResolution(contested, input, {
      kind: 'declared',
      method: 'head-to-head playoff',
      order: ['charlie', 'bravo'],
    });

    expect(resolved.resolved).toBe(true);
    expect(resolved.qualified).toEqual(['alfa', 'charlie']);
    expect(resolved.eliminated).toEqual(['bravo', 'delta']);
    expect(resolved.trace.at(-1)).toMatchObject({
      id: 'cut-resolution:declared',
      values: { method: 'head-to-head playoff' },
    });
  });

  it('resolves through an audited operator override, kept distinct from a declared method', () => {
    const contested = evaluateQualification(input);
    const resolved = applyCutResolution(contested, input, {
      kind: 'operator-override',
      actor: 'user:organizer-1',
      reason: 'Coin toss at the venue, witnessed by both captains',
      order: ['bravo', 'charlie'],
    });

    expect(resolved.qualified).toEqual(['alfa', 'bravo']);
    expect(resolved.trace.at(-1)).toMatchObject({
      id: 'cut-resolution:operator-override',
      values: { actor: 'user:organizer-1' },
    });
  });

  it('refuses a resolution that does not order exactly the contested entrants', () => {
    const contested = evaluateQualification(input);

    expect(() =>
      applyCutResolution(contested, input, {
        kind: 'declared',
        method: 'playoff',
        order: ['bravo'],
      }),
    ).toThrow(/exactly the contested entrants/);

    expect(() =>
      applyCutResolution(contested, input, {
        kind: 'declared',
        method: 'playoff',
        order: ['bravo', 'charlie', 'delta'],
      }),
    ).toThrow(QualificationError);
  });

  it('refuses to resolve a cut that was never contested', () => {
    const clean = evaluateQualification({ accounting: tied, pipeline: byFrags, advance: 1 });
    expect(clean.resolved).toBe(true);

    expect(() =>
      applyCutResolution(
        clean,
        { accounting: tied, pipeline: byFrags, advance: 1 },
        {
          kind: 'declared',
          method: 'playoff',
          order: ['bravo', 'charlie'],
        },
      ),
    ).toThrow(/not contested/);
  });

  it('is unaffected by a tie that sits wholly above or below the line', () => {
    // bravo and charlie are tied, but both advance: nothing is contested.
    const outcome = evaluateQualification({ accounting: tied, pipeline: byFrags, advance: 3 });
    expect(outcome.resolved).toBe(true);
    expect(outcome.qualified).toEqual(['alfa', 'bravo', 'charlie']);
  });
});
