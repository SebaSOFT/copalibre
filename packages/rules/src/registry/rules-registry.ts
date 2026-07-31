import {
  Neuron,
  type ActionConstructor,
  type ConditionConstructor,
  type ParameterConstructor,
  type RuleConstructor,
  type ScriptInterface,
} from '@sebasoft/neuron-js';
import { err, ok, type DisciplineDescriptor, type Result } from '@copalibre/domain';
import { ScriptValidationError, UnregisteredElementError } from '../errors.js';
import { expressionOf, splitTemplate, validateExpression } from '../expressions/expression.js';

/**
 * The typed registry of permitted rule vocabulary. A DisciplineDescriptor (a
 * versioned JSON document, potentially operator-authored) may reference these
 * elements by stable identifier only — it can never inject executable code.
 * This registry is the enforcement point (tournament-engine decision record,
 * "Neuron-JS decision layer": "The application owns a typed registry of
 * permitted Neuron-JS actions, conditions, parameters, and schemas").
 */

export type ElementKind = 'parameter' | 'condition' | 'action' | 'rule' | 'notification-capability';

export interface RegistryEntry {
  readonly kind: ElementKind;
  readonly type: string;
  readonly description: string;
}

/** Neuron's documented built-ins, permitted out of the box. */
const BUILTIN_ENTRIES: readonly RegistryEntry[] = [
  { kind: 'rule', type: 'simple_rule', description: 'Neuron-JS built-in rule' },
  {
    kind: 'condition',
    type: 'compare_two_numbers',
    description: 'Neuron-JS built-in numeric comparison',
  },
  { kind: 'action', type: 'add_two_numbers', description: 'Neuron-JS built-in addition' },
  { kind: 'parameter', type: 'simple_number', description: 'Neuron-JS built-in literal number' },
  { kind: 'parameter', type: 'simple_string', description: 'Neuron-JS built-in literal string' },
  { kind: 'parameter', type: 'simple_select', description: 'Neuron-JS built-in select' },
  { kind: 'parameter', type: 'comparator', description: 'Neuron-JS built-in comparator' },
];

/** CopaLibre rule documents are plain Neuron-JS scripts (serializable JSON). */
export type RuleScript = ScriptInterface;

/** Minimal structural view used for registry reference-walking. */
interface ScriptElementRef {
  readonly type?: string;
  readonly params?: readonly { readonly type?: string; readonly options?: unknown }[];
}
interface RuleScriptView {
  readonly id: string;
  readonly rules: readonly (ScriptElementRef & {
    readonly conditions?: readonly ScriptElementRef[];
    readonly actions?: readonly ScriptElementRef[];
  })[];
}

export class RulesRegistry {
  private readonly neuron = new Neuron();
  private readonly entries = new Map<string, RegistryEntry>();

  constructor() {
    for (const entry of BUILTIN_ENTRIES) {
      this.entries.set(keyOf(entry.kind, entry.type), entry);
    }
  }

  registerParameter(type: string, ctor: ParameterConstructor, description: string): void {
    this.neuron.registerParameter(type, ctor);
    this.entries.set(keyOf('parameter', type), { kind: 'parameter', type, description });
  }

  registerCondition(type: string, ctor: ConditionConstructor, description: string): void {
    this.neuron.registerCondition(type, ctor);
    this.entries.set(keyOf('condition', type), { kind: 'condition', type, description });
  }

  registerAction(type: string, ctor: ActionConstructor, description: string): void {
    this.neuron.registerAction(type, ctor);
    this.entries.set(keyOf('action', type), { kind: 'action', type, description });
  }

  registerRule(type: string, ctor: RuleConstructor, description: string): void {
    this.neuron.registerRule(type, ctor);
    this.entries.set(keyOf('rule', type), { kind: 'rule', type, description });
  }

  /** Capabilities a DisciplineDescriptor may list in notificationRuleCapabilities. */
  registerNotificationCapability(type: string, description: string): void {
    this.entries.set(keyOf('notification-capability', type), {
      kind: 'notification-capability',
      type,
      description,
    });
  }

