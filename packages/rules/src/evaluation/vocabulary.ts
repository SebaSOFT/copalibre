import {
  AbstractAction,
  ExecutionResult,
  MessageType,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import type { RulesRegistry } from '../registry/rules-registry';

/**
 * CopaLibre's vetted Neuron-JS vocabulary. Discipline/rule documents may
 * reference these types by identifier; the classes themselves live here, in
 * application code — never inside a descriptor.
 */

function readStatePath(context: ExecutionContext, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, context.state);
}

/**
 * Reads a number from the evaluation state by dot-path.
 *
 * These parameter classes are standalone (not AbstractParameter subclasses,
 * mirroring the upstream eligibility example) because their `value` field is
 * the dot-path STRING while the produced value is a number/string —
 * AbstractParameter<T> conflates both under one generic. The explicit
 * `execute` satisfies neuron-js 0.5.2's IElementInstance requirement on
 * ParameterConstructor (an upstream typing wrinkle worth reporting).
 */
export class StateNumberParameter {
  static readonly TYPE = 'state-number';

  constructor(
    readonly id: string,
    readonly type: string,
    readonly name: string,
    readonly value: string | null,
    readonly options: Record<string, unknown>,
    readonly defaultValue?: number,
  ) {}

  getValue(context: ExecutionContext): number | null {
    const value = typeof this.value === 'string' ? readStatePath(context, this.value) : null;
    return typeof value === 'number' ? value : (this.defaultValue ?? null);
  }

  execute(context: ExecutionContext): ExecutionResult<number | null> {
    return new ExecutionResult(true, context, this.getValue(context));
  }
}

/** Reads a string from the evaluation state by dot-path. */
export class StateStringParameter {
  static readonly TYPE = 'state-string';

  constructor(
    readonly id: string,
    readonly type: string,
    readonly name: string,
    readonly value: string | null,
    readonly options: Record<string, unknown>,
    readonly defaultValue?: string,
  ) {}

  getValue(context: ExecutionContext): string | null {
    const value = typeof this.value === 'string' ? readStatePath(context, this.value) : null;
    return typeof value === 'string' ? value : (this.defaultValue ?? null);
  }

  execute(context: ExecutionContext): ExecutionResult<string | null> {
    return new ExecutionResult(true, context, this.getValue(context));
  }
}

export interface GuardState {
  readonly outcome: 'pass' | 'fail';
  readonly reason: string;
  readonly grantedBy?: string;
}

/**
 * Writes the guard outcome into state. Guards are default-deny: the harness
 * seeds `state.guard = { outcome: 'fail' }`, and only a fired rule can grant.
 */
export class SetGuardOutcomeAction extends AbstractAction {
  static readonly TYPE = 'set-guard-outcome';

  execute(context: ExecutionContext): ExecutionResult<string | null> {
    const outcome = this.params.get('outcome')?.getValue(context);
    const reason = this.params.get('reason')?.getValue(context);

    if ((outcome !== 'pass' && outcome !== 'fail') || typeof reason !== 'string') {
      return new ExecutionResult(false, context, null, [
        'set-guard-outcome requires outcome ("pass" | "fail") and reason parameters',
      ]);
    }

    const guard: GuardState = { outcome, reason, grantedBy: this.id };
    const nextContext: ExecutionContext = {
      ...context,
      messages: [
        ...context.messages,
        { type: MessageType.INFO, text: `Guard outcome: ${outcome} (${reason})` },
      ],
      state: { ...context.state, guard },
    };
    return new ExecutionResult(true, nextContext, outcome);
  }
}

/** Registers the CopaLibre vocabulary into a registry (idempotent per registry). */
export function registerCopalibreVocabulary(registry: RulesRegistry): RulesRegistry {
  registry.registerParameter(
    StateNumberParameter.TYPE,
    StateNumberParameter,
    'Numeric fact read from evaluation state by dot-path',
  );
  registry.registerParameter(
    StateStringParameter.TYPE,
    StateStringParameter,
    'String fact read from evaluation state by dot-path',
  );
  registry.registerAction(
    SetGuardOutcomeAction.TYPE,
    SetGuardOutcomeAction,
    'Writes the pass/fail guard outcome with a human-readable reason',
  );
  return registry;
}
