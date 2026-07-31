import { type ExecutionContext } from '@sebasoft/neuron-js';
import { expressionResolutions } from '../expressions/expression.js';
import { NumberParameter, StringParameter } from './vocabulary.js';

/**
 * Two parameters, two modes. The value holds what the author wrote and
 * `options.expression` says how to read it, so flipping the mode moves nothing.
 */

const context: ExecutionContext = {
  messages: [],
  state: { score: { home: 5, away: 2 }, entrant: { status: 'withdrawn' }, segment: { number: 2 } },
};

function contextOf(state: Record<string, unknown> = {}): ExecutionContext {
  return { messages: [], state };
}

const EXPRESSION = { expression: true };

describe('simple_number', () => {
  const build = (value: unknown, options: Record<string, unknown>, fallback?: number) =>
    new NumberParameter('p1', 'simple_number', 'op1', value as number, options, fallback);

  it('reads a literal, including one spelled as text', () => {
    expect(build(3, {}).getValue(context)).toBe(3);
    expect(build('3', {}).getValue(context)).toBe(3);
  });

  it('falls back when there is no value, and refuses text that is not a number', () => {
    expect(build(null, {}, 7).getValue(context)).toBe(7);
    expect(build(null, {}).getValue(context)).toBeNull();
    expect(build('abc', {}).getValue(context)).toBeNull();
  });

  it('computes a value the core never published', () => {
    expect(build('{{ score.home - score.away }}', EXPRESSION).getValue(context)).toBe(3);
  });

  it('reads a plain path, which is the degenerate expression', () => {
    expect(build('{{ score.home }}', EXPRESSION).getValue(context)).toBe(5);
  });

  it('is null when the expression resolves to text, rather than coercing it', () => {
    expect(build('Group {{ score.home }}', EXPRESSION).getValue(context)).toBeNull();
  });

  it('is null when the expression cannot answer', () => {
    expect(build('{{ score.margin }}', EXPRESSION).getValue(context)).toBeNull();
  });

  it('reads its braces literally when the mode is not declared', () => {
    // Refused at validation, but the runtime is still defined: the field says
    // it is a literal, so it is treated as one rather than quietly evaluated.
    expect(build('{{ score.home }}', {}).getValue(context)).toBeNull();
  });
});

describe('simple_string', () => {
  const build = (value: unknown, options: Record<string, unknown>, fallback?: string) =>
    new StringParameter('p1', 'simple_string', 'reason', value as string, options, fallback);

  it('reads a literal and its fallback', () => {
    expect(build('final', {}).getValue(context)).toBe('final');
    expect(build(null, {}, 'final').getValue(context)).toBe('final');
    expect(build(null, {}).getValue(context)).toBeNull();
  });

  it('interpolates literal text and expressions into one message', () => {
    expect(
      build(
        'Period {{ segment.number }}: home leads by {{ score.home - score.away }}',
        EXPRESSION,
      ).getValue(context),
    ).toBe('Period 2: home leads by 3');
  });

  it('renders a whole-field expression as its text', () => {
    expect(build('{{ score.home }}', EXPRESSION).getValue(context)).toBe('5');
    expect(build('{{ upper(entrant.status) }}', EXPRESSION).getValue(context)).toBe('WITHDRAWN');
  });

  it('is null when a whole-field expression cannot answer', () => {
    expect(build('{{ entrant.status }}', EXPRESSION).getValue(contextOf())).toBeNull();
  });

  it('renders an unanswerable expression inside a message as nothing', () => {
    expect(build('Status: {{ entrant.status }}', EXPRESSION).getValue(contextOf())).toBe(
      'Status: ',
    );
  });

  it('keeps its braces as text when the mode is not declared', () => {
    expect(build('{{ score.home }}', {}).getValue(context)).toBe('{{ score.home }}');
  });
});

describe('the expression record', () => {
  it('is written once per resolution, whichever parameter resolved it', () => {
    const recording = contextOf({ score: { home: 5, away: 2 } });

    new NumberParameter(
      'p1',
      'simple_number',
      'op1',
      '{{ score.home - score.away }}',
      EXPRESSION,
    ).getValue(recording);
    new StringParameter(
      'p2',
      'simple_string',
      'reason',
      'by {{ score.home - score.away }}',
      EXPRESSION,
    ).getValue(recording);

    expect(recording.messages).toHaveLength(2);
    expect(expressionResolutions(recording)).toEqual([
      { parameter: 'op1', source: '{{ score.home - score.away }}', value: 3 },
      { parameter: 'reason', source: 'by {{ score.home - score.away }}', value: 'by 3' },
    ]);
  });

  it('is not written at all for a parameter in fixed mode', () => {
    const recording = contextOf({});

    new NumberParameter('p1', 'simple_number', 'op1', 3, {}).getValue(recording);

    expect(recording.messages).toHaveLength(0);
  });
});