  has(kind: ElementKind, type: string): boolean {
    return this.entries.has(keyOf(kind, type));
  }

  list(): readonly RegistryEntry[] {
    return [...this.entries.values()];
  }

  /** The Neuron instance carrying exactly this registry's vocabulary. */
  getNeuron(): Neuron {
    return this.neuron;
  }

  /**
   * Rejects any script referencing an element type outside this registry, or
   * carrying an expression that reaches beyond reading, arithmetic and the
   * registered functions — run before every evaluation and whenever a
   * descriptor/rule document is saved.
   *
   * An expression is refused *here*, at the same moment as an unregistered
   * action, because both are the same question: what a module composes must be
   * vetted at installation rather than discovered at match time.
   */
  validateScriptReferences(
    script: RuleScriptView,
  ): Result<true, UnregisteredElementError | ScriptValidationError> {
    // Defensive: operator-authored JSON may be malformed; structural validity
    // is Neuron-JS validateScript's job, reference vetting is ours.
    for (const rule of Array.isArray(script.rules) ? script.rules : []) {
      const offender =
        this.check('rule', rule.type) ??
        this.checkAll('condition', rule.conditions) ??
        this.checkAll('action', rule.actions);
      if (offender) return err(offender);
    }
    return ok(true);
  }

  /**
   * Rejects a DisciplineDescriptor referencing an unregistered notification
   * capability or win-condition action. Phase 0002's descriptor validation
   * calls into this; since 0009 the win condition is a script, so a module
   * that invents an action is refused here rather than failing at match time.
   */
  validateDescriptorReferences(
    descriptor: DisciplineDescriptor,
  ): Result<true, UnregisteredElementError> {
    for (const capability of descriptor.notificationRuleCapabilities) {
      if (!this.has('notification-capability', capability)) {
        return err(
          new UnregisteredElementError(
            `Descriptor "${descriptor.name}" references unregistered notification capability "${capability}"`,
            { descriptorId: descriptor.descriptorId, capability },
          ),
        );
      }
    }

    // A missing or malformed win condition is the descriptor schema's business
    // (@copalibre/domain); this pass only vets the vocabulary it references.
    const winCondition = this.validateScriptReferences(
      (descriptor.winCondition ?? { id: '', rules: [] }) as unknown as RuleScriptView,
    );
    if (!winCondition.ok) {
      return err(
        new UnregisteredElementError(
          `Descriptor "${descriptor.name}" win condition ${lowerFirst(winCondition.error.message)}. ` +
            'The rule vocabulary is core-owned: a new action requires a core release.',
          { ...winCondition.error.details, descriptorId: descriptor.descriptorId },
        ),
      );
    }
    return ok(true);
  }

  private check(kind: ElementKind, type?: string): UnregisteredElementError | undefined {
    if (type === undefined || this.has(kind, type)) return undefined;
    return new UnregisteredElementError(`Script references unregistered ${kind} "${type}"`, {
      kind,
      type,
    });
  }

  private checkAll(
    kind: 'condition' | 'action',
    elements?: readonly ScriptElementRef[],
  ): UnregisteredElementError | ScriptValidationError | undefined {
    for (const element of elements ?? []) {
      const offender =
        this.check(kind, element.type) ??
        element.params
          ?.map((param) => this.check('parameter', param.type) ?? checkExpression(param.options))
          .find((error) => error !== undefined);
      if (offender) return offender;
    }
    return undefined;
  }
}

function keyOf(kind: ElementKind, type: string): string {
  return `${kind}:${type}`;
}

/**
 * Vets every `{{ }}` an expression-mode parameter declares. Each segment is
 * parsed and walked on its own, so an error names the offending expression
 * rather than the whole field.
 */
function checkExpression(options: unknown): ScriptValidationError | undefined {
  const source = expressionOf(options);
  if (source === undefined) return undefined;

  for (const segment of splitTemplate(source)) {
    if (segment.kind !== 'expression') continue;
    const validation = validateExpression(segment.source);
    if (!validation.ok) return validation.error;
  }
  return undefined;
}

function lowerFirst(message: string): string {
  return message.charAt(0).toLowerCase() + message.slice(1);
}
