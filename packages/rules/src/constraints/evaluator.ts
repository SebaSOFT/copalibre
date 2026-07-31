import {
  Synapse,
  validateExecutionContext,
  validateScript,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import { err, ok, type Result } from '@copalibre/domain';
import { GuardEvaluationError, ScriptValidationError } from '../errors.js';
import type { RulesRegistry, RuleScript } from '../registry/rules-registry.js';
import type { EvaluationRecord, TraceNode } from '../trace/explanation-trace.js';
import { EMPTY_CONSTRAINT_STATE, type ConstraintFinding, type ConstraintState } from './actions.js';

/**
 * Evaluates a scripted draw constraint through the phase-3 Neuron-JS adapter,
 * exactly as guards and win conditions are evaluated: vet references against
 * the registry, validate script and context, execute, normalize into the
 * explanation-trace contract.
 *
 * Unlike a guard, the polarity is default-permit: a script that says nothing
 * has not forbidden the draw. A guard decides who may enter; a constraint
 * decides what a draw may not look like, and silence is not an objection.
 */

export interface ScriptedConstraintDecision {
  readonly satisfied: boolean;
  readonly findings: readonly ConstraintFinding[];
  readonly record: EvaluationRecord<{ readonly satisfied: boolean }>;
}

export interface ScriptedConstraintInput {
  readonly script: RuleScript;
  readonly ruleVersion: { readonly id: string; readonly version: number };
  /**
   * The proposed assignment as facts: entrants, their attributes, and where
   * this draw would put them. Placed under `state.draw`.
   */
  readonly facts: Readonly<Record<string, unknown>>;
}

export function evaluateScriptedConstraint(
  registry: RulesRegistry,
  input: ScriptedConstraintInput,
): Result<ScriptedConstraintDecision, ScriptValidationError | GuardEvaluationError> {
  const references = registry.validateScriptReferences(input.script);
  if (!references.ok) {
    return err(new ScriptValidationError(references.error.message, references.error.details));
  }

  const scriptValidation = validateScript(input.script);
  if (!scriptValidation.ok) {
    return err(
      new ScriptValidationError('Constraint script failed Neuron-JS validation', {
        errors: scriptValidation.errors,
      }),
    );
  }

  const context: ExecutionContext = {
    messages: [],
    state: { draw: structuredClone(input.facts), constraint: EMPTY_CONSTRAINT_STATE },
  };

  const contextValidation = validateExecutionContext(context);
  if (!contextValidation.ok) {
    return err(
      new GuardEvaluationError('Constraint evaluation context failed validation', {
        errors: contextValidation.errors,
      }),
    );
  }

  const result = new Synapse(registry.getNeuron()).execute(input.script, context);
  if (!result.isSuccessful()) {
    return err(
      new GuardEvaluationError('Constraint script execution failed', {
        // Both logs: the runtime's own failure messages carry why an action
        // refused, while the context log carries what ran before it. An error
        // holding neither is one an operator cannot act on.
        messages: [...result.messages, ...result.context.messages.map((message) => message.text)],
      }),
    );
  }

  const state =
    (result.context.state as { constraint?: ConstraintState }).constraint ?? EMPTY_CONSTRAINT_STATE;
  const satisfied = state.findings.every((finding) => finding.satisfied);

  return ok({
    satisfied,
    findings: state.findings,
    record: {
      engine: 'copalibre-rules',
      ruleVersion: input.ruleVersion,
      inputFacts: input.facts,
      output: { satisfied },
      trace: traceOf(input.script.id, satisfied, state.findings),
    },
  });
}

function traceOf(
  scriptId: string,
  satisfied: boolean,
  findings: readonly ConstraintFinding[],
): readonly TraceNode[] {
  return [
    {
      kind: 'condition',
      id: scriptId,
      label: `Draw constraint ${scriptId}`,
      outcome: satisfied ? 'satisfied' : 'violated',
      values: { findings: findings.length },
      detail: satisfied
        ? 'The proposed draw does not break this constraint'
        : 'The proposed draw breaks this constraint',
      children: findings.map((finding, index) => ({
        kind: 'condition',
        id: `${scriptId}-finding-${index + 1}`,
        label: finding.satisfied ? 'Satisfied' : 'Violated',
        outcome: finding.satisfied ? 'satisfied' : 'violated',
        values: { entrantIds: [...finding.entrantIds] },
        detail: finding.reason,
      })),
    },
  ];
}
