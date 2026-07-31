import { drawRecords, evaluateAtHook, type HookEvaluationInput } from './hook-evaluator.js';
import { registerCopalibreVocabulary } from './vocabulary.js';
import {
  remainingSeconds,
  toDeclaredTimer,
  toNotificationInstance,
  type DeclaredEffect,
} from '../effects/declared-effects.js';
import { dedupeNotifications } from '../notifications/notification-rules.js';
import { RulesRegistry, type RuleScript } from '../registry/rules-registry.js';
import { expectGolden } from '../test-support/golden.js';

/**
 * Evaluating at a hook: the taxonomy, the polarity, the declared effects, and
 * the promise that a replay reproduces all three.
 */

function registry(): RulesRegistry {
  return registerCopalibreVocabulary(new RulesRegistry());
}

function firstEffect(effects: readonly DeclaredEffect[]): DeclaredEffect {
  const [effect] = effects;
  if (!effect) throw new Error('the evaluation declared no effect');
  return effect;
}

const NOW = 1_770_000_000_000;

const scoreContext = {
  now: NOW,
  match: { id: 'm-1', status: 'live' },
  score: { home: 5, away: 2, leaderChanged: true },
  tournament: { alias: 'copa-cuyo', timeZone: 'America/Argentina/San_Juan' },
};

function input(overrides: Partial<HookEvaluationInput> = {}): HookEvaluationInput {
  return {
    hook: 'score.changed',
    script: emptyScript,
    scriptVersion: 1,
    context: scoreContext,
    cause: { id: 'evt-7', at: NOW, scopeKey: 'match:m-1' },
    seed: 42,
    ...overrides,
  };
}

const emptyScript = { id: 'nothing', rules: [] } as unknown as RuleScript;

/** Declares a notification when the home side leads by more than two. */
const alertScript = {
  id: 'lead-alert',
  rules: [
    {
      id: 'comfortable-lead',
      type: 'simple_rule',
      options: {},
      conditions: [
        {
          id: 'c1',
          type: 'compare_two_numbers',
          options: {},
          params: [
            {
              id: 'p1',
              name: 'op1',
              type: 'simple_number',
              value: '{{ score.home - score.away }}',
              options: { expression: true },
            },
            { id: 'p2', name: 'comp', type: 'comparator', value: '>', options: {} },
            { id: 'p3', name: 'op2', type: 'simple_number', value: 2, options: {} },
          ],
        },
      ],
      actions: [
        {
          id: 'raise',
          type: 'notify',
          options: {},
          params: [
            { id: 'p4', name: 'severity', type: 'simple_string', value: 'warning', options: {} },
            {
              id: 'p5',
              name: 'title',
              type: 'simple_string',
              value: 'Comfortable lead',
              options: {},
            },
            {
              id: 'p6',
              name: 'message',
              type: 'simple_string',
              value: 'Home leads by {{ score.home - score.away }}',
              options: { expression: true },
            },
          ],
        },
      ],
    },
  ],
} as unknown as RuleScript;

const timerScript = {
  id: 'suspension',
  rules: [
    {
      id: 'start-suspension',
      type: 'simple_rule',
      options: {},
      conditions: [],
      actions: [
        {
          id: 'start',
          type: 'startTimer',
          options: {},
          params: [
            { id: 'p1', name: 'timerId', type: 'simple_string', value: 'suspension', options: {} },
            { id: 'p2', name: 'durationSeconds', type: 'simple_number', value: 120, options: {} },
          ],
        },
      ],
    },
  ],
} as unknown as RuleScript;

describe('polarity decides what silence means', () => {
  it('an empty script passes at a permissive hook, having forbidden nothing', () => {
    const decision = evaluateAtHook(registry(), input());

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.outcome).toBe('pass');
    expect(decision.value.reason).toBe('empty-script-forbids-nothing');
  });

  it('an empty script denies at a guard, because silence must not authorise', () => {
    const decision = evaluateAtHook(
      registry(),
      input({ hook: 'entrant.eligibility', context: { now: NOW } }),
    );

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.outcome).toBe('deny');
  });

  it('a rule with no conditions fires anyway', () => {
    const decision = evaluateAtHook(registry(), input({ script: timerScript }));

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.effects).toHaveLength(1);
  });

  it('refuses an unknown hook', () => {
    const decision = evaluateAtHook(registry(), input({ hook: 'match.vibes' as never }));

    expect(decision.ok).toBe(false);
  });
});

