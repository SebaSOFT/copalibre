import {
  Synapse,
  validateExecutionContext,
  validateScript,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import { err, ok, type RecordedEvent, type Result } from '@copalibre/domain';
import { GuardEvaluationError, ScriptValidationError } from '../errors.js';
import type { RulesRegistry, RuleScript } from '../registry/rules-registry.js';
import type { EvaluationRecord, TraceNode } from '../trace/explanation-trace.js';
import { EMPTY_WIN_CONDITION_STATE, type WinConditionState } from './actions.js';
import type {
  MatchProgress,
  SegmentOutcome,
  SegmentThresholdEvent,
  SegmentThresholdKind,
} from './types.js';

/**
 * Evaluates a discipline's win condition through the phase-3 Neuron-JS adapter,
 * exactly as guards are evaluated: vet references against the registry,
 * validate the script, validate the context, execute, then normalize into the
 * explanation-trace contract the standings and console screens already render.
 *
 * The result is deterministic for identical progress — no timestamps, no
 * randomness — so a golden fixture can lock the trace.
 */

export interface WinConditionDecision {
  readonly matchClosed: boolean;
  readonly winnerEntrantId?: string;
  readonly segments: readonly SegmentOutcome[];
  /** Segments won per side, keyed by segment type then entrant. */
  readonly tallies: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Deuce, set point, match point, tiebreak entered — in the order raised. */
  readonly events: readonly SegmentThresholdEvent[];
  readonly record: EvaluationRecord<WinConditionOutput>;
}

export interface WinConditionOutput {
  readonly matchClosed: boolean;
  readonly winnerEntrantId: string | null;
  readonly tallies: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/**
 * A descriptor's `winCondition` typed as an executable script. The descriptor
 * carries it as plain JSON (`Record<string, unknown>`) because a module is
 * data; this is the one place that assertion is made, after the domain schema
 * has proved the document's shape and the registry has vetted its vocabulary.
 */
export function asRuleScript(document: Readonly<Record<string, unknown>>): RuleScript {
  return document as unknown as RuleScript;
}

export interface WinConditionInput {
  readonly script: RuleScript;
  readonly ruleVersion: { readonly id: string; readonly version: number };
  readonly progress: MatchProgress;
}

export function evaluateWinCondition(
  registry: RulesRegistry,
  input: WinConditionInput,
): Result<WinConditionDecision, ScriptValidationError | GuardEvaluationError> {
  const references = registry.validateScriptReferences(input.script);
  if (!references.ok) {
    return err(new ScriptValidationError(references.error.message, references.error.details));
  }

  const scriptValidation = validateScript(input.script);
  if (!scriptValidation.ok) {
    return err(
      new ScriptValidationError('Win-condition script failed Neuron-JS validation', {
        errors: scriptValidation.errors,
      }),
    );
  }

  const context: ExecutionContext = {
    messages: [],
    state: {
      match: structuredClone(input.progress),
      winCondition: EMPTY_WIN_CONDITION_STATE,
    },
  };

  const contextValidation = validateExecutionContext(context);
  if (!contextValidation.ok) {
    return err(
      new GuardEvaluationError('Win-condition evaluation context failed validation', {
        errors: contextValidation.errors,
      }),
    );
  }

  const result = new Synapse(registry.getNeuron()).execute(input.script, context);
  if (!result.isSuccessful()) {
    return err(
      new GuardEvaluationError('Win-condition script execution failed', {
        // Both logs: the runtime's own failure messages carry why an action
        // refused, while the context log carries what ran before it. An error
        // holding neither is one an operator cannot act on.
        messages: [...result.messages, ...result.context.messages.map((message) => message.text)],
      }),
    );
  }

  const state =
    (result.context.state as { winCondition?: WinConditionState }).winCondition ??
    EMPTY_WIN_CONDITION_STATE;

  const output: WinConditionOutput = {
    matchClosed: state.matchClosed,
    winnerEntrantId: state.winnerEntrantId ?? null,
    tallies: state.tallies,
  };

  return ok({
    matchClosed: state.matchClosed,
    winnerEntrantId: state.winnerEntrantId,
    segments: state.segments,
    tallies: state.tallies,
    events: state.events,
    record: {
      engine: 'copalibre-rules',
      ruleVersion: input.ruleVersion,
      inputFacts: input.progress,
      output,
      trace: traceOf(input.script.id, state),
    },
  });
}

/**
 * The trace names which action closed what, on which values — the contract the
 * rules-engine spec states: "naming which action closed the segment or match
 * and on what values".
 */
function traceOf(scriptId: string, state: WinConditionState): readonly TraceNode[] {
  const children: TraceNode[] = state.decisions.map((decision) => ({
    kind: 'action',
    id: decision.actionId,
    label: `${decision.action} ${decision.actionId}`,
    outcome: decision.outcome,
    values: decision.values,
    detail: decision.detail,
  }));

  const thresholds: TraceNode[] = state.events.map((event, index) => ({
    kind: 'threshold',
    id: `${event.kind}-${index + 1}`,
    label: labelFor(event.kind),
    outcome: 'raised',
    values: {
      segmentType: event.segmentType,
      segmentIndex: event.segmentIndex ?? null,
      entrantId: event.entrantId ?? null,
      threshold: event.threshold,
      ...event.values,
    },
  }));

  return [
    {
      kind: 'rule',
      id: scriptId,
      label: `Win condition ${scriptId}`,
      outcome: state.matchClosed ? 'closed' : 'open',
      values: {
        winnerEntrantId: state.winnerEntrantId ?? null,
        tallies: state.tallies,
      },
      detail: state.matchClosed
        ? `Match closed${state.winnerEntrantId ? ` for ${state.winnerEntrantId}` : ' as a draw'}`
        : 'Match still open',
      children: [...children, ...thresholds],
    },
  ];
}

function labelFor(kind: SegmentThresholdKind): string {
  switch (kind) {
    case 'segment-point':
      return 'Segment point';
    case 'match-point':
      return 'Match point';
    case 'margin-required':
      return 'Margin required';
    case 'tiebreak-entered':
      return 'Tiebreak entered';
  }
}

export interface ThresholdEventOptions {
  /** Segment the events are attributed to in the log. */
  readonly segmentId: string;
  readonly occurredAt: string;
  /** Sequence the log has already assigned; the adapter continues from it. */
  readonly startingSequence?: number;
  /** Deterministic id prefix, so recomputation yields the same event ids. */
  readonly eventIdPrefix?: string;
}

/**
 * Lifts segment thresholds onto the existing recorded-event surface, so the
 * phase-3 notification rules subscribe to them with no second mechanism: match
 * point is an ordinary event with an ordinary threshold rule behind it.
 */
export function toRecordedEvents(
  events: readonly SegmentThresholdEvent[],
  options: ThresholdEventOptions,
): readonly RecordedEvent[] {
  const prefix = options.eventIdPrefix ?? 'threshold';
  const base = options.startingSequence ?? 0;
  return events.map((event, index) => ({
    eventId: `${prefix}-${index + 1}`,
    matchId: event.matchId,
    segmentId: options.segmentId,
    definitionCode: event.kind,
    occurredAt: options.occurredAt,
    sequence: base + index + 1,
    payload: {
      segmentType: event.segmentType,
      segmentIndex: event.segmentIndex ?? null,
      entrantId: event.entrantId ?? null,
      threshold: event.threshold,
      values: event.values,
    },
  }));
}
