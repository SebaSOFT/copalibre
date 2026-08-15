import {
  AbstractAction,
  AbstractParameter,
  ExecutionResult,
  MessageType,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import type { RulesRegistry } from '../registry/rules-registry.js';
import { registerDeclaredEffectActions } from '../effects/actions.js';
import { isExpressionMode, resolveParameterExpression } from '../expressions/expression.js';
import { registerCopalibreConditions } from './conditions.js';

/**
 * CopaLibre's vetted Neuron-JS vocabulary. Discipline/rule documents may
 * reference these types by identifier; the classes themselves live here, in
 * application code — never inside a descriptor.
 */

/**
 * Two parameters, two modes.
 *
 * A field holds what the author wrote, in `value`, and `options.expression`
 * says how to read it: a literal, or an expression over the context. Flipping
 * the mode leaves the text where it is and leaves the element's `type`
 * untouched — `type` is precisely what the registry vets and what a module may
 * not invent.
 *
 * This replaced the `state-number`/`state-string` pair 0003 introduced for
 * reading a dot-path out of the evaluation state. A path read is the degenerate
 * expression — `{{ facts.rosterSize }}` says exactly what
 * `state-number{path: 'facts.rosterSize'}` said — so keeping both would mean
 * two spellings of one idea and two places to look for "where does this value
 * come from". 0003's rule that `value` means a literal is what made a second
 * parameter type necessary; with the mode declared, one field carries both and
 * the rule is no longer paying for itself.
 *
 * A whole-field expression resolves to its typed value and a mixed field to a
 * string, so a number parameter in expression mode is still a number when the
 * expression is one — and no value at all when the expression cannot answer,
 * which is what the consuming condition's missing-value behaviour is for.
 *
 * Registration is a map assignment, so these replace Neuron's built-ins for
 * this registry's Neuron and nothing else. Fixed-value behaviour is preserved
 * exactly: a script that never declares the mode cannot tell the difference.
 */
function expressionValue(
  parameter: {
    readonly name: string;
    readonly value: unknown;
    readonly options: unknown;
  },
  context: ExecutionContext,
): unknown {
  if (!isExpressionMode(parameter.options)) return undefined;
  return typeof parameter.value === 'string'
    ? resolveParameterExpression(parameter.name, parameter.value, context)
    : undefined;
}

/**
 * A literal number, or the number an expression resolves to.
 *
 * The stored value is `number | string` because in expression mode it is the
 * source text — the honest widening 0003 avoided by inventing a second type.
 * `getValue` still narrows to a number, so every caller keeps the guarantee it
 * had.
 */
export class NumberParameter extends AbstractParameter<number | string> {
  static readonly TYPE = 'simple_number';

  getValue(context: ExecutionContext): number | null {
    const computed = expressionValue(this, context);
    if (isExpressionMode(this.options)) return typeof computed === 'number' ? computed : null;

    if (this.value === null) {
      // The fallback is a number even where the stored value may be text.
      return typeof this.defaultValue === 'number' ? this.defaultValue : null;
    }
    const parsed = Number(this.value);
    return Number.isNaN(parsed) ? null : parsed;
  }
}

/** A literal string, or the text an expression resolves to. */
export class StringParameter extends AbstractParameter<string> {
  static readonly TYPE = 'simple_string';

  getValue(context: ExecutionContext): string | null {
    const computed = expressionValue(this, context);
    if (isExpressionMode(this.options)) {
      return computed === undefined ? null : String(computed);
    }

    return this.value ?? this.defaultValue ?? null;
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
  registerCopalibreConditions(registry);
  registerDeclaredEffectActions(registry);
  registry.registerParameter(
    NumberParameter.TYPE,
    NumberParameter,
    'Literal number, or the number an expression resolves to when options.expression is true',
  );
  registry.registerParameter(
    StringParameter.TYPE,
    StringParameter,
    'Literal string, or the text an expression resolves to when options.expression is true',
  );
  registry.registerAction(
    SetGuardOutcomeAction.TYPE,
    SetGuardOutcomeAction,
    'Writes the pass/fail guard outcome with a human-readable reason',
  );
  return registry;
}
