import { type ExecutionContext } from '@sebasoft/neuron-js';
import {
  ExpressionNumberParameter,
  ExpressionStringParameter,
  StateNumberParameter,
  StateStringParameter,
} from './vocabulary.js';

/**
 * The four CopaLibre parameters, each in both modes: a fixed value, and an
 * expression declared in `options.expression`.
 */

const context: ExecutionContext = {
  messages: [],
  state: { score: { home: 5, away: 2 }, entrant: { status: 'withdrawn' } },
};

function contextOf(state: Record<string, unknown> = {}): ExecutionContext {
  return { messages: [], state };
}

describe('simple_number in both modes', () => {
  const build = (value: unknown, options: Record<string, unknown>, fallback?: number) =>
    new ExpressionNumberParameter('p1', 'simple_number', 'op1', value as number, options, fallback);

  it('reads a literal, including one spelled as text', () => {
    expect(build(3, {}).getValue(context)).toBe(3);
    expect(build('3', {}).getValue(context)).toBe(3);
  });

  it('falls back when there is no value, and refuses text that is not a number', () => {
    expect(build(null, {}, 7).getValue(context)).toBe(7);
    expect(build(null, {}).getValue(context)).toBeNull();
    expect(build('abc', {}).getValue(context)).toBeNull();
  });

  it('resolves an expression to a number', () => {
    expect(build(null, { expression: '{{ score.home - score.away }}' }).getValue(context)).toBe(3);
  });

  it('is null when the expression resolves to text, rather than coercing it', () => {
    expect(build(null, { expression: 'Group {{ score.home }}' }).getValue(context)).toBeNull();
  });

  it('is null when the expression cannot answer', () => {
    expect(build(null, { expression: '{{ score.margin }}' }).getValue(context)).toBeNull();
  });
});

describe('simple_string in both modes', () => {
  const build = (value: unknown, options: Record<string, unknown>, fallback?: string) =>
    new ExpressionStringParameter('p1', 'simple_string', 'op1', value as string, options, fallback);

  it('reads a literal and its fallback', () => {
    expect(build('final', {}).getValue(context)).toBe('final');
    expect(build(null, {}, 'final').getValue(context)).toBe('final');
    expect(build(null, {}).getValue(context)).toBeNull();
  });

  it('resolves an expression, rendering a number as its text', () => {
    expect(build(null, { expression: 'Home {{ score.home }}' }).getValue(context)).toBe('Home 5');
    expect(build(null, { expression: '{{ score.home }}' }).getValue(context)).toBe('5');
  });
});

describe('state-number in both modes', () => {
  const build = (options: Record<string, unknown>, fallback?: number) =>
    new StateNumberParameter('p1', 'state-number', 'op1', null, options, fallback);

  it('reads the state at options.path', () => {
    expect(build({ path: 'score.home' }).getValue(context)).toBe(5);
  });

  it('falls back when the path is absent, missing, or holds something else', () => {
    expect(build({ path: 'score.margin' }, 0).getValue(context)).toBe(0);
    expect(build({}).getValue(context)).toBeNull();
    expect(build({ path: 'entrant.status' }).getValue(context)).toBeNull();
  });

  it('prefers an expression when one is declared', () => {
    expect(
      build({ path: 'score.home', expression: '{{ score.home - score.away }}' }).getValue(context),
    ).toBe(3);
  });

  it('is null when the declared expression resolves to text', () => {
    expect(build({ expression: 'x{{ score.home }}' }).getValue(context)).toBeNull();
  });
});

describe('state-string in both modes', () => {
  const build = (options: Record<string, unknown>, fallback?: string) =>
    new StateStringParameter('p1', 'state-string', 'op1', null, options, fallback);

  it('reads the state at options.path', () => {
    expect(build({ path: 'entrant.status' }).getValue(context)).toBe('withdrawn');
  });

  it('falls back when the path is absent or holds something else', () => {
    expect(build({ path: 'entrant.note' }, 'none').getValue(context)).toBe('none');
    expect(build({ path: 'score.home' }).getValue(context)).toBeNull();
    expect(build({}).getValue(context)).toBeNull();
  });

  it('resolves an expression, including one over an empty context', () => {
    expect(build({ expression: '{{ upper(entrant.status) }}' }).getValue(context)).toBe(
      'WITHDRAWN',
    );
    expect(build({ expression: '{{ entrant.status }}' }).getValue(contextOf())).toBeNull();
  });
});

describe('the expression record', () => {
  it('is written once per resolution, whichever parameter resolved it', () => {
    const recording = contextOf({ score: { home: 5, away: 2 } });

    new ExpressionNumberParameter('p1', 'simple_number', 'op1', null, {
      expression: '{{ score.home - score.away }}',
    }).getValue(recording);
    new StateStringParameter('p2', 'state-string', 'reason', null, {
      expression: 'by {{ score.home - score.away }}',
    }).getValue(recording);

    expect(recording.messages).toHaveLength(2);
    expect(recording.messages[0]?.text).toContain('op1');
    expect(recording.messages[1]?.text).toContain('reason: by');
  });

  it('is not written at all for a parameter in fixed mode', () => {
    const recording = contextOf({});

    new ExpressionNumberParameter('p1', 'simple_number', 'op1', 3, {}).getValue(recording);

    expect(recording.messages).toHaveLength(0);
  });
});
