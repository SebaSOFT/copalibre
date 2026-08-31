import type { TraceNode } from './explanation-trace.js';

/**
 * The one place a trace becomes text.
 *
 * The Standings screen promises an operator that what they read is what the
 * engine decided. If the screen formats comparator values into sentences of its
 * own, that promise holds only until somebody edits one of the two formatters —
 * and nothing fails when they do. So the text is produced here, beside the
 * contract it explains, and the screen renders these strings verbatim.
 *
 * Deterministic for identical input, like the trace itself: no locale
 * formatting, no timestamps, no `Intl`. A trace archived today and re-rendered
 * next year must read the same, on any machine.
 */

export interface TraceRenderOptions {
  /** Prefix repeated once per nesting level. */
  readonly indent?: string;
}

const DEFAULT_INDENT = '  ';

/**
 * A trace as depth-indented lines, parents before children.
 *
 * One line per node rather than a paragraph: an operator disputing a placement
 * is looking for the rule that decided it, and a line they can point at is the
 * whole affordance.
 */
export function traceLines(
  nodes: readonly TraceNode[],
  options: TraceRenderOptions = {},
): readonly string[] {
  const indent = options.indent ?? DEFAULT_INDENT;
  const lines: string[] = [];
  collect(nodes, 0, indent, lines);
  return lines;
}

function collect(
  nodes: readonly TraceNode[],
  depth: number,
  indent: string,
  lines: string[],
): void {
  for (const node of nodes) {
    lines.push(indent.repeat(depth) + lineOf(node));
    if (node.children) collect(node.children, depth + 1, indent, lines);
  }
}

/**
 * One node as a line: `label: values → outcome`.
 *
 * The values are in the line rather than in a tooltip because they are the
 * argument. "Rule 2 resolved the tie" is an assertion; "Rule 2 (Score
 * difference): a=+28, b=+24 → Score difference resolved the tie" is a
 * demonstration, and an operator can check it against their own notes.
 */
export function lineOf(node: TraceNode): string {
  const outcome = node.detail ?? node.outcome;
  const values = valuesOf(node);
  return values === '' ? `${node.label} → ${outcome}` : `${node.label}: ${values} → ${outcome}`;
}

function valuesOf(node: TraceNode): string {
  if (node.values === undefined) return '';
  return Object.entries(node.values)
    .map(([key, value]) => `${key}=${valueText(value)}`)
    .join(', ');
}

/**
 * A value as it reads on the line.
 *
 * `null` prints as an em dash rather than the word "null": a comparator that
 * observed nothing for an entrant is telling the operator the value is absent,
 * which is a fact about the record and not a fact about JavaScript.
 */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * The part of a standings trace that concerns one entrant.
 *
 * A comparator records the values it observed per entrant, so membership of
 * `values` is the engine's own statement that the entrant was still tied when
 * that comparator ran — no re-derivation from the ranking.
 *
 * The **first** comparator observes everybody, because everybody starts in one
 * undifferentiated group; being separated by it is being ranked, not being
 * tie-broken. So an entrant only has a *comparator* trace worth expanding once
 * a *second* comparator had to look at it, which is exactly the case the
 * screen calls a resolved tie. An `aggregation` node is a different kind of
 * fact — what decided the row's own result, under series-grain accounting —
 * and is never a screening step every entrant passes through by default, so
 * it always surfaces when present, with no tie-count threshold to clear.
 */
export function traceForEntrant(
  trace: readonly TraceNode[],
  entrantId: string,
  options: { readonly stillTied?: boolean } = {},
): readonly TraceNode[] {
  const concernsEntrant = (node: TraceNode): boolean =>
    node.values !== undefined && Object.hasOwn(node.values, entrantId);

  const aggregation = trace.filter((node) => node.kind === 'aggregation' && concernsEntrant(node));

  const observed = trace.filter((node) => node.kind === 'comparator' && concernsEntrant(node));
  if (observed.length < 2) return aggregation;

  // The exhaustion notice belongs to the entrants it still applies to. Shown on
  // a row the pipeline did separate, it would say the opposite of what happened.
  if (options.stillTied !== true) return [...aggregation, ...observed];
  const exhausted = trace.filter((node) => node.kind === 'comparator' && node.values === undefined);
  return [...aggregation, ...observed, ...exhausted];
}

/** Whether a row has a tiebreak trace to expand at all. */
export function hasTraceFor(trace: readonly TraceNode[], entrantId: string): boolean {
  return traceForEntrant(trace, entrantId).length > 0;
}

/**
 * The one comparator that actually separated this entrant from a tied group,
 * named for a spectator-facing summary that isn't the full trace.
 *
 * The pipeline stops examining an entrant once a comparator has split it out
 * (`resolveTiebreak` only keeps evaluating still-tied groups), so the last
 * `comparator`-kind node whose own `outcome` shows it discriminated something
 * (`'resolved'` or `'partially-resolved'`, never `'tied-proceed'` or the
 * `'unresolved-tie'` exhaustion notice) is the one whose split actually
 * decided this entrant — an earlier node only re-confirmed the tie persisted.
 * `undefined` when the entrant never needed a second comparator at all (the
 * ordinary case: the first comparator already ranked everyone) or when every
 * comparator that looked at it left it tied (the pipeline exhausted without
 * resolving it).
 */
export function decidingFactorLabel(
  trace: readonly TraceNode[],
  entrantId: string,
): string | undefined {
  const decisive = traceForEntrant(trace, entrantId).filter(
    (node) =>
      node.kind === 'comparator' &&
      (node.outcome === 'resolved' || node.outcome === 'partially-resolved'),
  );
  return decisive.at(-1)?.label;
}
