import { describe, expect, it } from '@jest/globals';
import { resolveTiebreak, type TiebreakPipeline } from '../tiebreak/pipeline.js';
import { decidingFactorLabel, hasTraceFor, lineOf, traceForEntrant, traceLines } from './render.js';
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
