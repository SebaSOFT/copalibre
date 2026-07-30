import {
  AbstractAction,
  AbstractParameter,
  ExecutionResult,
  MessageType,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import type { RulesRegistry } from '../registry/rules-registry.js';

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
 * A state-reading parameter's dot-path lives in `options.path`, never in
 * `value`.
 *
 * `ParameterInterface<TValue>` ties the stored `value` and the produced
 * `getValue()` to one generic, so a parameter that stores a path string but
 * produces a number cannot express itself through `value` — subclassing as
 * `AbstractParameter<number>` type-checks while silently breaking, because
 * `this.value` narrows to `number | null` and the path lookup becomes dead
 * code. Keeping the path in `options` sidesteps that entirely and is the better
 * authoring contract anyway: in operator-authored rule JSON, `value` always
 * means "a literal" and `options.path` always means "read this from state",
 * instead of `value` meaning two different things depending on the type.
 *
 * The base class then supplies `execute` (neuron-js 0.6.1) and `toJSON`, and
 * because `toJSON` serializes `options`, the path stays visible in the
 * explanation trace — which the audit surfaces need.
 */
function readPathOption(options: unknown): string | undefined {
  if (typeof options !== 'object' || options === null) return undefined;
  const path = (options as Record<string, unknown>).path;
  return typeof path === 'string' ? path : undefined;
}

/** Reads a number from the evaluation state at `options.path`. */
export class StateNumberParameter extends AbstractParameter<number> {
  static readonly TYPE = 'state-number';

  getValue(context: ExecutionContext): number | null {
    const path = readPathOption(this.options);
    const value = path === undefined ? undefined : readStatePath(context, path);
    return typeof value === 'number' ? value : (this.defaultValue ?? null);
  }
}

/** Reads a string from the evaluation state at `options.path`. */
export class StateStringParameter extends AbstractParameter<string> {
  static readonly TYPE = 'state-string';

  getValue(context: ExecutionContext): string | null {
    const path = readPathOption(this.options);
    const value = path === undefined ? undefined : readStatePath(context, path);
    return typeof value === 'string' ? value : (this.defaultValue ?? null);
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
    'Numeric fact read from evaluation state at options.path (dot-path)',
  );
  registry.registerParameter(
    StateStringParameter.TYPE,
    StateStringParameter,
    'String fact read from evaluation state at options.path (dot-path)',
  );
  registry.registerAction(
    SetGuardOutcomeAction.TYPE,
    SetGuardOutcomeAction,
    'Writes the pass/fail guard outcome with a human-readable reason',
  );
  return registry;
}
