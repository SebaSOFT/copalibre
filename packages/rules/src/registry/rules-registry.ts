import {
  Neuron,
  validateScript,
  type ActionConstructor,
  type ConditionConstructor,
  type ParameterConstructor,
  type RuleConstructor,
  type ScriptInterface,
} from '@sebasoft/neuron-js';
import { Ajv, type AnySchema, type ValidateFunction } from 'ajv';
import { err, ok, type DisciplineDescriptor, type Result } from '@copalibre/domain';
import { ScriptValidationError, UnregisteredElementError } from '../errors.js';
import { validateParameterDeclaration } from '../expressions/expression.js';

/**
 * The typed registry of permitted rule vocabulary. A DisciplineDescriptor (a
 * versioned JSON document, potentially operator-authored) may reference these
 * elements by stable identifier only — it can never inject executable code.
 * This registry is the enforcement point (tournament-engine decision record,
 * "Neuron-JS decision layer": "The application owns a typed registry of
 * permitted Neuron-JS actions, conditions, parameters, and schemas").
 */

export type ElementKind = 'parameter' | 'condition' | 'action' | 'rule' | 'notification-capability';

export interface RegistryParameterDefinition {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly parameterTypes: readonly string[];
  readonly allowExpression: boolean;
  readonly valueSchema: Readonly<Record<string, unknown>>;
}

export interface RegistryAuthoringDefinition {
  readonly parameters?: readonly RegistryParameterDefinition[];
  readonly optionsSchema?: Readonly<Record<string, unknown>>;
  readonly valueSchema?: Readonly<Record<string, unknown>>;
  readonly allowExpression?: boolean;
}

export interface RegistryEntry {
  readonly kind: ElementKind;
  readonly type: string;
  readonly description: string;
  readonly authoring?: RegistryAuthoringDefinition;
}

/** Neuron's documented built-ins, permitted out of the box. */
const BUILTIN_ENTRIES: readonly RegistryEntry[] = [
  {
    kind: 'rule',
    type: 'simple_rule',
    description: 'Neuron-JS built-in rule',
    authoring: { parameters: [] },
  },
  {
    kind: 'condition',
    type: 'compare_two_numbers',
    description: 'Neuron-JS built-in numeric comparison',
    authoring: {
      parameters: [
        parameter('op1', 'Left numeric operand', 'simple_number'),
        parameter('comp', 'Comparison operator', 'comparator', {
          enum: ['==', '!=', '<', '<=', '>', '>='],
        }),
        parameter('op2', 'Right numeric operand', 'simple_number'),
      ],
    },
  },
  { kind: 'action', type: 'add_two_numbers', description: 'Neuron-JS built-in addition' },
  {
    kind: 'parameter',
    type: 'simple_number',
    description: 'Neuron-JS built-in literal number',
    authoring: { valueSchema: { type: 'number' }, allowExpression: false },
  },
  {
    kind: 'parameter',
    type: 'simple_string',
    description: 'Neuron-JS built-in literal string',
    authoring: { valueSchema: { type: 'string' }, allowExpression: false },
  },
  {
    kind: 'parameter',
    type: 'simple_select',
    description: 'Neuron-JS built-in select',
    authoring: { valueSchema: {}, allowExpression: false },
  },
  {
    kind: 'parameter',
    type: 'comparator',
    description: 'Neuron-JS built-in comparator',
    authoring: {
      valueSchema: { enum: ['==', '!=', '<', '<=', '>', '>='] },
      allowExpression: false,
    },
  },
];

/** CopaLibre rule documents are plain Neuron-JS scripts (serializable JSON). */
export type RuleScript = ScriptInterface;

/** Minimal structural view used for registry reference-walking. */
interface ScriptElementRef {
  readonly type?: string;
  readonly options?: unknown;
  readonly params?: readonly {
    readonly type?: string;
    readonly name?: string;
    readonly value?: unknown;
    readonly options?: unknown;
  }[];
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
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly enforceAuthoringDefinitions: boolean;

  constructor(
    options: {
      readonly includeBuiltinActions?: boolean;
      readonly enforceAuthoringDefinitions?: boolean;
    } = {},
  ) {
    this.enforceAuthoringDefinitions = options.enforceAuthoringDefinitions ?? false;
    for (const entry of BUILTIN_ENTRIES) {
      if (entry.kind === 'action' && options.includeBuiltinActions === false) continue;
      this.entries.set(keyOf(entry.kind, entry.type), entry);
    }
  }

  registerParameter(
    type: string,
    ctor: ParameterConstructor,
    description: string,
    authoring?: RegistryAuthoringDefinition,
  ): void {
    this.neuron.registerParameter(type, ctor);
    this.entries.set(keyOf('parameter', type), {
      kind: 'parameter',
      type,
      description,
      ...(authoring ? { authoring } : {}),
    });
  }

  registerCondition(
    type: string,
    ctor: ConditionConstructor,
    description: string,
    authoring?: RegistryAuthoringDefinition,
  ): void {
    this.neuron.registerCondition(type, ctor);
    this.entries.set(keyOf('condition', type), {
      kind: 'condition',
      type,
      description,
      ...(authoring ? { authoring } : {}),
    });
  }

