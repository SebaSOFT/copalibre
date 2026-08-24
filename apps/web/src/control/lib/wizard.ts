import type { LocalizedLabel } from '@copalibre/domain';
import { Ajv } from 'ajv';
import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import type {
  CreateTournamentRequest,
  HookScriptVocabulary,
  HookVocabularyEntry,
} from './api-client.js';

/**
 * The tournament setup wizard.
 *
 * Five steps, and a step may not be left until it is valid — a wizard that lets
 * you reach the end with an empty field is a wizard that fails on submit, after
 * the operator has forgotten which screen the field was on.
 */

export type WizardStepId = 'name' | 'discipline' | 'format' | 'rules' | 'window';

export const WIZARD_STEPS: readonly {
  readonly id: WizardStepId;
  readonly label: MessageDescriptor;
}[] = [
  { id: 'name', label: messages.wizardStepName },
  { id: 'discipline', label: messages.wizardStepDiscipline },
  { id: 'format', label: messages.wizardStepFormat },
  { id: 'rules', label: messages.wizardStepRules },
  { id: 'window', label: messages.wizardStepWindow },
];

export interface DisciplineOption {
  readonly descriptorId: string;
  readonly version: string;
  readonly name: string | LocalizedLabel;
  readonly description?: string | LocalizedLabel;
  readonly supportedFormats: readonly string[];
}

export interface ProfileStageOption {
  readonly number: number;
  readonly name: string;
  readonly format: string;
}

export interface TournamentProfileOption {
  readonly profileId: string;
  readonly alias: string;
  readonly version: string;
  readonly name: string | LocalizedLabel;
  readonly description?: string | LocalizedLabel;
  readonly stages: readonly ProfileStageOption[];
}

export interface WizardRuleDraft {
  readonly conditionType?: string;
  readonly actionType: string;
  readonly values: Readonly<Record<string, string>>;
  readonly options: Readonly<Record<string, string>>;
}

export interface WizardState {
  readonly step: WizardStepId;
  readonly alias?: string;
  readonly name?: string;
  readonly descriptorId?: string;
  readonly descriptorVersion?: string;
  readonly format?: string;
  readonly profileId?: string;
  readonly profileVersion?: string;
  readonly region?: string;
  readonly capacity?: number;
  readonly publicRegistration: boolean;
  readonly requiresCheckIn: boolean;
  readonly checkInClosesAt?: string;
  readonly customRuleEnabled: boolean;
  readonly customRuleConditionType?: string;
  readonly customRuleActionType?: string;
  readonly customRuleValues: Readonly<Record<string, string>>;
  readonly customRuleOptions: Readonly<Record<string, string>>;
  readonly customRules: readonly WizardRuleDraft[];
}

export function initialWizard(): WizardState {
  return {
    step: 'name',
    publicRegistration: false,
    requiresCheckIn: false,
    customRuleEnabled: false,
    customRuleValues: {},
    customRuleOptions: {},
    customRules: [],
  };
}

/**
 * Formats the chosen discipline declares.
 *
 * Read from the API's discipline list, never from a copy in the client: a
 * hardcoded list disagrees with the installation the day somebody adds a
 * module, and the disagreement shows up as a format that cannot be generated.
 */
export function formatsFor(
  disciplines: readonly DisciplineOption[],
  descriptorId: string | undefined,
): readonly string[] {
  return disciplines.find((one) => one.descriptorId === descriptorId)?.supportedFormats ?? [];
}

/** What is missing on this step, as message descriptors the caller formats via `useIntl()`. */
export function stepProblems(
  state: WizardState,
  disciplines: readonly DisciplineOption[],
  vocabulary?: HookScriptVocabulary,
): readonly MessageDescriptor[] {
  switch (state.step) {
    case 'name':
      return [
        ...(state.name === undefined || state.name.trim() === ''
          ? [messages.wizardProblemMissingName]
          : []),
        ...(state.alias === undefined || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(state.alias)
          ? [messages.wizardProblemAliasFormat]
          : []),
      ];
    case 'discipline':
      return state.descriptorId === undefined ? [messages.wizardProblemChooseDiscipline] : [];
    case 'format': {
      if (state.format === undefined) return [messages.wizardProblemChooseFormat];
      // Guards against a stale selection: changing the discipline after
      // choosing a format must not carry the old one through.
      return formatsFor(disciplines, state.descriptorId).includes(state.format)
        ? []
        : [messages.wizardProblemFormatNotSupported];
    }
    case 'rules': {
      if (!state.customRuleEnabled) return [];
      const hasDraft =
        state.customRuleActionType !== undefined || state.customRuleConditionType !== undefined;
      if (!hasDraft && state.customRules.length > 0) return [];
      if (state.customRuleActionType === undefined) return [messages.wizardProblemChooseAction];
      return invalidRuleDraft(currentRuleDraft(state), vocabulary) ||
        state.customRules.some((rule) => invalidRuleDraft(rule, vocabulary))
        ? [messages.wizardProblemCompleteRule]
        : [];
    }
    case 'window':
      return state.capacity !== undefined && state.capacity < 2
        ? [messages.wizardProblemMinParticipants]
        : [];
  }
}

