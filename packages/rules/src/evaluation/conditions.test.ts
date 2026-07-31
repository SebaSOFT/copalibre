import { type ExecutionContext, type ParameterInterface } from '@sebasoft/neuron-js';
import { RulesRegistry } from '../registry/rules-registry.js';
import { registerCopalibreVocabulary } from './vocabulary.js';
import {
  CompareTwoInstantsCondition,
  CompareTwoNumbersCondition,
  CompareTwoStringsCondition,
  ValueExistsCondition,
  ValueInSetCondition,
} from './conditions.js';

function registry(): RulesRegistry {
  return registerCopalibreVocabulary(new RulesRegistry());
}

function contextOf(state: Record<string, unknown>): ExecutionContext {
  return { messages: [], state };
}

interface ParamSpec {
  readonly name: string;
  readonly type: string;
  readonly value?: unknown;
  readonly options?: Record<string, unknown>;
}

function params(...specs: readonly ParamSpec[]): ParameterInterface[] {
  return specs.map((spec, index) => ({
    id: `p${index + 1}`,
    name: spec.name,
    type: spec.type,
    value: spec.value ?? null,
    options: spec.options ?? {},
  })) as ParameterInterface[];
}

const literal = (name: string, type: string, value: unknown): ParamSpec => ({ name, type, value });

/** Reading a path is the degenerate expression, so state reads look like this. */
const fromState = (name: string, type: string, path: string): ParamSpec => ({
  name,
  type: type === 'state-number' ? 'simple_number' : 'simple_string',
  value: `{{ ${path} }}`,
  options: { expression: true },
});

describe('compare_two_strings', () => {
  it('answers a categorical question without expressing it as a number', () => {
    const condition = new CompareTwoStringsCondition(
      'c1',
      CompareTwoStringsCondition.TYPE,
      params(
        fromState('op1', 'state-string', 'entrant.status'),
        literal('comp', 'comparator', '='),
        literal('op2', 'simple_string', 'withdrawn'),
      ),
      {},
      registry().getNeuron(),
    );

    const result = condition.execute(contextOf({ entrant: { status: 'withdrawn' } }));

    expect(result.isSuccessful()).toBe(true);
    expect(result.value).toBe(true);
  });

  it('orders strings by codepoint, so the answer does not depend on a locale', () => {
    const condition = new CompareTwoStringsCondition(
      'c1',
      CompareTwoStringsCondition.TYPE,
      params(
        literal('op1', 'simple_string', 'a'),
        literal('comp', 'comparator', '<'),
        literal('op2', 'simple_string', 'b'),
      ),
      {},
      registry().getNeuron(),
    );

    expect(condition.execute(contextOf({})).value).toBe(true);
  });

  it.each([
    ['=', 'b', 'b', true],
    ['!=', 'a', 'b', true],
    ['<', 'a', 'b', true],
    ['<=', 'b', 'b', true],
    ['>', 'b', 'a', true],
    ['>=', 'a', 'b', false],
  ])('resolves "%s" over %s and %s as %s', (comparator, op1, op2, expected) => {
    const condition = new CompareTwoStringsCondition(
      'c1',
      CompareTwoStringsCondition.TYPE,
      params(
        literal('op1', 'simple_string', op1),
        literal('comp', 'comparator', comparator),
        literal('op2', 'simple_string', op2),
      ),
      {},
      registry().getNeuron(),
    );

    expect(condition.execute(contextOf({})).value).toBe(expected);
  });

  it('folds case only when the element declares it', () => {
    const build = (caseSensitive: boolean | undefined) =>
      new CompareTwoStringsCondition(
        'c1',
        CompareTwoStringsCondition.TYPE,
        params(
          literal('op1', 'simple_string', 'Withdrawn'),
          literal('comp', 'comparator', '='),
          literal('op2', 'simple_string', 'withdrawn'),
        ),
        caseSensitive === undefined ? {} : { caseSensitive },
        registry().getNeuron(),
      );

    expect(build(undefined).execute(contextOf({})).value).toBe(false);
    expect(build(false).execute(contextOf({})).value).toBe(true);
  });

  it('applies the declared missing-value behaviour when an operand is absent', () => {
    const build = (onMissing: 'true' | 'false' | undefined) =>
      new CompareTwoStringsCondition(
        'c1',
        CompareTwoStringsCondition.TYPE,
        params(
          fromState('op1', 'state-string', 'entrant.status'),
          literal('comp', 'comparator', '='),
          literal('op2', 'simple_string', 'withdrawn'),
        ),
        onMissing === undefined ? {} : { onMissing },
        registry().getNeuron(),
      );

    expect(build(undefined).execute(contextOf({})).value).toBe(false);
    expect(build('true').execute(contextOf({})).value).toBe(true);
    // A missing fact is not an execution failure: the rule still ran.
    expect(build(undefined).execute(contextOf({})).isSuccessful()).toBe(true);
  });

  it('refuses a declaration with no comparator, which is an authoring error', () => {
    const condition = new CompareTwoStringsCondition(
      'c1',
      CompareTwoStringsCondition.TYPE,
      params(literal('op1', 'simple_string', 'a'), literal('op2', 'simple_string', 'b')),
      {},
      registry().getNeuron(),
    );

    const result = condition.execute(contextOf({}));

    expect(result.isSuccessful()).toBe(false);
    expect(result.messages.join(' ')).toContain('comp');
  });
});

