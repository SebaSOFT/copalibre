import type { RuleScript } from './rules-registry';
import { RulesRegistry } from './rules-registry';
import { registerCopalibreVocabulary } from '../evaluation/vocabulary';

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

describe('RulesRegistry', () => {
  it('permits documented built-ins and registered CopaLibre vocabulary', () => {
    const registry = registerCopalibreVocabulary(new RulesRegistry());
    expect(registry.validateScriptReferences(scriptWith({})).ok).toBe(true);
    expect(registry.has('parameter', 'state-number')).toBe(true);
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
    expect(types).toEqual(expect.arrayContaining(['simple_rule', 'state-number', 'state-string']));
  });
});