describe('the context is data, and only the hook’s data', () => {
  it('refuses a context carrying a function', () => {
    const decision = evaluateAtHook(
      registry(),
      input({ context: { ...scoreContext, helper: () => 1 } as never }),
    );

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.message).toContain('data only');
  });

  it('refuses a script reading a path the hook does not publish', () => {
    const nosy = structuredClone(alertScript) as unknown as {
      rules: { conditions: { params: { value: string }[] }[] }[];
    };
    const operand = nosy.rules[0]?.conditions[0]?.params[0];
    if (!operand) throw new Error('the fixture lost its first operand');
    operand.value = '{{ roster.secretBudget }}';

    const decision = evaluateAtHook(registry(), input({ script: nosy as unknown as RuleScript }));

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.message).toContain('roster.secretBudget');
    expect(decision.error.message).toContain('score.changed');
  });

  it('accepts the environment every hook publishes', () => {
    const decision = evaluateAtHook(registry(), input({ script: alertScript }));

    expect(decision.ok).toBe(true);
  });
});

describe('an action declares an effect, it never performs one', () => {
  it('names the hook, the script, the rule and the cause', () => {
    const decision = evaluateAtHook(registry(), input({ script: alertScript }));

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const [effect] = decision.value.effects;
    expect(effect?.origin).toEqual({
      hook: 'score.changed',
      scriptId: 'lead-alert',
      scriptVersion: 1,
      ruleId: 'comfortable-lead',
      actionId: 'raise',
      causeId: 'evt-7',
    });
  });

  it('carries an identity derived from its cause, not from a draw', () => {
    const first = evaluateAtHook(registry(), input({ script: alertScript, seed: 1 }));
    const second = evaluateAtHook(registry(), input({ script: alertScript, seed: 9999 }));

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // Two replicas drawing different entropy still produce one identity, which
    // is what keeps an alert from being delivered twice.
    expect(first.value.effects[0]?.identityKey).toBe(second.value.effects[0]?.identityKey);
    expect(first.value.effects[0]?.identityKey).toContain('lead-alert@v1');
  });

  it('declares no effect when the rule does not fire', () => {
    const decision = evaluateAtHook(
      registry(),
      input({ script: alertScript, context: { ...scoreContext, score: { home: 3, away: 2 } } }),
    );

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.effects).toHaveLength(0);
  });

  it('produces the notification instance the threshold path produces', () => {
    const decision = evaluateAtHook(registry(), input({ script: alertScript }));

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const instance = toNotificationInstance(firstEffect(decision.value.effects));

    expect(instance).toMatchObject({
      ruleId: 'lead-alert/comfortable-lead',
      ruleVersion: 1,
      scopeKey: 'match:m-1',
      severity: 'warning',
      title: 'Comfortable lead',
      message: 'Home leads by 3',
      targetRole: 'operator',
      triggeredByEventId: 'evt-7',
    });
  });

  it('deduplicates against an already-delivered key, through the one mechanism', () => {
    const decision = evaluateAtHook(registry(), input({ script: alertScript }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;

    const instance = toNotificationInstance(firstEffect(decision.value.effects));
    if (!instance) throw new Error('the notification effect did not convert');
    const delivered = new Set([instance.identityKey]);

    expect(dedupeNotifications(delivered, [instance])).toHaveLength(0);
    expect(dedupeNotifications(new Set(), [instance])).toHaveLength(1);
  });
});

describe('a declared timer keeps its own clock', () => {
  it('starts at the causing event, not at the evaluation', () => {
    const decision = evaluateAtHook(
      registry(),
      // The evaluation runs long after the event it is about.
      input({ script: timerScript, cause: { id: 'evt-9', at: NOW - 30_000 } }),
    );

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(toDeclaredTimer(firstEffect(decision.value.effects))).toEqual({
      timerId: 'suspension',
      startedAt: NOW - 30_000,
      durationSeconds: 120,
    });
  });

  it('shrinks under replay rather than resetting', () => {
    const started = { id: 'evt-9', at: NOW } as const;
    const first = evaluateAtHook(registry(), input({ script: timerScript, cause: started }));
    const replay = evaluateAtHook(registry(), input({ script: timerScript, cause: started }));

    expect(first.ok && replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    const timer = toDeclaredTimer(firstEffect(replay.value.effects));
    if (!timer) throw new Error('the timer effect did not convert');

    expect(timer.startedAt).toBe(NOW);
    expect(remainingSeconds(timer, NOW + 30_000)).toBe(90);
    expect(remainingSeconds(timer, NOW + 90_000)).toBe(30);
    expect(remainingSeconds(timer, NOW + 300_000)).toBe(0);
  });
});

describe('sampled entropy is an input', () => {
  const drawingScript = {
    id: 'coin-flips',
    rules: [
      {
        id: 'r1',
        type: 'simple_rule',
        options: {},
        conditions: [
          {
            id: 'c1',
            type: 'compare_two_numbers',
            options: {},
            params: [
              {
                id: 'p1',
                name: 'op1',
                type: 'simple_number',
                value: '{{ random }}',
                options: { expression: true },
              },
              { id: 'p2', name: 'comp', type: 'comparator', value: '>=', options: {} },
              { id: 'p3', name: 'op2', type: 'simple_number', value: 0, options: {} },
            ],
          },
          {
            id: 'c2',
            type: 'compare_two_numbers',
            options: {},
            params: [
              {
                id: 'p4',
                name: 'op1',
                type: 'simple_number',
                value: '{{ random }}',
                options: { expression: true },
              },
              { id: 'p5', name: 'comp', type: 'comparator', value: '<=', options: {} },
              { id: 'p6', name: 'op2', type: 'simple_number', value: 1, options: {} },
            ],
          },
        ],
        actions: [
          {
            id: 'start',
            type: 'startTimer',
            options: {},
            params: [
              {
                id: 'p7',
                name: 'timerId',
                type: 'simple_string',
                value: '{{ uuid }}',
                options: { expression: true },
              },
              { id: 'p8', name: 'durationSeconds', type: 'simple_number', value: 60, options: {} },
            ],
          },
        ],
      },
    ],
  } as unknown as RuleScript;

  function draws(seed: number) {
    const decision = evaluateAtHook(registry(), input({ script: drawingScript, seed }));
    if (!decision.ok) throw decision.error;
    const node = decision.value.record.trace[0]?.children?.find((child) =>
      child.id.endsWith('-draws'),
    );
    return { decision: decision.value, draws: node?.values?.draws as { random: number }[] };
  }

  it('gives each element its own draw, so two coin flips are independent', () => {
    const { draws: recorded } = draws(42);

    expect(recorded).toHaveLength(3);
    expect(recorded?.[0]?.random).not.toBe(recorded?.[1]?.random);
  });

  it('reproduces every draw from the recorded seed', () => {
    expect(draws(42).draws).toEqual(draws(42).draws);
    expect(draws(42).draws).not.toEqual(draws(43).draws);
  });

  it('produces identical declared effects on replay', () => {
    const first = draws(42).decision;
    const replayed = draws(42).decision;

    expect(replayed.effects).toEqual(first.effects);
    expect(JSON.stringify(replayed.record.output)).toBe(JSON.stringify(first.record.output));
  });

  it('still draws when the caller published no instant, rather than reading a clock', () => {
    const decision = evaluateAtHook(
      registry(),
      input({ script: drawingScript, context: { ...scoreContext, now: undefined } as never }),
    );

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const node = decision.value.record.trace[0]?.children?.find((child) =>
      child.id.endsWith('-draws'),
    );
    expect((node?.values?.draws as unknown[]).length).toBe(3);
  });

  it('skips an unreadable draw record rather than breaking the trace', () => {
    const context = { messages: [{ type: 'debug', text: 'draw {not json' }], state: {} };

    expect(drawRecords(context as never)).toHaveLength(0);
  });

  it('records the seed alongside the values it produced', () => {
    const decision = evaluateAtHook(registry(), input({ script: drawingScript, seed: 42 }));

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const node = decision.value.record.trace[0]?.children?.find((child) =>
      child.id.endsWith('-draws'),
    );
    expect(node?.values?.seed).toBe(42);
  });
});

describe('what a hook evaluation refuses', () => {
  it('refuses a script referencing an element the registry does not hold', () => {
    const invented = {
      id: 'invented',
      rules: [
        {
          id: 'r1',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [{ id: 'a1', type: 'launchMissile', options: {}, params: [] }],
        },
      ],
    } as unknown as RuleScript;

    const decision = evaluateAtHook(registry(), input({ script: invented }));

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.message).toContain('launchMissile');
  });

  it('refuses a structurally invalid script before executing anything', () => {
    const decision = evaluateAtHook(
      registry(),
      input({ script: { id: 'broken' } as unknown as RuleScript }),
    );

    expect(decision.ok).toBe(false);
  });

  it('reports a failing action as an evaluation failure naming the hook', () => {
    const incomplete = {
      id: 'half-declared',
      rules: [
        {
          id: 'r1',
          type: 'simple_rule',
          options: {},
          conditions: [],
          // notify without a title cannot declare anything.
          actions: [{ id: 'a1', type: 'notify', options: {}, params: [] }],
        },
      ],
    } as unknown as RuleScript;

    const decision = evaluateAtHook(registry(), input({ script: incomplete }));

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.message).toContain('score.changed');
  });
});