export function canContinue(
  state: WizardState,
  disciplines: readonly DisciplineOption[],
  vocabulary?: HookScriptVocabulary,
): boolean {
  return stepProblems(state, disciplines, vocabulary).length === 0;
}

export function nextStep(state: WizardState): WizardStepId {
  const index = WIZARD_STEPS.findIndex((step) => step.id === state.step);
  return WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)]?.id ?? state.step;
}

export function previousStep(state: WizardState): WizardStepId {
  const index = WIZARD_STEPS.findIndex((step) => step.id === state.step);
  return WIZARD_STEPS[Math.max(index - 1, 0)]?.id ?? state.step;
}

export function progress(state: WizardState): number {
  const index = WIZARD_STEPS.findIndex((step) => step.id === state.step);
  return Math.round(((index + 1) / WIZARD_STEPS.length) * 100);
}

/**
 * The submission, which records the descriptor **version**.
 *
 * A ruleset that tracked "latest" would change under a tournament already being
 * played; the version chosen here is the one frozen with it.
 */
export function toCreateRequest(
  state: WizardState,
  vocabulary?: HookScriptVocabulary,
): CreateTournamentRequest {
  if (
    state.alias === undefined ||
    state.name === undefined ||
    state.descriptorId === undefined ||
    state.descriptorVersion === undefined ||
    state.format === undefined
  ) {
    throw new Error('The wizard is not complete');
  }
  return {
    alias: state.alias,
    name: state.name,
    descriptorId: state.descriptorId,
    descriptorVersion: state.descriptorVersion,
    format: state.format,
    publicRegistration: state.publicRegistration,
    requiresCheckIn: state.requiresCheckIn,
    ...(state.checkInClosesAt !== undefined && state.checkInClosesAt.trim() !== ''
      ? { checkInClosesAt: state.checkInClosesAt }
      : {}),
    ...(state.region !== undefined && state.region.trim() !== '' ? { region: state.region } : {}),
    ...(state.capacity !== undefined ? { capacity: state.capacity } : {}),
    ...(state.profileId !== undefined ? { profileId: state.profileId } : {}),
    ...(state.profileVersion !== undefined ? { profileVersion: state.profileVersion } : {}),
    customScripts: customScriptsFrom(state, vocabulary),
  };
}

export function parameterValueKey(
  kind: 'condition' | 'action',
  type: string,
  name: string,
): string {
  return `${kind}:${type}:${name}`;
}

export function elementOptionsKey(kind: 'condition' | 'action', type: string): string {
  return `${kind}:${type}:options`;
}

export function addCustomRule(state: WizardState, vocabulary?: HookScriptVocabulary): WizardState {
  const draft = currentRuleDraft(state);
  if (draft.actionType === '' || invalidRuleDraft(draft, vocabulary)) {
    throw new Error('The custom rule is not complete');
  }
  return {
    ...state,
    customRules: [...state.customRules, draft],
    customRuleConditionType: undefined,
    customRuleActionType: undefined,
    customRuleValues: {},
    customRuleOptions: {},
  };
}

export function canAddCustomRule(state: WizardState, vocabulary?: HookScriptVocabulary): boolean {
  const draft = currentRuleDraft(state);
  return draft.actionType !== '' && !invalidRuleDraft(draft, vocabulary);
}

export function removeCustomRule(state: WizardState, index: number): WizardState {
  return { ...state, customRules: state.customRules.filter((_, candidate) => candidate !== index) };
}

const schemaValidator = new Ajv({ allErrors: true, strict: false });

