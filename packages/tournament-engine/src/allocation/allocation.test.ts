import type { EntrantAttribute, StageAllocation } from '@copalibre/domain';
import { AllocationError } from '../errors.js';
import { generateFixtures } from '../fixtures/index.js';
import { expectGolden, summarise } from '../test-support/golden.js';
import { allocateSeeds, type AllocationEntrant } from './index.js';

const ranking = (value: number): EntrantAttribute[] => [{ key: 'ranking', value, kind: 'numeric' }];

/** Four clubs whose ranking deliberately disagrees with their group finish. */
const field: readonly AllocationEntrant[] = [
  { entrantId: 'union', attributes: ranking(4) },
  { entrantId: 'sanmartin', attributes: ranking(1) },
  { entrantId: 'desamparados', attributes: ranking(9) },
  { entrantId: 'peñarol', attributes: ranking(2) },
];

const weighted: StageAllocation = {
  mode: 'weighted',
  attributeKey: 'ranking',
  direction: 'lower-first',
};

describe('automatic allocation', () => {
  it('seeds in qualification-cut order', () => {
    const { seeds } = allocateSeeds({
      allocation: { mode: 'automatic' },
      entrants: field,
      qualified: ['desamparados', 'union', 'peñarol', 'sanmartin'],
    });

    expect(seeds).toEqual([
      { entrantId: 'desamparados', seed: 1 },
      { entrantId: 'union', seed: 2 },
      { entrantId: 'peñarol', seed: 3 },
      { entrantId: 'sanmartin', seed: 4 },
    ]);
  });

  it('refuses an empty cut rather than seeding nobody', () => {
    expect(() =>
      allocateSeeds({ allocation: { mode: 'automatic' }, entrants: field, qualified: [] }),
    ).toThrow(AllocationError);
  });

  it('refuses a cut naming an entrant this stage does not hold', () => {
    expect(() =>
      allocateSeeds({
        allocation: { mode: 'automatic' },
        entrants: field,
        qualified: ['union', 'atlanta'],
      }),
    ).toThrow(/not in this stage/);
  });
});

describe('weighted allocation', () => {
  it('ranks by the attribute, lowest first when the ranking says 1 is best', () => {
    const { seeds } = allocateSeeds({ allocation: weighted, entrants: field });

    expect(seeds.map((seed) => seed.entrantId)).toEqual([
      'sanmartin',
      'peñarol',
      'union',
      'desamparados',
    ]);
  });

  it('ranks highest first when the attribute is a rating', () => {
    const { seeds } = allocateSeeds({
      allocation: { mode: 'weighted', attributeKey: 'ranking', direction: 'higher-first' },
      entrants: field,
    });

    expect(seeds[0]?.entrantId).toBe('desamparados');
  });

  it('diverges from qualification order when the rankings disagree', () => {
    const cut = ['desamparados', 'union', 'peñarol', 'sanmartin'];
    const automatic = allocateSeeds({
      allocation: { mode: 'automatic' },
      entrants: field,
      qualified: cut,
    });
    const byRanking = allocateSeeds({ allocation: weighted, entrants: field });

    // The whole reason weighted exists: emerging first from a group is not the
    // same as being the strongest entrant in the field.
    expect(byRanking.seeds.map((s) => s.entrantId)).not.toEqual(
      automatic.seeds.map((s) => s.entrantId),
    );
  });

  it('breaks a tie deterministically instead of by input order', () => {
    const tied: AllocationEntrant[] = [
      { entrantId: 'zeta', attributes: ranking(5) },
      { entrantId: 'alfa', attributes: ranking(5) },
    ];

    expect(allocateSeeds({ allocation: weighted, entrants: tied }).seeds).toEqual(
      allocateSeeds({ allocation: weighted, entrants: [...tied].reverse() }).seeds,
    );
    expect(allocateSeeds({ allocation: weighted, entrants: tied }).seeds[0]?.entrantId).toBe(
      'alfa',
    );
  });

  it('refuses to seed a field where one entrant lacks the attribute', () => {
    expect(() =>
      allocateSeeds({
        allocation: weighted,
        entrants: [...field, { entrantId: 'atlanta' }],
      }),
    ).toThrow(/requires it on every entrant/);
  });

  it('ignores an attribute of the wrong kind rather than sorting a string', () => {
    expect(() =>
      allocateSeeds({
        allocation: weighted,
        entrants: [
          {
            entrantId: 'union',
            attributes: [{ key: 'ranking', value: 'primero', kind: 'categorical' }],
          },
        ],
      }),
    ).toThrow(AllocationError);
  });
});