describe('a guard hook', () => {
  const granting = {
    id: 'let-them-in',
    rules: [
      {
        id: 'r1',
        type: 'simple_rule',
        options: {},
        conditions: [],
        actions: [
          {
            id: 'a1',
            type: 'set-guard-outcome',
            options: {},
            params: [
              { id: 'p1', name: 'outcome', type: 'simple_string', value: 'pass', options: {} },
              {
                id: 'p2',
                name: 'reason',
                type: 'simple_string',
                value: 'roster-complete',
                options: {},
              },
            ],
          },
        ],
      },
    ],
  } as unknown as RuleScript;

  it('passes when a rule granted it, and says which reason', () => {
    const decision = evaluateAtHook(
      registry(),
      input({ hook: 'entrant.eligibility', script: granting, context: { now: NOW } }),
    );

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.outcome).toBe('pass');
    expect(decision.value.reason).toBe('roster-complete');
  });
});

describe('a rule with no actions', () => {
  it('fires and changes nothing', () => {
    const inert = {
      id: 'inert',
      rules: [{ id: 'r1', type: 'simple_rule', options: {}, conditions: [], actions: [] }],
    } as unknown as RuleScript;

    const decision = evaluateAtHook(registry(), input({ script: inert }));

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.effects).toHaveLength(0);
    expect(decision.value.outcome).toBe('pass');
    // It ran: the explanation records the rule as executed.
    expect(JSON.stringify(decision.value.record.trace)).toContain('1 rule(s) executed');
  });
});

describe('the trace', () => {
  it('locks a hook evaluation against its golden fixture', () => {
    const decision = evaluateAtHook(registry(), input({ script: alertScript }));

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expectGolden('hook-score-changed-notification', {
      outcome: decision.value.outcome,
      reason: decision.value.reason,
      effects: decision.value.effects,
      // The neuron sub-explanation is excluded, as the other goldens exclude
      // it, to avoid coupling the fixture to upstream internals.
      hookNode: {
        ...decision.value.record.trace[0],
        children: decision.value.record.trace[0]?.children?.filter(
          (child) => !child.id.endsWith('-execution'),
        ),
      },
    });
  });

  it('names the hook alongside the script and the rule', () => {
    const decision = evaluateAtHook(registry(), input({ script: alertScript }));

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const [root] = decision.value.record.trace;

    expect(root?.id).toBe('score.changed:lead-alert');
    expect(root?.values).toMatchObject({
      hook: 'score.changed',
      polarity: 'permissive',
      cause: 'evt-7',
      seed: 42,
    });
    expect(root?.children?.map((child) => child.id)).toEqual(
      expect.arrayContaining(['lead-alert-expressions', 'lead-alert-effects']),
    );
  });
});
