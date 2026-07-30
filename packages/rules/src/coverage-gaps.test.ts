import { AbstractCondition, ExecutionResult, type ExecutionContext } from '@sebasoft/neuron-js';
import type { DisciplineDescriptor, RecordedEvent } from '@copalibre/domain';
import { GuardEvaluationError, NotificationRuleError, ScriptValidationError } from './errors.js';
import { evaluateGuard } from './evaluation/guard-evaluator.js';
import {
  registerCopalibreVocabulary,
  SetGuardOutcomeAction,
  StateNumberParameter,
  StateStringParameter,
} from './evaluation/vocabulary.js';
import {
  evaluateNotificationRule,
  type NotificationRule,
} from './notifications/notification-rules.js';
import { RulesRegistry, type RuleScript } from './registry/rules-registry.js';
import { resolveTiebreak } from './tiebreak/pipeline.js';

function freshRegistry(): RulesRegistry {
  return registerCopalibreVocabulary(new RulesRegistry());
}

const emptyContext: ExecutionContext = { messages: [], state: { present: 5, name: 'x' } };

describe('vocabulary parameter edge behavior', () => {
  it('state-number falls back to defaultValue, then null', () => {
    const missing = new StateNumberParameter(
      'p',
      'state-number',
      'op1',
      null,
      { path: 'absent.path' },
      7,
    );
    expect(missing.getValue(emptyContext)).toBe(7);
    const noDefault = new StateNumberParameter('p', 'state-number', 'op1', null, {
      path: 'absent.path',
    });
    expect(noDefault.getValue(emptyContext)).toBeNull();
    // No options.path at all: nothing to read, falls back to null.
    const noPath = new StateNumberParameter('p', 'state-number', 'op1', null, {});
    expect(noPath.getValue(emptyContext)).toBeNull();
    // options.path present but not a string: rejected, not coerced.
    const badPath = new StateNumberParameter('p', 'state-number', 'op1', null, { path: 42 });
    expect(badPath.getValue(emptyContext)).toBeNull();
  });

  it('state-string reads strings and falls back like state-number', () => {
    const found = new StateStringParameter('p', 'state-string', 'op1', null, { path: 'name' });
    expect(found.getValue(emptyContext)).toBe('x');
    expect(found.execute(emptyContext).isSuccessful()).toBe(true);
    const missing = new StateStringParameter(
      'p',
      'state-string',
      'op1',
      null,
      { path: 'absent' },
      'dft',
    );
    expect(missing.getValue(emptyContext)).toBe('dft');
  });

  it('state-number execute wraps getValue in a successful result', () => {
    const param = new StateNumberParameter('p', 'state-number', 'op1', null, {
      path: 'present',
    });
    const result = param.execute(emptyContext);
    expect(result.isSuccessful()).toBe(true);
    expect(result.value).toBe(5);
  });

  it('keeps options.path in the serialized parameter so the audit trail shows it', () => {
    // The reason the dot-path lives in `options` rather than a private field:
    // AbstractParameter.toJSON() serializes options, so an auditor reading a
    // stored explanation can still see WHICH fact the decision consumed.
    const param = new StateNumberParameter('p1', 'state-number', 'op1', null, {
      path: 'facts.rosterSize',
    });
    expect(param.toJSON()).toEqual({
      id: 'p1',
      type: 'state-number',
      name: 'op1',
      value: null,
      options: { path: 'facts.rosterSize' },
    });
  });

  it('set-guard-outcome fails execution on missing/invalid parameters', () => {
    const registry = freshRegistry();
    const action = new SetGuardOutcomeAction(
      'a1',
      'set-guard-outcome',
      [
        // outcome present but invalid; reason missing entirely.
        { id: 'o', name: 'outcome', type: 'simple_string', value: 'maybe', options: {} },
      ],
      {},
      registry.getNeuron(),
    );
    const result = action.execute(emptyContext);
    expect(result.isSuccessful()).toBe(false);
  });
});

