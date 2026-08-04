import type { RuleScript } from '../descriptors/discipline-descriptor.js';

/**
 * Builders for win-condition scripts over the core action registry
 * (`winSegment`, `winMatch`, `requireMargin`).
 *
 * The scripts are plain serializable data — a module is JSON, never code — but
 * hand-writing Neuron-JS parameter objects is noisy and easy to get subtly
 * wrong, so test builders compose them through these helpers. A
 * community-authored module writes the same JSON by hand or with its own tools;
 * nothing here is required to author one.
 */

interface Param {
  readonly id: string;
  readonly name: string;
  readonly type: 'simple_number' | 'simple_string';
  readonly value: number | string;
  readonly options: Record<string, never>;
}

function param(name: string, value: number | string): Param {
  return {
    id: name,
    name,
    type: typeof value === 'number' ? 'simple_number' : 'simple_string',
    value,
    options: {},
  };
}

function action(id: string, type: string, params: readonly Param[]) {
  return { id, type, options: {}, params };
}

function rule(id: string, actions: readonly ReturnType<typeof action>[]) {
  return { id, type: 'simple_rule', options: {}, conditions: [], actions };
}

export interface SegmentRuleSpec {
  /** Segment type the discipline names: `set`, `frame`, `leg`. */
  readonly segment: string;
  /** Units needed to close it. */
  readonly target: number;
  /** Minimum lead; omitted or 0 closes on the target alone. */
  readonly margin?: number;
  /** Unit count at which a tiebreak decides instead (tennis: 6-6). */
  readonly tiebreakAt?: number;
  readonly tiebreakTarget?: number;
  readonly tiebreakMargin?: number;
}

export interface MatchRuleSpec {
  /** What the match counts: a segment type (`set`) or a raw unit (`goals`). */
  readonly unit: string;
  /** Units needed. Omitted means "whoever leads at full time". */
  readonly target?: number;
  readonly margin?: number;
}

/**
 * A win condition as a script: zero or more segment levels, then the match
 * level. Actions execute in order, and `requireMargin` applies to the win
 * action that follows it in the same rule.
 */
export function winConditionScript(
  id: string,
  match: MatchRuleSpec,
  segments: readonly SegmentRuleSpec[] = [],
): RuleScript {
  const rules = segments.map((segment) => {
    const params: Param[] = [param('segment', segment.segment), param('target', segment.target)];
    if (segment.tiebreakAt !== undefined) params.push(param('tiebreakAt', segment.tiebreakAt));
    if (segment.tiebreakTarget !== undefined) {
      params.push(param('tiebreakTarget', segment.tiebreakTarget));
    }
    if (segment.tiebreakMargin !== undefined) {
      params.push(param('tiebreakMargin', segment.tiebreakMargin));
    }

    const actions = [];
    if (segment.margin) {
      actions.push(
        action(`require-${segment.segment}-margin`, 'requireMargin', [
          param('margin', segment.margin),
        ]),
      );
    }
    actions.push(action(`close-${segment.segment}`, 'winSegment', params));
    return rule(`close-${segment.segment}-rule`, actions);
  });

  const matchParams: Param[] = [param('unit', match.unit)];
  if (match.target !== undefined) matchParams.push(param('target', match.target));

  const matchActions = [];
  if (match.margin) {
    matchActions.push(
      action('require-match-margin', 'requireMargin', [param('margin', match.margin)]),
    );
  }
  matchActions.push(action('close-match', 'winMatch', matchParams));

  return { id, rules: [...rules, rule('close-match-rule', matchActions)] } as unknown as RuleScript;
}
