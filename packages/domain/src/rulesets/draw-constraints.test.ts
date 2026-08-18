import {
  CONSTRAINT_HOOK_POINTS,
  IMPLEMENTED_HOOK_POINTS,
  roundNumberFor,
  validateConstraint,
  type DrawConstraint,
} from './draw-constraints.js';

const separation: DrawConstraint = {
  kind: 'separation',
  hook: 'draw.assign-group',
  attribute: 'region',
  scope: 'group',
};

describe('the hook taxonomy', () => {
  it('names every hook the surrounding phases attach to', () => {
    expect(CONSTRAINT_HOOK_POINTS).toContain('schedule.assign-slot');
    expect(CONSTRAINT_HOOK_POINTS).toContain('entrant.eligibility');
    expect(CONSTRAINT_HOOK_POINTS).toContain('stage.advance');
  });

  it('implements only the draw and seed hooks in this phase', () => {
    expect(IMPLEMENTED_HOOK_POINTS).toEqual(['draw.assign-group', 'draw.pair-round', 'seed.order']);
  });
});

describe('validateConstraint', () => {
  it('accepts a separation at group scope', () => {
    expect(validateConstraint(separation).ok).toBe(true);
  });

  it('accepts a separation before a named round', () => {
    expect(
      validateConstraint({
        ...separation,
        hook: 'draw.pair-round',
        scope: { beforeRound: 'final' },
      }).ok,
    ).toBe(true);
  });

  it.each([[{ min: 1 }], [{ max: 2 }], [{ min: 1, max: 2 }]])(
    'accepts a distribution bounded by %p',
    (bounds) => {
      expect(
        validateConstraint({
          kind: 'distribution',
          hook: 'draw.assign-group',
          attribute: 'region',
          value: 'san-juan',
          ...bounds,
        }).ok,
      ).toBe(true);
    },
  );

  it('accepts a script constraint on a hook this phase does not evaluate', () => {
    // A script may attach where a declarative constraint cannot yet: the hook
    // exists, and the phase that owns it will run the script.
    expect(
      validateConstraint({
        kind: 'script',
        hook: 'schedule.assign-slot',
        script: { id: 'rest-rule', rules: [] },
      }).ok,
    ).toBe(true);
  });

  it('rejects an unknown hook, listing the ones that exist', () => {
    const result = validateConstraint({ ...separation, hook: 'draw.vibes' as never });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('DRAW_CONSTRAINT_INVALID');
    expect(result.error.message).toContain('draw.assign-group');
  });

  it('rejects a declarative constraint on a hook no phase evaluates yet', () => {
    expect(validateConstraint({ ...separation, hook: 'stage.advance' as never }).ok).toBe(false);
  });

  it('rejects an unbounded distribution', () => {
    expect(
      validateConstraint({
        kind: 'distribution',
        hook: 'draw.assign-group',
        attribute: 'region',
        value: 'san-juan',
      }).ok,
    ).toBe(false);
  });

  it('rejects a distribution whose minimum exceeds its maximum', () => {
    const result = validateConstraint({
      kind: 'distribution',
      hook: 'draw.assign-group',
      attribute: 'region',
      value: 'san-juan',
      min: 3,
      max: 1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ min: 3, max: 1 });
  });

  it('rejects a separation scope naming no round', () => {
    expect(
      validateConstraint({ ...separation, hook: 'draw.pair-round', scope: { beforeRound: '' } }).ok,
    ).toBe(false);
  });
});

describe('roundNumberFor', () => {
  it.each([
    ['final', 2, 1],
    ['final', 8, 3],
    ['final', 16, 4],
    ['semi-final', 16, 3],
    ['quarter-final', 16, 2],
    ['round-of-16', 16, 1],
    ['round-of-32', 32, 1],
    ['round-of-64', 64, 1],
  ])('places "%s" in a bracket of %i at round %i', (name, size, expected) => {
    const result = roundNumberFor(name, size);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(expected);
  });

  it('rejects a name it does not know, listing the ones it does', () => {
    const result = roundNumberFor('the-decider', 8);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('round-of-16');
  });

  it('rejects a round a bracket that size never plays', () => {
    const result = roundNumberFor('round-of-16', 8);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('never plays');
  });

  it('rejects a non-power-of-two bracket size rather than returning a fractional round', () => {
    const result = roundNumberFor('quarter-final', 12);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('power of two');
  });
});
