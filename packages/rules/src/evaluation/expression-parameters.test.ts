import { evaluateGuard } from './guard-evaluator.js';
import { registerCopalibreVocabulary } from './vocabulary.js';
import { RulesRegistry, type RuleScript } from '../registry/rules-registry.js';

/**
 * Expression mode as an author meets it: a parameter with a `{{ }}` in its
 * options, inside an ordinary script, vetted by the ordinary registry.
 */

function registry(): RulesRegistry {
  return registerCopalibreVocabulary(new RulesRegistry());
}

const version = { id: 'margin-guard', version: 1 };

/** Passes when the home side leads by more than `margin`. */
function marginGuard(
  expression: string,
  margin: number,
  conditionOptions: Record<string, unknown> = {},
): RuleScript {
  return {
    id: 'margin-guard',
    rules: [
      {
        id: 'r1',
        type: 'simple_rule',
        options: {},
        conditions: [
          {
            id: 'c1',
            type: 'compare_two_numbers',
            options: conditionOptions,
            params: [
              {
                id: 'p1',
                name: 'op1',
                type: 'simple_number',
                value: expression,
                options: { expression: true },
              },
              { id: 'p2', name: 'comp', type: 'comparator', value: '>', options: {} },
              { id: 'p3', name: 'op2', type: 'simple_number', value: margin, options: {} },
            ],
          },
        ],
        actions: [
          {
            id: 'a1',
            type: 'set-guard-outcome',
            options: {},
            params: [
              { id: 'p4', name: 'outcome', type: 'simple_string', value: 'pass', options: {} },
              {
                id: 'p5',
                name: 'reason',
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
}

const scores = { score: { home: 5, away: 2 } };

describe('a parameter in expression mode', () => {
  it('compares a computed value the core never published', () => {
    const decision = evaluateGuard(registry(), {
      script: marginGuard('{{ score.home - score.away }}', 2),
      ruleVersion: version,
      context: scores,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.passed).toBe(true);
  });

  it('does not fire when the computed value falls short', () => {
    const decision = evaluateGuard(registry(), {
      script: marginGuard('{{ score.home - score.away }}', 3),
      ruleVersion: version,
      context: scores,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.passed).toBe(false);
  });

  it('resolves a mixed field to a message, the same mechanism serving both', () => {
    const decision = evaluateGuard(registry(), {
      script: marginGuard('{{ score.home - score.away }}', 2),
      ruleVersion: version,
      context: scores,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.reason).toBe('Home leads by 3');
  });

  it('records the source beside the resolved value, as the console will show them', () => {
    const decision = evaluateGuard(registry(), {
      script: marginGuard('{{ score.home - score.away }}', 2),
      ruleVersion: version,
      context: scores,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const expressions = decision.value.record.trace[0]?.children?.find(
      (child) => child.id === 'margin-guard-expressions',
    );

    expect(expressions?.values?.resolutions).toEqual([
      { parameter: 'op1', source: '{{ score.home - score.away }}', value: 3 },
      {
        parameter: 'reason',
        source: 'Home leads by {{ score.home - score.away }}',
        value: 'Home leads by 3',
      },
    ]);
  });

  it('leaves the parameter type untouched, so the registry vets it exactly as before', () => {
    const script = marginGuard('{{ score.home - score.away }}', 2);
    const parameterTypes = script.rules
      .flatMap((rule) => rule.conditions ?? [])
      .flatMap((condition) => condition.params ?? [])
      .map((parameter) => parameter.type);

    expect(parameterTypes).toEqual(['simple_number', 'comparator', 'simple_number']);
    expect(registry().validateScriptReferences(script).ok).toBe(true);
  });

  it('degrades rather than throwing when the element declares it', () => {
    const decision = evaluateGuard(registry(), {
      script: marginGuard('{{ score.home - score.away }}', 2, { onMissing: 'false' }),
      ruleVersion: version,
      context: {},
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    // Nothing to compare, so nothing granted: a guard is default-deny.
    expect(decision.value.passed).toBe(false);
  });

  it('keeps Neuron’s strictness by default, so scripts written before this change are unaffected', () => {
    const decision = evaluateGuard(registry(), {
      script: marginGuard('{{ score.home - score.away }}', 2),
      ruleVersion: version,
      context: {},
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.code).toBe('GUARD_EVALUATION_FAILED');
  });
});

describe('the registry vets an expression at installation', () => {
  it.each([
    ['{{ score.home > score.away }}', 'conditions'],
    ['{{ score.home ? 1 : 2 }}', 'ConditionalExpression'],
    ['{{ sneak(score.home) }}', 'sneak'],
  ])('refuses %s before anything evaluates it', (expression, named) => {
    const result = registry().validateScriptReferences(marginGuard(expression, 2));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(named);
  });

  it('refuses braces in a field that did not declare the mode, rather than printing them', () => {
    const script = marginGuard('{{ score.home - score.away }}', 2);
    const parameter = script.rules[0]?.conditions?.[0]?.params?.[0] as unknown as {
      options: Record<string, unknown>;
    };
    parameter.options = {};

    const result = registry().validateScriptReferences(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('not in expression mode');
  });

  it('refuses expression mode over a value that is not the expression source', () => {
    const script = marginGuard('{{ score.home - score.away }}', 2);
    const parameter = script.rules[0]?.conditions?.[0]?.params?.[0] as unknown as {
      value: unknown;
    };
    parameter.value = 42;

    const result = registry().validateScriptReferences(script);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('must be the expression source');
  });

  it('no longer knows the state-reading types the expression replaced', () => {
    expect(registry().has('parameter', 'state-number')).toBe(false);
    expect(registry().has('parameter', 'state-string')).toBe(false);
  });

  it('refuses it through the guard evaluator too, which vets before executing', () => {
    const decision = evaluateGuard(registry(), {
      script: marginGuard('{{ score.home > score.away }}', 2),
      ruleVersion: version,
      context: scores,
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.code).toBe('RULE_SCRIPT_INVALID');
  });
});
