import {
  declaredEffect,
  effectIdentityKey,
  remainingSeconds,
  toDeclaredTimer,
  toNotificationInstance,
  toStatisticAdjustment,
  type DeclaredEffect,
  type EffectOrigin,
} from './declared-effects.js';

const origin: EffectOrigin = {
  hook: 'score.changed',
  scriptId: 'lead-alert',
  scriptVersion: 2,
  ruleId: 'comfortable-lead',
  actionId: 'raise',
  causeId: 'evt-7',
};

function effect(overrides: Partial<DeclaredEffect> = {}): DeclaredEffect {
  return {
    ...declaredEffect(origin, {
      kind: 'notification',
      actionId: origin.actionId,
      payload: {
        severity: 'critical',
        title: 'Comfortable lead',
        message: 'Home leads by 3',
        targetRole: 'referee',
        scopeKey: 'match:m-1',
        contextValues: { causeId: 'evt-7' },
      },
    }),
    ...overrides,
  };
}

describe('identity', () => {
  it('names the script version, the hook, the cause, the rule and the action', () => {
    expect(effectIdentityKey(origin)).toBe(
      'lead-alert@v2|score.changed:evt-7|comfortable-lead/raise',
    );
  });

  it('separates two actions in one rule, so neither overwrites the other', () => {
    expect(effectIdentityKey({ ...origin, actionId: 'second' })).not.toBe(
      effectIdentityKey(origin),
    );
  });

  it('changes when the script version does, so a rewritten rule does not dedupe against old alerts', () => {
    expect(effectIdentityKey({ ...origin, scriptVersion: 3 })).not.toBe(effectIdentityKey(origin));
  });
});

describe('toNotificationInstance', () => {
  it('produces the instance shape the threshold path produces', () => {
    expect(toNotificationInstance(effect())).toMatchObject({
      identityKey: 'lead-alert@v2|score.changed:evt-7|comfortable-lead/raise',
      ruleId: 'lead-alert/comfortable-lead',
      ruleVersion: 2,
      scopeKey: 'match:m-1',
      severity: 'critical',
      targetRole: 'referee',
      triggeredByEventId: 'evt-7',
    });
  });

  it('is nothing for an effect that is not a notification', () => {
    expect(toNotificationInstance(effect({ kind: 'timer-start' }))).toBeUndefined();
  });

  it('falls back rather than inventing, when a payload is incomplete', () => {
    const bare = toNotificationInstance(effect({ payload: {} }));

    expect(bare).toMatchObject({
      severity: 'info',
      title: '',
      message: '',
      targetRole: 'operator',
      // With no scope of its own, an alert belongs to what caused it.
      scopeKey: 'evt-7',
    });
  });

  it('records the hook among the context values, so an alert says where it came from', () => {
    expect(toNotificationInstance(effect())?.contextValues).toMatchObject({
      hook: 'score.changed',
      causeId: 'evt-7',
    });
  });
});

describe('toDeclaredTimer', () => {
  const timer = effect({
    kind: 'timer-start',
    payload: { timerId: 'suspension', startedAt: 1_770_000_000_000, durationSeconds: 120 },
  });

  it('reads a well-formed declaration', () => {
    expect(toDeclaredTimer(timer)).toEqual({
      timerId: 'suspension',
      startedAt: 1_770_000_000_000,
      durationSeconds: 120,
    });
  });

  it('is nothing for another kind of effect', () => {
    expect(toDeclaredTimer(effect())).toBeUndefined();
  });

  it.each([
    ['no id', { startedAt: 1, durationSeconds: 2 }],
    ['an empty id', { timerId: '', startedAt: 1, durationSeconds: 2 }],
    ['no start', { timerId: 't', durationSeconds: 2 }],
    [
      'an infinite start',
      { timerId: 't', startedAt: Number.POSITIVE_INFINITY, durationSeconds: 2 },
    ],
    ['no duration', { timerId: 't', startedAt: 1 }],
    ['a text duration', { timerId: 't', startedAt: 1, durationSeconds: '2' }],
  ])('is nothing for a declaration with %s', (_label, payload) => {
    expect(toDeclaredTimer(effect({ kind: 'timer-start', payload }))).toBeUndefined();
  });
});

describe('remainingSeconds', () => {
  const timer = { timerId: 't', startedAt: 1_000_000, durationSeconds: 60 };

  it('derives the remainder at each read, from one record', () => {
    expect(remainingSeconds(timer, 1_000_000)).toBe(60);
    expect(remainingSeconds(timer, 1_030_000)).toBe(30);
  });

  it('floors at zero rather than counting into the negative', () => {
    expect(remainingSeconds(timer, 1_060_000)).toBe(0);
    expect(remainingSeconds(timer, 9_000_000)).toBe(0);
  });

  it('reads a timer that has not started yet as its full duration or more', () => {
    // A clock read before the causing instant is a caller's problem, not a
    // reason to invent a number: the arithmetic is stated and stays honest.
    expect(remainingSeconds(timer, 999_000)).toBe(61);
  });
});

describe('toStatisticAdjustment', () => {
  const adjustment = effect({
    kind: 'statistic-adjustment',
    payload: {
      collectorCode: 'points',
      actorGranularity: 'team',
      actorId: 'tm-1',
      delta: -3,
      reason: 'Fielded an unregistered player',
    },
  });

  it('reads a well-formed declaration, naming the script as the actor', () => {
    expect(toStatisticAdjustment(adjustment)).toEqual({
      collectorCode: 'points',
      actorGranularity: 'team',
      actorId: 'tm-1',
      delta: -3,
      reason: 'Fielded an unregistered player',
      // "A rule did it" is an answer only when the rule can be pointed at.
      actor: 'script:lead-alert',
    });
  });

  it('names the rule when the declaration carries no reason of its own', () => {
    const bare = toStatisticAdjustment(
      effect({
        kind: 'statistic-adjustment',
        payload: { collectorCode: 'points', actorGranularity: 'team', actorId: 'tm-1', delta: 1 },
      }),
    );

    expect(bare?.reason).toContain('lead-alert/comfortable-lead');
  });

  it('is nothing for another kind of effect', () => {
    expect(toStatisticAdjustment(effect())).toBeUndefined();
  });

  it.each([
    ['no collector', { actorGranularity: 'team', actorId: 'tm-1', delta: 1 }],
    [
      'an unpublished granularity',
      { collectorCode: 'p', actorGranularity: 'referee', actorId: 'a', delta: 1 },
    ],
    ['no subject', { collectorCode: 'p', actorGranularity: 'team', delta: 1 }],
    ['a text delta', { collectorCode: 'p', actorGranularity: 'team', actorId: 'a', delta: '1' }],
    [
      'an infinite delta',
      { collectorCode: 'p', actorGranularity: 'team', actorId: 'a', delta: Number.NaN },
    ],
  ])('is nothing for a declaration with %s', (_label, payload) => {
    expect(
      toStatisticAdjustment(effect({ kind: 'statistic-adjustment', payload })),
    ).toBeUndefined();
  });
});
