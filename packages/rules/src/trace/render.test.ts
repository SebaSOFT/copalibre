import { describe, expect, it } from '@jest/globals';
import { resolveTiebreak, type TiebreakPipeline } from '../tiebreak/pipeline.js';
import {
  decidingFactorBetween,
  decidingFactorLabel,
  decidingFactorNodeBetween,
  hasTraceFor,
  lineOf,
  traceForEntrant,
  traceLines,
} from './render.js';
import type { TraceNode } from './explanation-trace.js';

const pipeline: TiebreakPipeline = {
  id: 'liga',
  version: 1,
  parameters: [
    {
      id: 'points',
      label: 'Puntos',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'calculated',
    },
    {
      id: 'head-to-head',
      label: 'Head to head',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'match-derived',
    },
    {
      id: 'score-difference',
      label: 'Diferencia',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'calculated',
    },
  ],
};

describe('traceLines', () => {
  it('reads label, observed values and outcome on one line', () => {
    const node: TraceNode = {
      kind: 'comparator',
      id: 'score-difference',
      label: 'Rule 2 (Diferencia)',
      outcome: 'resolved',
      values: { 'entrant-a': 28, 'entrant-b': 24 },
      detail: 'Diferencia resolved the tie',
    };

    expect(lineOf(node)).toBe(
      'Rule 2 (Diferencia): entrant-a=28, entrant-b=24 → Diferencia resolved the tie',
    );
  });

  it('prints an absent observation as a dash rather than as null', () => {
    expect(
      lineOf({
        kind: 'comparator',
        id: 'h2h',
        label: 'Rule 1 (Head to head)',
        outcome: 'tied-proceed',
        values: { 'entrant-a': null },
      }),
    ).toBe('Rule 1 (Head to head): entrant-a=— → tied-proceed');
  });

  it('omits the value section when the node observed nothing', () => {
    expect(
      lineOf({
        kind: 'comparator',
        id: 'pipeline-exhausted',
        label: 'Pipeline exhausted',
        outcome: 'unresolved-tie',
        detail: 'Every declared comparator was evaluated and a tie survives',
      }),
    ).toBe('Pipeline exhausted → Every declared comparator was evaluated and a tie survives');
  });

  it('indents children under their parent, parents first', () => {
    const lines = traceLines([
      {
        kind: 'rule',
        id: 'r',
        label: 'Regla',
        outcome: 'fired',
        children: [{ kind: 'action', id: 'a', label: 'Acción', outcome: 'applied' }],
      },
    ]);

    expect(lines).toEqual(['Regla → fired', '  Acción → applied']);
  });

  it('is deterministic for identical input', () => {
    const trace = resolveTiebreak(pipeline, ['a', 'b'], {
      a: { points: 6, 'head-to-head': 1 },
      b: { points: 6, 'head-to-head': 0 },
    }).trace;

    expect(traceLines(trace)).toEqual(traceLines(trace));
  });
});

describe('traceForEntrant', () => {
  const values = {
    a: { points: 6, 'head-to-head': 1, 'score-difference': 4 },
    b: { points: 6, 'head-to-head': 0, 'score-difference': 9 },
    c: { points: 3, 'head-to-head': 0, 'score-difference': 1 },
  };

  it('gives no trace to a row the first comparator already separated', () => {
    const { trace } = resolveTiebreak(pipeline, ['a', 'b', 'c'], values);

    expect(traceForEntrant(trace, 'c')).toEqual([]);
    expect(hasTraceFor(trace, 'c')).toBe(false);
  });

  it('gives the tie-broken rows every comparator that looked at them', () => {
    const { trace } = resolveTiebreak(pipeline, ['a', 'b', 'c'], values);
    const forA = traceForEntrant(trace, 'a');

    expect(forA).toHaveLength(2);
    expect(forA.map((node) => node.id)).toEqual(['points', 'head-to-head']);
    expect(hasTraceFor(trace, 'a')).toBe(true);
  });

  it('appends the exhaustion notice only to a row that is still tied', () => {
    const tied = { a: { points: 6 }, b: { points: 6 } };
    const { trace, fullyResolved } = resolveTiebreak(pipeline, ['a', 'b'], tied);

    expect(fullyResolved).toBe(false);
    expect(traceForEntrant(trace, 'a', { stillTied: true }).map((node) => node.id)).toContain(
      'pipeline-exhausted',
    );
    expect(traceForEntrant(trace, 'a').map((node) => node.id)).not.toContain('pipeline-exhausted');
  });
});

describe('decidingFactorLabel', () => {
  const values = {
    a: { points: 6, 'head-to-head': 1, 'score-difference': 4 },
    b: { points: 6, 'head-to-head': 0, 'score-difference': 9 },
    c: { points: 3, 'head-to-head': 0, 'score-difference': 1 },
  };

  it('names the comparator that separated a tie-broken row', () => {
    const { trace } = resolveTiebreak(pipeline, ['a', 'b', 'c'], values);

    expect(decidingFactorLabel(trace, 'a')).toBe('Rule 2 (Head to head)');
  });

  it('returns undefined for a row the first comparator already separated', () => {
    const { trace } = resolveTiebreak(pipeline, ['a', 'b', 'c'], values);

    expect(decidingFactorLabel(trace, 'c')).toBeUndefined();
  });

  it('returns undefined when every comparator left the row tied', () => {
    const tied = { a: { points: 6 }, b: { points: 6 } };
    const { trace, fullyResolved } = resolveTiebreak(pipeline, ['a', 'b'], tied);

    expect(fullyResolved).toBe(false);
    expect(decidingFactorLabel(trace, 'a')).toBeUndefined();
  });
});