describe('value_in_set', () => {
  const disqualifying = { values: ['red-card', 'match-fixing', 'violent-conduct'] };

  const build = (options: Record<string, unknown>) =>
    new ValueInSetCondition(
      'c1',
      ValueInSetCondition.TYPE,
      params(fromState('value', 'state-string', 'event.definitionCode')),
      options,
      registry().getNeuron(),
    );

  it('is true for any member of the declared list', () => {
    expect(
      build(disqualifying).execute(contextOf({ event: { definitionCode: 'red-card' } })).value,
    ).toBe(true);
  });

  it('is false for anything else', () => {
    expect(
      build(disqualifying).execute(contextOf({ event: { definitionCode: 'yellow-card' } })).value,
    ).toBe(false);
  });

  it('folds case on both sides when the element declares it', () => {
    const result = build({ ...disqualifying, caseSensitive: false }).execute(
      contextOf({ event: { definitionCode: 'RED-CARD' } }),
    );

    expect(result.value).toBe(true);
  });

  it('applies the declared missing-value behaviour when nothing was recorded', () => {
    expect(build(disqualifying).execute(contextOf({})).value).toBe(false);
    expect(build({ ...disqualifying, onMissing: 'true' }).execute(contextOf({})).value).toBe(true);
  });

  it('refuses an element declaring no list', () => {
    expect(
      build({})
        .execute(contextOf({ event: { definitionCode: 'red-card' } }))
        .isSuccessful(),
    ).toBe(false);
  });
});

describe('value_exists', () => {
  const build = (path: string) =>
    new ValueExistsCondition(
      'c1',
      ValueExistsCondition.TYPE,
      params(),
      { path },
      registry().getNeuron(),
    );

  it.each([
    ['a recorded zero', { checkIn: { count: 0 } }, 'checkIn.count', true],
    ['a recorded empty string', { checkIn: { note: '' } }, 'checkIn.note', true],
    ['a recorded false', { checkIn: { late: false } }, 'checkIn.late', true],
    ['nothing recorded', {}, 'checkIn.count', false],
    ['an explicit null', { checkIn: { count: null } }, 'checkIn.count', false],
  ])('reads %s as %s', (_label, state, path, expected) => {
    expect(build(path).execute(contextOf(state)).value).toBe(expected);
  });

  it('says which it was: never recorded, or recorded as not applying', () => {
    expect(build('checkIn.count').execute(contextOf({})).messages.join(' ')).toContain(
      'not recorded',
    );
    expect(
      build('checkIn.count')
        .execute(contextOf({ checkIn: { count: null } }))
        .messages.join(' '),
    ).toContain('does not apply');
  });

  it('refuses an element naming no path', () => {
    const condition = new ValueExistsCondition(
      'c1',
      ValueExistsCondition.TYPE,
      params(),
      {},
      registry().getNeuron(),
    );

    expect(condition.execute(contextOf({})).isSuccessful()).toBe(false);
  });
});