  registerAction(
    type: string,
    ctor: ActionConstructor,
    description: string,
    authoring?: RegistryAuthoringDefinition,
  ): void {
    this.neuron.registerAction(type, ctor);
    this.entries.set(keyOf('action', type), {
      kind: 'action',
      type,
      description,
      ...(authoring ? { authoring } : {}),
    });
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

  /** Full save-time validation: structural Neuron document plus vetted references and schemas. */
  validateScriptDocument(
    script: RuleScript,
  ): Result<true, UnregisteredElementError | ScriptValidationError> {
    const references = this.validateScriptReferences(script as unknown as RuleScriptView);
    if (!references.ok) return references;
    const structural = validateScript(script);
    return structural.ok
      ? ok(true)
      : err(
          new ScriptValidationError('Rule script failed Neuron-JS validation', {
            errors: structural.errors,
          }),
        );
  }

  /**
   * Rejects a DisciplineDescriptor referencing an unregistered notification
   * capability or win-condition action. Descriptor validation
   * calls into this; the win condition is a script, so a module
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
        this.checkElementOptions(kind, element) ??
        this.checkElementParameters(kind, element) ??
        element.params
          ?.map((param) => this.check('parameter', param.type) ?? checkExpression(param))
          .find((error) => error !== undefined);
      if (offender) return offender;
    }
    return undefined;
  }

  private checkElementParameters(
    kind: 'condition' | 'action',
    element: ScriptElementRef,
  ): ScriptValidationError | undefined {
    if (!this.enforceAuthoringDefinitions || element.type === undefined) return undefined;
    const definitions = this.entries.get(keyOf(kind, element.type))?.authoring?.parameters;
    if (!definitions) return undefined;
    const params = element.params ?? [];
    const names = new Set<string>();
    for (const param of params) {
      const name = param.name ?? '';
      if (names.has(name))
        return new ScriptValidationError(
          `Script element "${element.type}" repeats parameter "${name}"`,
        );
      names.add(name);
      const definition = definitions.find((candidate) => candidate.name === name);
      if (!definition)
        return new ScriptValidationError(
          `Script element "${element.type}" has unknown parameter "${name}"`,
        );
      if (param.type === undefined || !definition.parameterTypes.includes(param.type)) {
        return new ScriptValidationError(
          `Script element "${element.type}" parameter "${name}" requires one of: ${definition.parameterTypes.join(', ')}`,
        );
      }
      const expression = isExpressionOption(param.options);
      if (expression && !definition.allowExpression) {
        return new ScriptValidationError(
          `Script element "${element.type}" parameter "${name}" does not allow expressions`,
        );
      }
      if (!expression) {
        const validator = this.validatorFor(kind, element.type, definition);
        if (!validator(param.value)) {
          return new ScriptValidationError(
            `Script element "${element.type}" parameter "${name}" has an invalid value: ${this.ajv.errorsText(validator.errors)}`,
          );
        }
      }
    }
    const missing = definitions.find(
      (definition) => definition.required && !names.has(definition.name),
    );
    return missing
      ? new ScriptValidationError(
          `Script element "${element.type}" requires parameter "${missing.name}"`,
        )
      : undefined;
  }

  private checkElementOptions(
    kind: 'condition' | 'action',
    element: ScriptElementRef,
  ): ScriptValidationError | undefined {
    if (!this.enforceAuthoringDefinitions || element.type === undefined) return undefined;
    const schema = this.entries.get(keyOf(kind, element.type))?.authoring?.optionsSchema;
    if (!schema) return undefined;
    const key = `${kind}:${element.type}:options`;
    const validator = this.validators.get(key) ?? this.compileValidator(key, schema);
    return validator(element.options ?? {})
      ? undefined
      : new ScriptValidationError(
          `Script element "${element.type}" has invalid options: ${this.ajv.errorsText(validator.errors)}`,
        );
  }

  private validatorFor(
    kind: 'condition' | 'action',
    type: string,
    definition: RegistryParameterDefinition,
  ): ValidateFunction {
    const key = `${kind}:${type}:${definition.name}`;
    const existing = this.validators.get(key);
    if (existing) return existing;
    return this.compileValidator(key, definition.valueSchema);
  }

  private compileValidator(
    key: string,
    schema: Readonly<Record<string, unknown>>,
  ): ValidateFunction {
    const validator = this.ajv.compile(schema as AnySchema);
    this.validators.set(key, validator);
    return validator;
  }
}

export function parameter(
  name: string,
  description: string,
  parameterType: string,
  valueSchema: Readonly<Record<string, unknown>> = {},
  options: { readonly required?: boolean; readonly allowExpression?: boolean } = {},
): RegistryParameterDefinition {
  return {
    name,
    description,
    required: options.required ?? true,
    parameterTypes: [parameterType],
    allowExpression: options.allowExpression ?? false,
    valueSchema,
  };
}

function isExpressionOption(options: unknown): boolean {
  return (
    typeof options === 'object' &&
    options !== null &&
    (options as { expression?: unknown }).expression === true
  );
}

function keyOf(kind: ElementKind, type: string): string {
  return `${kind}:${type}`;
}

/** Vets a parameter's mode and, in expression mode, every `{{ }}` it declares. */
function checkExpression(parameter: {
  readonly name?: string;
  readonly value?: unknown;
  readonly options?: unknown;
}): ScriptValidationError | undefined {
  const validation = validateParameterDeclaration(
    parameter.name ?? 'unnamed',
    parameter.value,
    parameter.options,
  );
  return validation.ok ? undefined : validation.error;
}

function lowerFirst(message: string): string {
  return message.charAt(0).toLowerCase() + message.slice(1);
}