describe('guard evaluator error paths', () => {
  it('rejects a structurally invalid script via Neuron-JS validation', () => {
    const registry = freshRegistry();
    // Missing rules array entirely — fails validateScript, not our registry.
    const invalid = { id: 'broken' } as unknown as RuleScript;
    const result = evaluateGuard(registry, {
      script: invalid,
      ruleVersion: { id: 'broken', version: 1 },
      facts: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ScriptValidationError);
    }
  });

  it('surfaces a failing rule execution as GuardEvaluationError', () => {
    class ExplodingCondition extends AbstractCondition {
      static readonly TYPE = 'exploding-condition';
      execute(context: ExecutionContext) {
        return new ExecutionResult(false, context, null, ['boom']);
      }
    }
    const registry = freshRegistry();
    registry.registerCondition(
      ExplodingCondition.TYPE,
      ExplodingCondition,
      'Always fails, for testing',
    );
    const script = {
      id: 'exploder',
      rules: [
        {
          id: 'r1',
          type: 'simple_rule',
          options: {},
          conditions: [{ id: 'c1', type: 'exploding-condition', options: {}, params: [] }],
          actions: [],
        },
      ],
    } as unknown as RuleScript;
    const result = evaluateGuard(registry, {
      script,
      ruleVersion: { id: 'exploder', version: 1 },
      facts: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(GuardEvaluationError);
    }
  });
});

describe('error class coverage', () => {
  it('NotificationRuleError carries its stable code', () => {
    const error = new NotificationRuleError('bad rule', { ruleId: 'x' });
    expect(error.code).toBe('NOTIFICATION_RULE_INVALID');
    expect(error.details?.ruleId).toBe('x');
  });
});

describe('registry rule/condition registration', () => {
  it('registers custom rules and conditions into the allowlist', () => {
    class NoopCondition extends AbstractCondition {
      static readonly TYPE = 'noop-condition';
      execute(context: ExecutionContext) {
        return new ExecutionResult(true, context, true);
      }
    }
    const registry = new RulesRegistry();
    registry.registerCondition(NoopCondition.TYPE, NoopCondition, 'Always true');
    expect(registry.has('condition', 'noop-condition')).toBe(true);
  });
});

describe('notification comparator and scope variants', () => {
  const descriptor = {
    descriptorId: 'd-1',
    name: 'Orbital Field',
    eventDefinitions: [{ code: 'infraction', category: 'negative' }],
  } as unknown as DisciplineDescriptor;

  function event(sequence: number, overrides?: Partial<RecordedEvent>): RecordedEvent {
    return {
      eventId: `e-${sequence}`,
      matchId: 'm-1',
      segmentId: 'seg-1',
      definitionCode: 'infraction',
      occurredAt: `2026-07-29T12:00:${String(sequence).padStart(2, '0')}.000Z`,
      sequence,
      side: 'home',
      payload: {},
      ...overrides,
    };
  }

  const base: NotificationRule = {
    id: 'variant-rule',
    version: 1,
    scope: 'match',
    predicate: {},
    aggregation: { kind: 'count' },
    threshold: { comparator: '>', value: 1 },
    semantics: { kind: 'threshold-crossing' },
    action: {
      severity: 'info',
      titleTemplate: 't',
      messageTemplate: 'aggregate={{aggregate}}',
      targetRole: 'observer',
    },
  };

  it.each([
    ['>', 1, [event(1), event(2)], 1],
    ['==', 2, [event(1), event(2), event(3)], 1],
    ['<=', 0, [event(1)], 0],
    ['<', 1, [event(1)], 0],
  ] as const)('comparator %s value %d', (comparator, value, events, expectedFirings) => {
    const rule: NotificationRule = { ...base, threshold: { comparator, value } };
    const evaluation = evaluateNotificationRule(rule, descriptor, events);
    expect(evaluation.instances).toHaveLength(expectedFirings);
  });

  it('scopes by match, segment, and participant', () => {
    const perScope = (scope: NotificationRule['scope']): string => {
      const rule: NotificationRule = { ...base, scope, threshold: { comparator: '>=', value: 1 } };
      const evaluation = evaluateNotificationRule(rule, descriptor, [
        event(1, { participantId: 'p-1' }),
      ]);
      return evaluation.instances[0]?.scopeKey ?? 'none';
    };
    expect(perScope('match')).toBe('match:m-1');
    expect(perScope('segment')).toBe('segment:seg-1');
    expect(perScope('participant')).toBe('participant:p-1');
  });

  it('sum aggregation ignores non-numeric payload values', () => {
    const rule: NotificationRule = {
      ...base,
      aggregation: { kind: 'sum', payloadField: 'seconds' },
      threshold: { comparator: '>=', value: 1 },
    };
    const evaluation = evaluateNotificationRule(rule, descriptor, [
      event(1, { payload: { seconds: 'many' } }),
    ]);
    expect(evaluation.instances).toHaveLength(0);
  });

  it('unknown-side and unknown-participant scope keys are explicit', () => {
    const sideRule: NotificationRule = {
      ...base,
      scope: 'side',
      threshold: { comparator: '>=', value: 1 },
    };
    const evaluation = evaluateNotificationRule(sideRule, descriptor, [
      event(1, { side: undefined }),
    ]);
    expect(evaluation.instances[0]?.scopeKey).toBe('match:m-1/side:unknown');
  });

  it('definitionCodes predicate excludes non-matching events', () => {
    const rule: NotificationRule = {
      ...base,
      predicate: { definitionCodes: ['other-code'] },
      threshold: { comparator: '>=', value: 1 },
    };
    expect(evaluateNotificationRule(rule, descriptor, [event(1)]).instances).toHaveLength(0);
  });

  it('category predicate rejects events whose definition is unknown', () => {
    const rule: NotificationRule = {
      ...base,
      predicate: { categories: ['negative'] },
      threshold: { comparator: '>=', value: 1 },
    };
    const unknownDefinition = event(1, { definitionCode: 'ghost' });
    expect(evaluateNotificationRule(rule, descriptor, [unknownDefinition]).instances).toHaveLength(
      0,
    );
  });
});

describe('tiebreak ordered-value fallbacks', () => {
  it('ranks values outside the ordered list as worst', () => {
    const resolution = resolveTiebreak(
      {
        id: 'p',
        version: 1,
        parameters: [
          {
            id: 'tier',
            label: 'Tier',
            valueType: 'ordered-value',
            direction: { orderedValues: ['gold', 'silver'] },
            missingValue: 'invalid',
            source: 'operator-entered',
          },
        ],
      },
      ['alfa', 'bravo'],
      { alfa: { tier: 'platinum' }, bravo: { tier: 'silver' } },
    );
    expect(resolution.rankedGroups).toEqual([['bravo'], ['alfa']]);
  });

  it('ranks non-numeric values for numeric comparators as worst', () => {
    const resolution = resolveTiebreak(
      {
        id: 'p',
        version: 1,
        parameters: [
          {
            id: 'points',
            label: 'Points',
            valueType: 'number',
            direction: 'higher_wins',
            missingValue: 'invalid',
            source: 'calculated',
          },
        ],
      },
      ['alfa', 'bravo'],
      { alfa: { points: 'NaN-ish' }, bravo: { points: 1 } },
    );
    expect(resolution.rankedGroups).toEqual([['bravo'], ['alfa']]);
  });
});
