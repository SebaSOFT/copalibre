import {
  CONSTRAINT_HOOK_POINTS,
  roundNumberFor,
  validateConstraint,
  type DrawConstraint,
} from '@copalibre/domain';
import { DrawError } from '../errors.js';
import { evaluateConstraints, meetingRound, type ConstrainedEntrant } from './index.js';

const club = (entrantId: string, region: string): ConstrainedEntrant => ({
  entrantId,
  attributes: [{ key: 'region', value: region, kind: 'categorical' }],
});

/** Four San Juan clubs and four from elsewhere — the motivating case. */
const field: readonly ConstrainedEntrant[] = [
  club('sanmartin', 'san-juan'),
  club('desamparados', 'san-juan'),
  club('union', 'san-juan'),
  club('peñarol', 'san-juan'),
  club('boca', 'buenos-aires'),
  club('river', 'buenos-aires'),
  club('belgrano', 'cordoba'),
  club('talleres', 'cordoba'),
];

const separateGroups: DrawConstraint = {
  kind: 'separation',
  hook: 'draw.assign-group',
  attribute: 'region',
  scope: 'group',
};

const separateBeforeR16: DrawConstraint = {
  kind: 'separation',
  hook: 'draw.pair-round',
  attribute: 'region',
  scope: { beforeRound: 'semi-final' },
};

describe('separation at group scope', () => {
  it('passes when clubs sharing a region are in different groups', () => {
    const evaluation = evaluateConstraints([separateGroups], field, {
      groups: {
        sanmartin: 1,
        desamparados: 2,
        union: 3,
        peñarol: 4,
        boca: 1,
        river: 2,
        belgrano: 3,
        talleres: 4,
      },
    });

    expect(evaluation.satisfied).toBe(true);
    expect(evaluation.violations).toEqual([]);
  });

  it('names both clubs and the group they share when it fails', () => {
    const evaluation = evaluateConstraints([separateGroups], field, {
      groups: { sanmartin: 1, desamparados: 1, union: 3, peñarol: 4, boca: 2, river: 2 },
    });

    expect(evaluation.satisfied).toBe(false);
    expect(evaluation.violations).toContainEqual(
      expect.objectContaining({
        constraint: 'separation',
        attribute: 'region',
        entrantIds: ['sanmartin', 'desamparados'],
      }),
    );
    expect(evaluation.violations[0]?.detail).toContain('share group 1');
  });

  it('reports every violation rather than stopping at the first', () => {
    const evaluation = evaluateConstraints([separateGroups], field, {
      groups: { sanmartin: 1, desamparados: 1, boca: 2, river: 2 },
    });

    expect(evaluation.violations).toHaveLength(2);
  });

  it('ignores an entrant carrying no value for the attribute', () => {
    const evaluation = evaluateConstraints(
      [separateGroups],
      [club('sanmartin', 'san-juan'), { entrantId: 'invitado', attributes: [] }],
      { groups: { sanmartin: 1, invitado: 1 } },
    );

    expect(evaluation.satisfied).toBe(true);
  });
});

describe('separation before a named round', () => {
  it('permits two clubs meeting in the final when the limit is the semi-final', () => {
    // Slots 1 and 8 in an 8-bracket can only meet in round 3, the final.
    const evaluation = evaluateConstraints([separateBeforeR16], field, {
      slots: { sanmartin: 1, desamparados: 8 },
      bracketSize: 8,
    });

    expect(evaluation.satisfied).toBe(true);
  });

  it('rejects two clubs that would meet in round 1', () => {
    const evaluation = evaluateConstraints([separateBeforeR16], field, {
      slots: { sanmartin: 1, desamparados: 2 },
      bracketSize: 8,
    });

    expect(evaluation.satisfied).toBe(false);
    expect(evaluation.violations[0]?.detail).toContain('round 1, before semi-final');
  });

  it('rejects a quarter-final meeting when the limit is the semi-final', () => {
    // In a bracket of 16 the quarter-final is round 2 and the semi round 3, so
    // slots 1 and 3 — which meet in round 2 — fall foul of the limit.
    const evaluation = evaluateConstraints([separateBeforeR16], field, {
      slots: { sanmartin: 1, desamparados: 3 },
      bracketSize: 16,
    });

    expect(evaluation.satisfied).toBe(false);
    expect(evaluation.violations[0]?.detail).toContain('round 2, before semi-final');
  });

  it('permits a semi-final meeting when the limit is the semi-final itself', () => {
    // "Before the semi-final" does not forbid the semi-final.
    const evaluation = evaluateConstraints([separateBeforeR16], field, {
      slots: { sanmartin: 1, desamparados: 5 },
      bracketSize: 16,
    });

    expect(evaluation.satisfied).toBe(true);
  });

  it('refuses a round name the bracket never plays', () => {
    expect(() =>
      evaluateConstraints(
        [
          {
            kind: 'separation',
            hook: 'draw.pair-round',
            attribute: 'region',
            scope: { beforeRound: 'round-of-32' },
          },
        ],
        field,
        { slots: { sanmartin: 1, desamparados: 2 }, bracketSize: 8 },
      ),
    ).toThrow(DrawError);
  });

  it('is inert without a bracket assignment to check against', () => {
    expect(evaluateConstraints([separateBeforeR16], field, {}).satisfied).toBe(true);
  });
});