describe('manual allocation', () => {
  const manual: StageAllocation = { mode: 'manual' };

  it('places every entrant exactly where the operator said', () => {
    const { seeds } = allocateSeeds({
      allocation: manual,
      entrants: field,
      placements: [
        { entrantId: 'union', seed: 2 },
        { entrantId: 'sanmartin', seed: 1 },
        { entrantId: 'desamparados', seed: 4 },
        { entrantId: 'peñarol', seed: 3 },
      ],
    });

    expect(seeds).toEqual([
      { entrantId: 'sanmartin', seed: 1 },
      { entrantId: 'union', seed: 2 },
      { entrantId: 'peñarol', seed: 3 },
      { entrantId: 'desamparados', seed: 4 },
    ]);
  });

  it('refuses a partial placement rather than inventing the rest', () => {
    expect(() =>
      allocateSeeds({
        allocation: manual,
        entrants: field,
        placements: [{ entrantId: 'union', seed: 1 }],
      }),
    ).toThrow(/1 of 4 placed/);
  });

  it('refuses two entrants on one seed', () => {
    expect(() =>
      allocateSeeds({
        allocation: manual,
        entrants: field,
        placements: [
          { entrantId: 'union', seed: 1 },
          { entrantId: 'sanmartin', seed: 1 },
          { entrantId: 'peñarol', seed: 3 },
          { entrantId: 'desamparados', seed: 4 },
        ],
      }),
    ).toThrow(/more than one entrant/);
  });

  it.each([[0], [5], [1.5]])('refuses seed %p, outside 1..4', (seed) => {
    expect(() =>
      allocateSeeds({
        allocation: manual,
        entrants: field,
        placements: [
          { entrantId: 'union', seed },
          { entrantId: 'sanmartin', seed: 2 },
          { entrantId: 'peñarol', seed: 3 },
          { entrantId: 'desamparados', seed: 4 },
        ],
      }),
    ).toThrow(AllocationError);
  });

  it('refuses a placement for an entrant outside the stage', () => {
    expect(() =>
      allocateSeeds({
        allocation: manual,
        entrants: field.slice(0, 2),
        placements: [
          { entrantId: 'union', seed: 1 },
          { entrantId: 'atlanta', seed: 2 },
        ],
      }),
    ).toThrow(/not in this stage/);
  });
});

describe('slot count', () => {
  it('refuses a field that cannot fill the next stage', () => {
    expect(() => allocateSeeds({ allocation: weighted, entrants: field, slots: 8 })).toThrow(
      /cannot fill 8 seed slot/,
    );
  });

  it('accepts a field that fills it exactly', () => {
    expect(allocateSeeds({ allocation: weighted, entrants: field, slots: 4 }).seeds).toHaveLength(
      4,
    );
  });
});

describe('allocation trace', () => {
  it('explains which rule produced the order', () => {
    const { trace } = allocateSeeds({ allocation: weighted, entrants: field });

    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      kind: 'action',
      id: 'allocation:weighted',
      outcome: 'allocated',
      detail: 'Seeded by attribute "ranking", lower-first',
    });
    expect(trace[0]?.values).toMatchObject({ sanmartin: 1, desamparados: 4 });
  });
});

describe('golden seed orders', () => {
  /** One fixture per mode: a change to any of them has to be deliberate. */
  it('locks the order each mode produces from the same field', () => {
    const orders = {
      automatic: allocateSeeds({
        allocation: { mode: 'automatic' },
        entrants: field,
        qualified: ['desamparados', 'union', 'peñarol', 'sanmartin'],
      }).seeds,
      weighted: allocateSeeds({ allocation: weighted, entrants: field }).seeds,
      manual: allocateSeeds({
        allocation: { mode: 'manual' },
        entrants: field,
        placements: [
          { entrantId: 'union', seed: 2 },
          { entrantId: 'sanmartin', seed: 1 },
          { entrantId: 'desamparados', seed: 4 },
          { entrantId: 'peñarol', seed: 3 },
        ],
      }).seeds,
    };

    expectGolden('allocation-modes-4', orders);
  });
});

describe('allocation feeding fixture generation', () => {
  it('produces a bracket the ranking explains', () => {
    const { seeds } = allocateSeeds({ allocation: weighted, entrants: field });
    const graph = generateFixtures({ format: 'single-elimination', entrants: seeds });
    if (!graph.ok) throw graph.error;

    // Standard pairing: the top two can only meet in the final.
    expectGolden('allocation-weighted-se-4', summarise(graph.value.matches));
  });
});
