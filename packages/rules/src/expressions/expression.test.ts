import { type ExecutionContext } from '@sebasoft/neuron-js';
import {
  evaluateExpression,
  expressionResolutions,
  resolveExpressionField,
  resolveParameterExpression,
  splitTemplate,
  validateExpression,
} from './expression.js';

function contextOf(state: Record<string, unknown> = {}): ExecutionContext {
  return { messages: [], state };
}

const match = contextOf({
  score: { home: 5, away: 2, sides: [{ value: 5 }, { value: 2 }] },
  group: { number: 3 },
  segment: { finishedAt: 1_770_000_600_000, startedAt: 1_770_000_000_000 },
  tournament: { timeZone: 'America/Argentina/San_Juan', alias: 'copa-cuyo' },
});

describe('what an expression may contain', () => {
  it.each([
    ['score.home - score.away', 3],
    ['(score.home + score.away) * 2', 14],
    ['-score.away', -2],
    ['score.home % 2', 1],
    ['score.sides[0].value', 5],
    ['max(score.home, score.away)', 5],
  ])('evaluates %s', (source, expected) => {
    expect(validateExpression(source).ok).toBe(true);
    expect(evaluateExpression(source, match)).toBe(expected);
  });

  it.each([
    ['score.home > score.away', '">"'],
    ['score.home == score.away', '"=="'],
    ['score.home && score.away', '"&&"'],
    ['score.home ? 1 : 2', 'ConditionalExpression'],
    ['[score.home, score.away]', 'ArrayExpression'],
    ['score.home; score.away', 'Compound'],
  ])('refuses %s, naming what is not permitted', (source, named) => {
    const result = validateExpression(source);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RULE_SCRIPT_INVALID');
    expect(result.error.message).toContain(named.replaceAll('"', ''));
  });

  it('refuses a call to a function the registry does not hold, listing the ones it does', () => {
    const result = validateExpression('sneak(score.home)');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('sneak');
    expect(result.error.message).toContain('daysBetween');
  });

  it.each([['now()'], ['random()'], ['uuid()'], ['dateFormat(segment.startedAt, "iso")']])(
    'refuses %s, because a sampled value is the correct shape for it',
    (source) => {
      expect(validateExpression(source).ok).toBe(false);
    },
  );

  it('refuses a computed lookup, which is not a readable path', () => {
    expect(validateExpression('score[someName]').ok).toBe(false);
  });

  it.each([
    ['!score.home', 'only negation is permitted'],
    ['helpers.max(1, 2)', 'registered function by name'],
    // jsep does not parse an assignment at all, so it never reaches the
    // whitelist — refused either way, and named as unparseable.
    ['score.home = 3', 'not parseable'],
  ])('refuses %s', (source, named) => {
    const result = validateExpression(source);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(named);
  });

  it('concatenates two strings with +, which is what a message wants', () => {
    expect(evaluateExpression('"San " + "Juan"', match)).toBe('San Juan');
  });

  it('produces no value for arithmetic mixing a number and text', () => {
    expect(evaluateExpression('score.home + tournament.alias', match)).toBeUndefined();
  });

  it('produces no value for a literal that is not a scalar', () => {
    expect(evaluateExpression('true', match)).toBe(true);
    expect(evaluateExpression('null', match)).toBeUndefined();
  });

  it('produces no value for a path holding a structure rather than a scalar', () => {
    expect(evaluateExpression('score.sides', match)).toBeUndefined();
  });

  it('refuses an unparseable expression rather than evaluating it', () => {
    expect(validateExpression('score.home +').ok).toBe(false);
    expect(evaluateExpression('score.home +', match)).toBeUndefined();
  });

  it('never evaluates what validation would refuse, even called directly', () => {
    expect(evaluateExpression('score.home > score.away', match)).toBeUndefined();
  });
});

describe('a partial result is no value, never an infinity', () => {
  it.each([
    ['score.home / 0'],
    ['score.home % 0'],
    ['log(0)'],
    ['log(-1)'],
    ['sqrt(-4)'],
    ['average()'],
    ['min()'],
    ['score.nobodyPublishedThis'],
    ['score.nobodyPublishedThis + 1'],
  ])('%s produces no value', (source) => {
    expect(evaluateExpression(source, match)).toBeUndefined();
  });
});

describe('field resolution', () => {
  it('resolves a whole-field expression to its typed value', () => {
    expect(resolveExpressionField('{{ score.home - score.away }}', match)).toBe(3);
  });

  it('resolves a mixed field to a string', () => {
    expect(resolveExpressionField('Group {{ group.number }}', match)).toBe('Group 3');
  });

  it('resolves a field with no expression to itself', () => {
    expect(resolveExpressionField('Half time', match)).toBe('Half time');
  });

  it('renders a value nobody published as nothing, not as its own source', () => {
    expect(resolveExpressionField('Margin: {{ score.margin }}', match)).toBe('Margin: ');
  });

  it('splits the same way for a template as for a parameter', () => {
    expect(splitTemplate('Group {{ group.number }} of {{ group.total }}')).toEqual([
      { kind: 'literal', text: 'Group ' },
      { kind: 'expression', source: 'group.number' },
      { kind: 'literal', text: ' of ' },
      { kind: 'expression', source: 'group.total' },
    ]);
  });
});

describe('the trace', () => {
  it('records the expression source and what it resolved to', () => {
    const context = contextOf({ score: { home: 5, away: 2 } });

    resolveParameterExpression('op1', '{{ score.home - score.away }}', context);

    expect(expressionResolutions(context)).toEqual(['op1: {{ score.home - score.away }} → 3']);
  });

  it('says so when an expression could not answer', () => {
    const context = contextOf({});

    resolveParameterExpression('op1', '{{ score.home }}', context);

    expect(expressionResolutions(context)[0]).toContain('no value');
  });
});
