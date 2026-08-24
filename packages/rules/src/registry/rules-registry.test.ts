import type { RuleScript } from './rules-registry.js';
import { RulesRegistry } from './rules-registry.js';
import { registerCopalibreVocabulary } from '../evaluation/vocabulary.js';
import { createHookScriptRegistry } from '../index.js';

function scriptWith(partial: {
  ruleType?: string;
  conditionType?: string;
  actionType?: string;
  paramType?: string;
}): RuleScript {
  return {
    id: 'script-under-test',
    rules: [
      {
        id: 'r1',
        type: partial.ruleType ?? 'simple_rule',
        options: {},
        conditions: [
          {
            id: 'c1',
            type: partial.conditionType ?? 'compare_two_numbers',
            options: {},
            params: [
              {
                id: 'p1',
                name: 'op1',
                type: partial.paramType ?? 'simple_number',
                value: '1',
                options: {},
              },
            ],
          },
        ],
        actions: [
          {
            id: 'a1',
            type: partial.actionType ?? 'set-guard-outcome',
            options: {},
            params: [],
          },
        ],
      },
    ],
  } as unknown as RuleScript;
}

function validNotifyDocument() {
  return {
    id: 'notify-script',
    rules: [
      {
        id: 'notify-rule',
        type: 'simple_rule',
        options: {},
        conditions: [] as {
          id: string;
          type: string;
          options: Record<string, unknown>;
          params: {
            id: string;
            name: string;
            type: string;
            value: string;
            options: Record<string, unknown>;
          }[];
        }[],
        actions: [
          {
            id: 'notify-action',
            type: 'notify',
            options: {},
            params: [
              {
                id: 'title',
                name: 'title',
                type: 'simple_string',
                value: 'Match update',
                options: {},
              },
              {
                id: 'message',
                name: 'message',
                type: 'simple_string',
                value: 'Event recorded',
                options: {},
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('RulesRegistry', () => {
  it('permits documented built-ins and registered CopaLibre vocabulary', () => {
    const registry = registerCopalibreVocabulary(new RulesRegistry());
    expect(registry.validateScriptReferences(scriptWith({})).ok).toBe(true);
    expect(registry.has('parameter', 'simple_number')).toBe(true);
    expect(registry.has('action', 'set-guard-outcome')).toBe(true);
    expect(registry.has('rule', 'simple_rule')).toBe(true);
  });

  it.each([
    ['rule', { ruleType: 'chaotic_rule' }],
    ['condition', { conditionType: 'roll-dice' }],
    ['action', { actionType: 'launch-fireworks' }],
    ['parameter', { paramType: 'telepathy' }],
  ])('rejects a script referencing an unregistered %s', (_kind, partial) => {
    const registry = registerCopalibreVocabulary(new RulesRegistry());
    const result = registry.validateScriptReferences(scriptWith(partial));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNREGISTERED_RULE_ELEMENT');
    }
  });

  it('validates descriptor notification capabilities against the registry', () => {
    const registry = new RulesRegistry();
    registry.registerNotificationCapability('threshold-count', 'Count events to a threshold');
    const descriptor = {
      descriptorId: 'd-1',
      name: 'Orbital Field',
      notificationRuleCapabilities: ['threshold-count'],
    };
    expect(
      registry.validateDescriptorReferences(
        descriptor as unknown as Parameters<RulesRegistry['validateDescriptorReferences']>[0],
      ).ok,
    ).toBe(true);
  });

  it('rejects a descriptor referencing an unregistered capability', () => {
    const registry = new RulesRegistry();
    const descriptor = {
      descriptorId: 'd-1',
      name: 'Orbital Field',
      notificationRuleCapabilities: ['mind-reading'],
    };
    const result = registry.validateDescriptorReferences(
      descriptor as unknown as Parameters<RulesRegistry['validateDescriptorReferences']>[0],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.capability).toBe('mind-reading');
    }
  });

  it('lists every registered entry for auditing/UI surfaces', () => {
    const registry = registerCopalibreVocabulary(new RulesRegistry());
    const types = registry.list().map((entry) => entry.type);
    expect(types).toEqual(
      expect.arrayContaining(['simple_rule', 'simple_number', 'simple_string', 'value_exists']),
    );
  });

  it('builds a hook-specific registry from conditions and declared-effect actions only', () => {
    const registry = createHookScriptRegistry();
    const types = registry.list().map((entry) => entry.type);

    expect(types).toEqual(
      expect.arrayContaining([
        'simple_rule',
        'compare_two_numbers',
        'value_exists',
        'notify',
        'startTimer',
        'stopTimer',
        'adjustStatistic',
        'applyTag',
      ]),
    );
    expect(types).not.toEqual(
      expect.arrayContaining(['add_two_numbers', 'set-guard-outcome', 'winMatch', 'rejectDraw']),
    );
  });

  it('exposes JSON-serializable named authoring definitions', () => {
    const notify = createHookScriptRegistry()
      .list()
      .find((entry) => entry.kind === 'action' && entry.type === 'notify');

    expect(notify?.authoring?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'title',
          required: true,
          parameterTypes: ['simple_string'],
          allowExpression: true,
          valueSchema: { type: 'string', minLength: 1 },
        }),
      ]),
    );
    expect(() => JSON.stringify(createHookScriptRegistry().list())).not.toThrow();
  });

  it('validates required named parameters and their JSON Schema values', () => {
    const invalid = {
      id: 'invalid-notification',
      rules: [
        {
          id: 'always',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [
            {
              id: 'notify',
              type: 'notify',
              options: {},
              params: [
                {
                  id: 'title',
                  name: 'title',
                  type: 'simple_string',
                  value: 4,
                  options: {},
                },
              ],
            },
          ],
        },
      ],
    } as unknown as RuleScript;

    const invalidValue = createHookScriptRegistry().validateScriptReferences(invalid);
    expect(invalidValue.ok).toBe(false);
    if (!invalidValue.ok) expect(invalidValue.error.message).toContain('title');

    const missingMessage = structuredClone(invalid) as unknown as {
      rules: { actions: { params: { value: unknown }[] }[] }[];
    };
    missingMessage.rules[0]?.actions[0]?.params.splice(0, 1, {
      id: 'title',
      name: 'title',
      type: 'simple_string',
      value: 'Valid title',
      options: {},
    } as never);
    const missing = createHookScriptRegistry().validateScriptReferences(
      missingMessage as unknown as RuleScript,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.message).toContain('message');
  });

  it('refuses duplicate, unknown, wrongly typed, and forbidden-expression parameters', () => {
    const duplicate = validNotifyDocument();
    const duplicateAction = duplicate.rules[0]?.actions[0];
    if (!duplicateAction) throw new Error('Expected notification action');
    const originalTitle = duplicateAction.params[0];
    if (!originalTitle) throw new Error('Expected title parameter');
    duplicateAction.params.push({ ...originalTitle, id: 'second-title' });

    const unknown = validNotifyDocument();
    const unknownAction = unknown.rules[0]?.actions[0];
    if (!unknownAction) throw new Error('Expected notification action');
    unknownAction.params.push({
      id: 'audience',
      name: 'audience',
      type: 'simple_string',
      value: 'everyone',
      options: {},
    });

    const wrongType = validNotifyDocument();
    const wrongTypeMessage = wrongType.rules[0]?.actions[0]?.params.find(
      (candidate) => candidate.name === 'message',
    );
    if (!wrongTypeMessage) throw new Error('Expected message parameter');
    wrongTypeMessage.type = 'simple_number';

    const forbiddenExpression = validNotifyDocument();
    const expressionAction = forbiddenExpression.rules[0]?.actions[0];
    if (!expressionAction) throw new Error('Expected notification action');
    expressionAction.params.push({
      id: 'severity',
      name: 'severity',
      type: 'simple_string',
      value: '{{ event.category }}',
      options: { expression: true },
    });

    for (const [document, expected] of [
      [duplicate, 'repeats parameter "title"'],
      [unknown, 'unknown parameter "audience"'],
      [wrongType, 'parameter "message" requires one of'],
      [forbiddenExpression, 'parameter "severity" does not allow expressions'],
    ] as const) {
      const result = createHookScriptRegistry().validateScriptReferences(
        document as unknown as RuleScript,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain(expected);
    }
  });

  it('validates condition options against the registry definition', () => {
    const document = validNotifyDocument();
    const rule = document.rules[0];
    if (!rule) throw new Error('Expected notification rule');
    rule.conditions.push({
      id: 'exists-condition',
      type: 'value_exists',
      options: {},
      params: [],
    });

    const result = createHookScriptRegistry().validateScriptReferences(
      document as unknown as RuleScript,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('invalid options');
  });
});