describe('compare_two_instants', () => {
  const build = (op1: unknown, comparator: string, op2: unknown, options = {}) =>
    new CompareTwoInstantsCondition(
      'c1',
      CompareTwoInstantsCondition.TYPE,
      params(
        literal('op1', 'simple_string', op1),
        literal('comp', 'comparator', comparator),
        literal('op2', 'simple_string', op2),
      ),
      options,
      registry().getNeuron(),
    );

  it('compares the time and not the text', () => {
    // Same instant, two spellings: text ordering would call them different.
    const result = build('2026-07-31T12:00:00.000Z', '=', '2026-07-31T09:00:00.000-03:00').execute(
      contextOf({}),
    );

    expect(result.value).toBe(true);
  });

  it('accepts epoch milliseconds, which is what the context publishes', () => {
    const condition = new CompareTwoInstantsCondition(
      'c1',
      CompareTwoInstantsCondition.TYPE,
      params(
        fromState('op1', 'state-number', 'segment.finishedAt'),
        literal('comp', 'comparator', '>'),
        fromState('op2', 'state-number', 'segment.regulationEndsAt'),
      ),
      {},
      registry().getNeuron(),
    );

    const ranLong = condition.execute(
      contextOf({
        segment: { finishedAt: 1_770_000_060_000, regulationEndsAt: 1_770_000_000_000 },
      }),
    );

    expect(ranLong.value).toBe(true);
  });

  it.each([['yesterday'], [''], [Number.POSITIVE_INFINITY], [Number.NaN]])(
    'treats %p as a missing instant rather than an error',
    (operand) => {
      const result = build(operand, '<', '2026-07-31T12:00:00.000Z').execute(contextOf({}));

      expect(result.isSuccessful()).toBe(true);
      expect(result.value).toBe(false);
    },
  );

  it('refuses a declaration with no comparator', () => {
    const condition = new CompareTwoInstantsCondition(
      'c1',
      CompareTwoInstantsCondition.TYPE,
      params(literal('op1', 'simple_string', '2026-07-31T12:00:00.000Z')),
      {},
      registry().getNeuron(),
    );

    expect(condition.execute(contextOf({})).isSuccessful()).toBe(false);
  });
});

describe('compare_two_numbers, re-registered', () => {
  const build = (op1: unknown, op2: unknown, options = {}) =>
    new CompareTwoNumbersCondition(
      'c1',
      CompareTwoNumbersCondition.TYPE,
      params(
        literal('op1', 'simple_number', op1),
        literal('comp', 'comparator', '>'),
        literal('op2', 'simple_number', op2),
      ),
      options,
      registry().getNeuron(),
    );

  it('compares numbers as it always did', () => {
    expect(build(5, 2).execute(contextOf({})).value).toBe(true);
    expect(build(2, 5).execute(contextOf({})).value).toBe(false);
  });

  it('still compares two strings, which the built-in also did', () => {
    const condition = new CompareTwoNumbersCondition(
      'c1',
      CompareTwoNumbersCondition.TYPE,
      params(
        literal('op1', 'simple_string', 'b'),
        literal('comp', 'comparator', '>'),
        literal('op2', 'simple_string', 'a'),
      ),
      {},
      registry().getNeuron(),
    );

    expect(condition.execute(contextOf({})).value).toBe(true);
  });

  it('fails on a missing operand by default, exactly as before this change', () => {
    expect(build(null, 2).execute(contextOf({})).isSuccessful()).toBe(false);
  });

  it('degrades instead when the element declares it', () => {
    expect(build(null, 2, { onMissing: 'false' }).execute(contextOf({})).isSuccessful()).toBe(true);
    expect(build(null, 2, { onMissing: 'false' }).execute(contextOf({})).value).toBe(false);
    expect(build(null, 2, { onMissing: 'true' }).execute(contextOf({})).value).toBe(true);
  });

  it('refuses a declaration with no comparator', () => {
    const condition = new CompareTwoNumbersCondition(
      'c1',
      CompareTwoNumbersCondition.TYPE,
      params(literal('op1', 'simple_number', 5)),
      {},
      registry().getNeuron(),
    );

    expect(condition.execute(contextOf({})).isSuccessful()).toBe(false);
  });
});

describe('the declared missing-value behaviour', () => {
  it('can abort the rule instead of answering, on any of the four', () => {
    const condition = new ValueInSetCondition(
      'c1',
      ValueInSetCondition.TYPE,
      params(fromState('value', 'state-string', 'event.definitionCode')),
      { values: ['red-card'], onMissing: 'error' },
      registry().getNeuron(),
    );

    expect(condition.execute(contextOf({})).isSuccessful()).toBe(false);
  });
});

describe('the registry listing', () => {
  it('holds all four with a description apiece', () => {
    const listed = registry()
      .list()
      .filter((entry) => entry.kind === 'condition');

    expect(listed.map((entry) => entry.type)).toEqual(
      expect.arrayContaining([
        'compare_two_numbers',
        'compare_two_strings',
        'value_in_set',
        'value_exists',
        'compare_two_instants',
      ]),
    );
    for (const entry of listed) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('accepts a script referencing one, which it would have refused before', () => {
    const result = registry().validateScriptReferences({
      id: 'withdrawn-check',
      rules: [
        {
          type: 'simple_rule',
          conditions: [{ type: 'value_exists' }],
          actions: [{ type: 'set-guard-outcome' }],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });
});