describe('decidingFactorBetween', () => {
  const goalAveragePipeline: TiebreakPipeline = {
    id: 'liga-goal-average',
    version: 1,
    parameters: [
      {
        id: 'points',
        label: 'Points',
        valueType: 'number',
        direction: 'higher_wins',
        missingValue: 'treat-as-zero',
        source: 'calculated',
      },
      {
        id: 'head-to-head',
        label: 'Head to head',
        valueType: 'number',
        direction: 'higher_wins',
        missingValue: 'treat-as-zero',
        source: 'match-derived',
        scope: 'head-to-head',
      },
      {
        id: 'goal-average',
        label: 'Goal average',
        valueType: 'number',
        direction: 'higher_wins',
        missingValue: 'treat-as-zero',
        source: 'calculated',
      },
    ],
  };

  it('returns { code, rule } for a two-way tie split by goal-average', () => {
    const { trace } = resolveTiebreak(goalAveragePipeline, ['a', 'b'], {
      a: { points: 6, 'head-to-head': 0, 'goal-average': 2.5 },
      b: { points: 6, 'head-to-head': 0, 'goal-average': 1.2 },
    });

    expect(decidingFactorBetween(trace, 'a', 'b')).toEqual({
      code: 'goal-average',
      rule: 3,
    });
    expect(decidingFactorNodeBetween(trace, 'a', 'b')).toMatchObject({
      rule: 3,
      node: { id: 'goal-average', label: 'Rule 3 (Goal average)' },
    });
  });

  it('splits a three-way tie 1+2 by goal-average and returns undefined for the remaining tied pair', () => {
    const { trace } = resolveTiebreak(goalAveragePipeline, ['a', 'b', 'c'], {
      a: { points: 6, 'head-to-head': 0, 'goal-average': 2.5 },
      b: { points: 6, 'head-to-head': 0, 'goal-average': 1.2 },
      c: { points: 6, 'head-to-head': 0, 'goal-average': 1.2 },
    });

    expect(decidingFactorBetween(trace, 'a', 'b')).toEqual({ code: 'goal-average', rule: 3 });
    expect(decidingFactorBetween(trace, 'a', 'c')).toEqual({ code: 'goal-average', rule: 3 });
    expect(decidingFactorBetween(trace, 'b', 'c')).toBeUndefined();
  });

  it('walks recursive children to report head-to-head for a sub-tied pair after goal-average splits 1+2', () => {
    const trace: TraceNode[] = [
      {
        kind: 'comparator',
        id: 'points',
        label: 'Rule 1 (Points)',
        outcome: 'tied-proceed',
        values: { a: 6, b: 6, c: 6 },
      },
      {
        kind: 'comparator',
        id: 'goal-average',
        label: 'Rule 2 (Goal average)',
        outcome: 'resolved',
        values: { a: 2.5, b: 1.2, c: 1.2 },
        children: [
          {
            kind: 'comparator',
            id: 'points',
            label: 'Rule 1 (Points)',
            outcome: 'tied-proceed',
            values: { b: 6, c: 6 },
          },
          {
            kind: 'comparator',
            id: 'head-to-head',
            label: 'Rule 3 (Head to head)',
            outcome: 'resolved',
            values: { b: 1, c: 0 },
          },
        ],
      },
    ];

    expect(decidingFactorBetween(trace, 'a', 'b')).toEqual({ code: 'goal-average', rule: 2 });
    expect(decidingFactorBetween(trace, 'b', 'c')).toEqual({ code: 'head-to-head', rule: 3 });
  });

  it('returns undefined when points alone separated the pair, whether points is Rule 1 or omitted', () => {
    const { trace } = resolveTiebreak(goalAveragePipeline, ['a', 'b', 'c'], {
      a: { points: 6, 'head-to-head': 0, 'goal-average': 2.5 },
      b: { points: 6, 'head-to-head': 0, 'goal-average': 1.2 },
      c: { points: 3, 'head-to-head': 0, 'goal-average': 0.5 },
    });

    expect(decidingFactorBetween(trace, 'a', 'c')).toBeUndefined();
    expect(decidingFactorBetween(trace, 'b', 'c')).toBeUndefined();

    const traceWithoutPoints = trace.filter((node) => node.id !== 'points');
    expect(decidingFactorBetween(traceWithoutPoints, 'a', 'c')).toBeUndefined();
    expect(decidingFactorBetween(traceWithoutPoints, 'a', 'b')).toEqual({
      code: 'goal-average',
      rule: 3,
    });
  });

  it('returns undefined for identical entrants, ignores aggregation nodes, and falls back to comparator sibling index', () => {
    expect(decidingFactorBetween([], 'a', 'a')).toBeUndefined();

    const trace: TraceNode[] = [
      {
        kind: 'aggregation',
        id: 'series-points',
        label: 'Series points',
        outcome: 'resolved',
        values: { a: 3, b: 1 },
      },
      {
        kind: 'comparator',
        id: 'points',
        label: 'Points',
        outcome: 'tied-proceed',
        values: { a: 6, b: 6 },
      },
      {
        kind: 'comparator',
        id: 'goal-average',
        label: 'Goal average',
        outcome: 'resolved',
        values: { a: 2, b: 1 },
      },
    ];

    expect(decidingFactorBetween(trace, 'a', 'b')).toEqual({ code: 'goal-average', rule: 2 });
  });
});
