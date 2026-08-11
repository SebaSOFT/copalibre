import { checkAdjustment, type StatisticAdjustment } from './adjustment.js';

function adjustment(overrides: Partial<StatisticAdjustment> = {}): StatisticAdjustment {
  return {
    collectorCode: 'points',
    actorGranularity: 'team',
    actorId: 'tm-1',
    delta: -3,
    reason: 'Fielded an unregistered player',
    actor: 'user:table-official-1',
    ...overrides,
  };
}

describe('a hand correction is a fact, not an update', () => {
  it('accepts an adjustment carrying who, why and how much', () => {
    expect(checkAdjustment(adjustment()).ok).toBe(true);
  });

  it('accepts a script as the actor, since a declaration is also somebody', () => {
    expect(checkAdjustment(adjustment({ actor: 'script:discipline' })).ok).toBe(true);
  });
});

describe('what an adjustment is refused for', () => {
  it('refuses an unpublished actor granularity', () => {
    const result = checkAdjustment(adjustment({ actorGranularity: 'referee' as never }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ADJUSTMENT_INVALID');
  });

  it.each([
    ['zero', 0],
    ['infinite', Number.POSITIVE_INFINITY],
    ['not a number', Number.NaN],
  ])('refuses a delta that is %s', (_label, delta) => {
    expect(checkAdjustment(adjustment({ delta })).ok).toBe(false);
  });

  it('refuses a correction with no reason, which reads exactly like a bug', () => {
    const result = checkAdjustment(adjustment({ reason: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('indistinguishable from a bug');
  });

  it('refuses a correction nobody signed', () => {
    expect(checkAdjustment(adjustment({ actor: '' })).ok).toBe(false);
  });
});
