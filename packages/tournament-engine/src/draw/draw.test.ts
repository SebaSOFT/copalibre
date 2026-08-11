import type { DrawConstraint } from '@copalibre/domain';
import type { ConstrainedEntrant } from '../constraints/index.js';
import { DrawError } from '../errors.js';
import { expectGolden } from '../test-support/golden.js';
import { inspectDraw, runDraw } from './index.js';

const club = (entrantId: string, region: string): ConstrainedEntrant => ({
  entrantId,
  attributes: [{ key: 'region', value: region, kind: 'categorical' }],
});

/** Two clubs from each of four regions — a draw that can always be separated. */
const field: readonly ConstrainedEntrant[] = [
  club('sanmartin', 'san-juan'),
  club('desamparados', 'san-juan'),
  club('boca', 'buenos-aires'),
  club('river', 'buenos-aires'),
  club('belgrano', 'cordoba'),
  club('talleres', 'cordoba'),
  club('newells', 'santa-fe'),
  club('central', 'santa-fe'),
];

const separateGroups: DrawConstraint = {
  kind: 'separation',
  hook: 'draw.assign-group',
  attribute: 'region',
  scope: 'group',
};

describe('a constrained group draw', () => {
  it('separates every pair sharing a region', () => {
    const outcome = runDraw({
      entrants: field,
      constraints: [separateGroups],
      shape: { kind: 'groups', count: 4 },
      seed: 20260731,
    });

    expect(
      inspectDraw({ entrants: field, constraints: [separateGroups] }, outcome.assignment),
    ).toEqual([]);
    expect(Object.keys(outcome.assignment.groups ?? {})).toHaveLength(8);
  });

  it('fills groups evenly rather than crowding one', () => {
    const outcome = runDraw({
      entrants: field,
      constraints: [],
      shape: { kind: 'groups', count: 4 },
      seed: 7,
    });

    const sizes = new Map<number, number>();
    for (const group of Object.values(outcome.assignment.groups ?? {})) {
      sizes.set(group, (sizes.get(group) ?? 0) + 1);
    }
    expect([...sizes.values()]).toEqual([2, 2, 2, 2]);
  });

  it('honours a distribution minimum', () => {
    const oneSanJuanEach: DrawConstraint = {
      kind: 'distribution',
      hook: 'draw.assign-group',
      attribute: 'region',
      value: 'san-juan',
      min: 1,
    };
    const eight = [...field.slice(2), club('union', 'san-juan'), club('peñarol', 'san-juan')];

    const outcome = runDraw({
      entrants: eight,
      constraints: [oneSanJuanEach],
      shape: { kind: 'groups', count: 2 },
      seed: 11,
    });

    expect(
      inspectDraw({ entrants: eight, constraints: [oneSanJuanEach] }, outcome.assignment),
    ).toEqual([]);
  });
});

describe('reproducibility', () => {
  it('reproduces the same draw from the same seed', () => {
    const request = {
      entrants: field,
      constraints: [separateGroups],
      shape: { kind: 'groups', count: 4 } as const,
      seed: 20260731,
    };

    expect(runDraw(request).assignment).toEqual(runDraw(request).assignment);
  });

  it('produces a different but valid draw from a different seed', () => {
    const base = {
      entrants: field,
      constraints: [separateGroups],
      shape: { kind: 'groups', count: 4 } as const,
    };
    const first = runDraw({ ...base, seed: 1 });
    const second = runDraw({ ...base, seed: 2 });

    expect(first.assignment).not.toEqual(second.assignment);
    expect(inspectDraw(base, second.assignment)).toEqual([]);
  });

  it('echoes the seed back so the caller records what produced the draw', () => {
    const outcome = runDraw({
      entrants: field,
      constraints: [],
      shape: { kind: 'groups', count: 2 },
      seed: 4242,
    });

    expect(outcome.seed).toBe(4242);
    expect(outcome.trace[0]).toMatchObject({
      id: 'draw:groups',
      outcome: 'drawn',
      values: { seed: 4242, entrants: 8 },
    });
  });

  it('matches the golden draw, so a change in the shuffle is never silent', () => {
    const outcome = runDraw({
      entrants: field,
      constraints: [separateGroups],
      shape: { kind: 'groups', count: 4 },
      seed: 20260731,
    });

    expectGolden('draw-groups-4-seed-20260731', outcome.assignment.groups);
  });
});

describe('a constrained bracket draw', () => {
  const keepApartUntilSemi: DrawConstraint = {
    kind: 'separation',
    hook: 'draw.pair-round',
    attribute: 'region',
    scope: { beforeRound: 'semi-final' },
  };

  it('keeps clubs from one region in different halves', () => {
    const outcome = runDraw({
      entrants: field,
      constraints: [keepApartUntilSemi],
      shape: { kind: 'bracket', size: 8 },
      seed: 99,
    });

    expect(
      inspectDraw({ entrants: field, constraints: [keepApartUntilSemi] }, outcome.assignment),
    ).toEqual([]);
    expect(outcome.assignment.bracketSize).toBe(8);
  });

  it('gives every entrant a distinct slot', () => {
    const outcome = runDraw({
      entrants: field,
      constraints: [],
      shape: { kind: 'bracket', size: 8 },
      seed: 5,
    });

    const slots = Object.values(outcome.assignment.slots ?? {});
    expect(new Set(slots).size).toBe(8);
  });

  it('refuses a bracket that is not a power of two', () => {
    expect(() =>
      runDraw({ entrants: field, constraints: [], shape: { kind: 'bracket', size: 6 }, seed: 1 }),
    ).toThrow(/power of two/);
  });
});

