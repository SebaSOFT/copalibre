import {
  explainExecution,
  Synapse,
  validateExecutionContext,
  validateScript,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import { err, ok, type Result } from '@copalibre/domain';
import { GuardEvaluationError, ScriptValidationError } from '../errors';
import type { RulesRegistry, RuleScript } from '../registry/rules-registry';
import type { EvaluationRecord, TraceNode } from '../trace/explanation-trace';
import type { GuardState } from './vocabulary';

/**
 * Shared evaluation harness for eligibility and advancement guards, following
 * the documented Neuron-JS workflow: validate script, validate context,
 * execute against the registry's Neuron, explain, normalize. Default-deny:
 * a guard passes only when a fired rule explicitly granted it.
 */

export interface GuardDecision {
  readonly passed: boolean;
  readonly reason: string;
  readonly record: EvaluationRecord<GuardState>;
}

export interface GuardInput {
  readonly script: RuleScript;
  readonly ruleVersion: { readonly id: string; readonly version: number };
  /** Structured facts placed under context.state (participant, roster, events…). */
  readonly facts: Readonly<Record<string, unknown>>;
}

export function evaluateGuard(
  registry: RulesRegistry,
  input: GuardInput,
): Result<GuardDecision, ScriptValidationError | GuardEvaluationError> {
  const references = registry.validateScriptReferences(input.script);
  if (!references.ok) {
    return err(new ScriptValidationError(references.error.message, references.error.details));
  }

  const scriptValidation = validateScript(input.script);
  if (!scriptValidation.ok) {
    return err(
      new ScriptValidationError('Guard script failed Neuron-JS validation', {
        errors: scriptValidation.errors,
      }),
    );
  }

  const defaultDeny: GuardState = { outcome: 'fail', reason: 'no-rule-granted' };
  const context: ExecutionContext = {
    messages: [],
    state: { ...structuredClone(input.facts), guard: defaultDeny },
  };

  const contextValidation = validateExecutionContext(context);
  if (!contextValidation.ok) {
    return err(
      new GuardEvaluationError('Guard evaluation context failed validation', {
        errors: contextValidation.errors,
      }),
    );
  }

  const result = new Synapse(registry.getNeuron()).execute(input.script, context);
  if (!result.isSuccessful()) {
    return err(
      new GuardEvaluationError('Guard script execution failed', {
        messages: result.context.messages.map((message) => message.text),
      }),
    );
  }

  const guard = (result.context.state as { guard?: GuardState }).guard ?? defaultDeny;
  const explanation = explainExecution({ script: input.script, result });

  const trace: TraceNode[] = [
    {
      kind: 'guard',
      id: input.script.id,
      label: `Guard ${input.script.id}`,
      outcome: guard.outcome,
      values: { reason: guard.reason, grantedBy: guard.grantedBy ?? null },
      detail:
        guard.outcome === 'pass'
          ? `Granted by rule action "${guard.grantedBy ?? 'unknown'}": ${guard.reason}`
          : `Denied: ${guard.reason}`,
      children: [
        {
          kind: 'rule',
          id: `${input.script.id}-execution`,
          label: 'Neuron-JS execution explanation',
          outcome: 'explained',
          values: { explanation: explanation as unknown },
        },
      ],
    },
  ];

  return ok({
    passed: guard.outcome === 'pass',
    reason: guard.reason,
    record: {
      engine: 'copalibre-rules',
      ruleVersion: input.ruleVersion,
      inputFacts: input.facts,
      output: guard,
      trace,
    },
  });
}