describe('meetingRound', () => {
  it.each([
    [0, 1, 8, 1],
    [0, 2, 8, 2],
    [0, 3, 8, 2],
    [0, 4, 8, 3],
    [0, 7, 8, 3],
    [0, 15, 16, 4],
  ])('positions %i and %i in a bracket of %i meet in round %i', (left, right, size, expected) => {
    expect(meetingRound(left, right, size)).toBe(expected);
  });
});

describe('distribution', () => {
  const atLeastOnePorteño: DrawConstraint = {
    kind: 'distribution',
    hook: 'draw.assign-group',
    attribute: 'region',
    value: 'buenos-aires',
    min: 1,
  };

  it('passes when every group holds one', () => {
    const evaluation = evaluateConstraints([atLeastOnePorteño], field, {
      groups: { boca: 1, river: 2, sanmartin: 1, desamparados: 2 },
    });

    expect(evaluation.satisfied).toBe(true);
  });

  it('names the group that holds none', () => {
    const evaluation = evaluateConstraints([atLeastOnePorteño], field, {
      groups: { boca: 1, river: 1, sanmartin: 2, desamparados: 2 },
    });

    expect(evaluation.satisfied).toBe(false);
    expect(evaluation.violations[0]?.detail).toContain('Group 2 holds 0');
    expect(evaluation.violations[0]?.detail).toContain('at least 1 required');
  });

  it('enforces a maximum', () => {
    const evaluation = evaluateConstraints(
      [
        {
          kind: 'distribution',
          hook: 'draw.assign-group',
          attribute: 'region',
          value: 'san-juan',
          max: 1,
        },
      ],
      field,
      { groups: { sanmartin: 1, desamparados: 1, union: 2, peñarol: 3 } },
    );

    expect(evaluation.violations[0]?.detail).toContain('at most 1 permitted');
    expect(evaluation.violations[0]?.entrantIds).toEqual(['sanmartin', 'desamparados']);
  });

  it('is inert without a group assignment', () => {
    expect(evaluateConstraints([atLeastOnePorteño], field, {}).satisfied).toBe(true);
  });
});

describe('constraint declaration validity', () => {
  it('rejects an unknown hook point', () => {
    const result = validateConstraint({
      kind: 'separation',
      hook: 'draw.telepathy' as never,
      attribute: 'region',
      scope: 'group',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Unknown constraint hook point');
    expect(result.error.message).toContain('draw.assign-group');
  });

  it('rejects a declarative constraint on a hook no phase evaluates yet', () => {
    const result = validateConstraint({
      kind: 'distribution',
      hook: 'schedule.assign-slot' as never,
      attribute: 'region',
      value: 'san-juan',
      min: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('not evaluated yet');
  });

  it('rejects a distribution with neither min nor max', () => {
    expect(
      validateConstraint({
        kind: 'distribution',
        hook: 'draw.assign-group',
        attribute: 'region',
        value: 'san-juan',
      }).ok,
    ).toBe(false);
  });

  it('rejects a distribution requiring at least more than it permits', () => {
    expect(
      validateConstraint({
        kind: 'distribution',
        hook: 'draw.assign-group',
        attribute: 'region',
        value: 'san-juan',
        min: 3,
        max: 1,
      }).ok,
    ).toBe(false);
  });

  it('rejects a separation scope naming no round', () => {
    expect(
      validateConstraint({
        kind: 'separation',
        hook: 'draw.pair-round',
        attribute: 'region',
        scope: { beforeRound: '  ' },
      }).ok,
    ).toBe(false);
  });

  it('throws when evaluating a malformed constraint rather than ignoring it', () => {
    expect(() =>
      evaluateConstraints(
        [{ kind: 'separation', hook: 'nope' as never, attribute: 'region', scope: 'group' }],
        field,
        { groups: {} },
      ),
    ).toThrow(DrawError);
  });

  it('declares every hook the taxonomy names, including the ones later phases own', () => {
    expect(CONSTRAINT_HOOK_POINTS).toEqual([
      'draw.assign-group',
      'draw.pair-round',
      'seed.order',
      'schedule.assign-slot',
      'entrant.eligibility',
      'stage.advance',
    ]);
  });
});

describe('roundNumberFor', () => {
  it.each([
    ['final', 8, 3],
    ['semi-final', 8, 2],
    ['quarter-final', 8, 1],
    ['round-of-16', 16, 1],
    ['quarter-final', 16, 2],
  ])('resolves "%s" in a bracket of %i to round %i', (name, size, expected) => {
    const result = roundNumberFor(name, size);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(expected);
  });

  it('refuses an unknown name', () => {
    expect(roundNumberFor('the-big-one', 8).ok).toBe(false);
  });
});