function invalidAuthoringInput(
  kind: 'condition' | 'action',
  entry: HookVocabularyEntry | undefined,
  draft: WizardRuleDraft,
): boolean {
  if (!entry) return false;
  const invalidParameter = (entry.authoring?.parameters ?? []).some((parameter) => {
    const raw = draft.values[parameterValueKey(kind, entry.type, parameter.name)] ?? '';
    if (raw.trim() === '') return parameter.required;
    if (parameter.allowExpression && /\{\{.+\}\}/.test(raw)) return false;
    return !schemaValidator.validate(
      parameter.valueSchema,
      valueFromSchema(raw, parameter.valueSchema),
    );
  });
  if (invalidParameter) return true;
  const optionsSchema = entry.authoring?.optionsSchema;
  if (!optionsSchema) return false;
  try {
    const options = JSON.parse(draft.options[elementOptionsKey(kind, entry.type)] ?? '{}');
    return !schemaValidator.validate(optionsSchema, options);
  } catch {
    return true;
  }
}

function currentRuleDraft(state: WizardState): WizardRuleDraft {
  return {
    ...(state.customRuleConditionType === undefined
      ? {}
      : { conditionType: state.customRuleConditionType }),
    actionType: state.customRuleActionType ?? '',
    values: state.customRuleValues,
    options: state.customRuleOptions,
  };
}

function invalidRuleDraft(
  draft: WizardRuleDraft,
  vocabulary: HookScriptVocabulary | undefined,
): boolean {
  const action = vocabulary?.entries.find(
    (entry) => entry.kind === 'action' && entry.type === draft.actionType,
  );
  const condition = vocabulary?.entries.find(
    (entry) => entry.kind === 'condition' && entry.type === draft.conditionType,
  );
  return (
    action === undefined ||
    invalidAuthoringInput('action', action, draft) ||
    invalidAuthoringInput('condition', condition, draft)
  );
}

function customScriptsFrom(
  state: WizardState,
  vocabulary: HookScriptVocabulary | undefined,
): CreateTournamentRequest['customScripts'] {
  if (!state.customRuleEnabled) return [];
  const drafts = [
    ...state.customRules,
    ...(state.customRuleActionType === undefined ? [] : [currentRuleDraft(state)]),
  ];
  if (drafts.length === 0) return [];

  return [
    {
      hook: 'event.recorded',
      script: {
        id: `${state.alias ?? 'tournament'}-event-recorded`,
        rules: drafts.map((draft, index) => {
          const action = vocabulary?.entries.find(
            (entry) => entry.kind === 'action' && entry.type === draft.actionType,
          );
          const condition = vocabulary?.entries.find(
            (entry) => entry.kind === 'condition' && entry.type === draft.conditionType,
          );
          return {
            id: `event-recorded-rule-${index + 1}`,
            type: 'simple_rule',
            options: {},
            conditions: condition ? [scriptElement('condition', condition, draft)] : [],
            actions: [scriptElement('action', action, draft)],
          };
        }),
      },
    },
  ];
}

function scriptElement(
  kind: 'condition' | 'action',
  entry: HookVocabularyEntry | undefined,
  draft: WizardRuleDraft,
): Readonly<Record<string, unknown>> {
  const type = entry?.type ?? draft.actionType;
  return {
    id: `${type}-${kind}`,
    type,
    options: optionsFrom(draft.options[elementOptionsKey(kind, type)]),
    params: (entry?.authoring?.parameters ?? []).flatMap((parameter) => {
      const raw = draft.values[parameterValueKey(kind, type, parameter.name)] ?? '';
      if (!parameter.required && raw.trim() === '') return [];
      const expression = parameter.allowExpression && /\{\{.+\}\}/.test(raw);
      return [
        {
          id: `${type}-${parameter.name}`,
          name: parameter.name,
          type: parameter.parameterTypes[0],
          value: expression ? raw : valueFromSchema(raw, parameter.valueSchema),
          options: expression ? { expression: true } : {},
        },
      ];
    }),
  };
}

function optionsFrom(raw: string | undefined): Readonly<Record<string, unknown>> {
  if (raw === undefined || raw.trim() === '') return {};
  const parsed: unknown = JSON.parse(raw);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Readonly<Record<string, unknown>>)
    : {};
}

function valueFromSchema(raw: string, schema: Readonly<Record<string, unknown>>): unknown {
  if (schema['type'] === 'number' || schema['type'] === 'integer') return Number(raw);
  if (schema['type'] === 'boolean') return raw === 'true';
  return raw;
}
