import {
  explainExecution,
  Synapse,
  validateExecutionContext,
  validateScript,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import { err, ok, type Result } from '@copalibre/domain';
import { GuardEvaluationError, ScriptValidationError } from '../errors.js';
import { expressionResolutions } from '../expressions/expression.js';
import type { RulesRegistry, RuleScript } from '../registry/rules-registry.js';
import type { EvaluationRecord, TraceNode } from '../trace/explanation-trace.js';
import type { GuardState } from './vocabulary.js';

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
  /**
   * What the guard may read, placed at the root of `context.state`
   * (participant, roster, events…). Called `context` because that is what the
   * hook surface publishes and what a script author reads — one word for one
   * thing.
   */
  readonly context: Readonly<Record<string, unknown>>;
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
    state: { ...structuredClone(input.context), guard: defaultDeny },
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
        // Both logs: the runtime's own failure messages carry why an action
        // refused, while the context log carries what ran before it. An error
        // holding neither is one an operator cannot act on.
        messages: [...result.messages, ...result.context.messages.map((message) => message.text)],
      }),
    );
  }

  const guard = (result.context.state as { guard?: GuardState }).guard ?? defaultDeny;
  const explanation = explainExecution({ script: input.script, result });
  const resolutions = expressionResolutions(result.context);

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
        // What each expression-mode parameter computed, so an auditor reading
        // "this rule fired on a margin of 3" sees the 3 without re-running it.
        ...(resolutions.length === 0
          ? []
          : [
              {
                kind: 'condition' as const,
                id: `${input.script.id}-expressions`,
                label: 'Expressions resolved during this evaluation',
                outcome: 'explained',
                values: { resolutions },
              },
            ]),
      ],
    },
  ];

  return ok({
    passed: guard.outcome === 'pass',
    reason: guard.reason,
    record: {
      engine: 'copalibre-rules',
      ruleVersion: input.ruleVersion,
      inputFacts: input.context,
      output: guard,
      trace,
    },
  });
}