describe('an unsatisfiable constraint set', () => {
  it('names the constraint and the structural limit rather than timing out', () => {
    // Five clubs from one region cannot be separated into four groups.
    const crowded = [
      ...field.slice(0, 2),
      club('union', 'san-juan'),
      club('peñarol', 'san-juan'),
      club('juventud', 'san-juan'),
      club('boca', 'buenos-aires'),
    ];

    expect(() =>
      runDraw({
        entrants: crowded,
        constraints: [separateGroups],
        shape: { kind: 'groups', count: 4 },
        seed: 1,
      }),
    ).toThrow(/5 entrants carry region=san-juan, but only 4 group\(s\) could separate them/);
  });

  it('counts sub-brackets, not slots, for a round-scoped separation', () => {
    // "Not before the final" splits an 8-bracket into its 2 halves, so three
    // clubs from one region cannot be kept apart — while "not before the semi"
    // would leave 4 quarters and be perfectly satisfiable.
    const three = [
      club('sanmartin', 'san-juan'),
      club('desamparados', 'san-juan'),
      club('union', 'san-juan'),
      club('boca', 'buenos-aires'),
    ];

    expect(() =>
      runDraw({
        entrants: three,
        constraints: [
          {
            kind: 'separation',
            hook: 'draw.pair-round',
            attribute: 'region',
            scope: { beforeRound: 'final' },
          },
        ],
        shape: { kind: 'bracket', size: 8 },
        seed: 1,
      }),
    ).toThrow(/only 2 sub-bracket\(s\) could separate them/);
  });

  it('accepts the same three clubs when only the quarter-final is off limits', () => {
    const three = [
      club('sanmartin', 'san-juan'),
      club('desamparados', 'san-juan'),
      club('union', 'san-juan'),
      club('boca', 'buenos-aires'),
    ];
    const constraints: DrawConstraint[] = [
      {
        kind: 'separation',
        hook: 'draw.pair-round',
        attribute: 'region',
        scope: { beforeRound: 'semi-final' },
      },
    ];

    const outcome = runDraw({
      entrants: three,
      constraints,
      shape: { kind: 'bracket', size: 8 },
      seed: 3,
    });

    expect(inspectDraw({ entrants: three, constraints }, outcome.assignment)).toEqual([]);
  });

  it('reports a distribution minimum that the field cannot supply', () => {
    expect(() =>
      runDraw({
        entrants: field,
        constraints: [
          {
            kind: 'distribution',
            hook: 'draw.assign-group',
            attribute: 'region',
            value: 'san-juan',
            min: 1,
          },
        ],
        shape: { kind: 'groups', count: 4 },
        seed: 1,
      }),
    ).toThrow(
      /4 groups need at least 1 entrant\(s\) with region=san-juan each \(4 in total\), but only 2 exist/,
    );
  });

  it('gives up within its step budget rather than searching forever', () => {
    expect(() =>
      runDraw({
        entrants: field,
        constraints: [separateGroups],
        shape: { kind: 'groups', count: 4 },
        seed: 1,
        maxSteps: 3,
      }),
    ).toThrow(/did not settle within 3 steps/);
  });

  it('refuses a shape with no positions at all', () => {
    expect(() =>
      runDraw({ entrants: field, constraints: [], shape: { kind: 'groups', count: 0 }, seed: 1 }),
    ).toThrow(DrawError);
  });

  it('refuses more entrants than a bracket has slots', () => {
    expect(() =>
      runDraw({ entrants: field, constraints: [], shape: { kind: 'bracket', size: 4 }, seed: 1 }),
    ).toThrow(/cannot be drawn into a bracket of 4/);
  });

  it('refuses a malformed constraint before drawing anything', () => {
    expect(() =>
      runDraw({
        entrants: field,
        constraints: [{ ...separateGroups, hook: 'draw.telepathy' as never }],
        shape: { kind: 'groups', count: 4 },
        seed: 1,
      }),
    ).toThrow(/Unknown constraint hook point/);
  });
});

describe('scripted constraints in a draw', () => {
  it('rejects a completed draw the script refuses', () => {
    expect(() =>
      runDraw({
        entrants: field,
        constraints: [],
        shape: { kind: 'groups', count: 4 },
        seed: 1,
        evaluateScripts: () => ({ satisfied: false, reasons: ['Association cap exceeded'] }),
      }),
    ).toThrow(/rejected by a scripted constraint/);
  });

  it('accepts a completed draw the script permits', () => {
    const outcome = runDraw({
      entrants: field,
      constraints: [],
      shape: { kind: 'groups', count: 4 },
      seed: 1,
      evaluateScripts: () => ({ satisfied: true, reasons: [] }),
    });

    expect(Object.keys(outcome.assignment.groups ?? {})).toHaveLength(8);
  });
});
