import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl, type IntlShape } from 'react-intl';
import { Button } from '../ui/atoms/button.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Textarea } from '../ui/atoms/textarea.js';
import { DecisionHint } from '../ui/atoms/decision-hint.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { Field } from '../ui/molecules/field.js';
import { VisualRuleBuilder } from '../ui/organisms/visual-rule-builder.js';
import {
  addRuleAction,
  addRuleCondition,
  addCustomRule,
  canAddRuleAction,
  canAddRuleCondition,
  canAddCustomRule,
  elementOptionsKey,
  moveRuleAction,
  parameterValueKey,
  removeCustomRule,
  removeRuleAction,
  removeRuleCondition,
  renderRulePhrase,
  type WizardState,
} from '../../lib/wizard.js';
import type { HookScriptVocabulary, HookVocabularyEntry } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';

export function RulesStep({
  actions,
  conditions,
  intl,
  patch,
  selectedAction,
  selectedCondition,
  setState,
  state,
  vocabulary,
}: {
  readonly actions: readonly HookVocabularyEntry[];
  readonly conditions: readonly HookVocabularyEntry[];
  readonly intl: IntlShape;
  readonly patch: (next: Partial<WizardState>) => void;
  readonly selectedAction: HookVocabularyEntry | undefined;
  readonly selectedCondition: HookVocabularyEntry | undefined;
  readonly setState: React.Dispatch<React.SetStateAction<WizardState>>;
  readonly state: WizardState;
  readonly vocabulary: HookScriptVocabulary;
}): React.JSX.Element {
  return (
    <Stack gap="4">
      <label
        className="cl-toggle cl-focusable"
        htmlFor="wizard-enable-custom-rule"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}
      >
        <Checkbox
          aria-label={intl.formatMessage(messages.wizardEnableCustomRule)}
          checked={state.customRuleEnabled}
          id="wizard-enable-custom-rule"
          onCheckedChange={(checked) => patch({ customRuleEnabled: checked })}
        />
        <span>
          <FormattedMessage {...messages.wizardEnableCustomRule} />
        </span>
      </label>
      {state.customRuleEnabled && (
        <>
          {state.customRules.length > 0 && (
            <ol style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
              {state.customRules.map((rule, index) => {
                const conditionPhrase =
                  rule.conditions.length === 0
                    ? intl.formatMessage(messages.wizardRuleConditionAlways)
                    : rule.conditions
                        .map((condition) => {
                          const entry = vocabulary.entries.find(
                            (candidate) =>
                              candidate.kind === 'condition' && candidate.type === condition.type,
                          );
                          return renderRulePhrase('condition', condition.type, entry, condition);
                        })
                        .join(` ${intl.formatMessage(messages.wizardRuleAnd)} `);
                const actionPhrase = rule.actions
                  .map((action) => {
                    const entry = vocabulary.entries.find(
                      (candidate) => candidate.kind === 'action' && candidate.type === action.type,
                    );
                    return renderRulePhrase('action', action.type, entry, action);
                  })
                  .join('; ');
                return (
                  <li
                    key={`rule-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--cl-space-3)',
                    }}
                  >
                    <span>
                      {index + 1}. {conditionPhrase} → {actionPhrase}
                    </span>
                    <Button
                      onClick={() => setState((current) => removeCustomRule(current, index))}
                      type="button"
                      variant="secondary"
                    >
                      <FormattedMessage {...messages.wizardRuleRemove} />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
          <VisualRuleBuilder
            given={<FormattedMessage {...messages.wizardRuleGivenEvent} />}
            givenLabel={intl.formatMessage(messages.wizardRuleGiven)}
            when={
              <Stack gap="3">
                <Field
                  id="wizard-rule-condition"
                  label={intl.formatMessage(messages.wizardRuleCondition)}
                >
                  <Select
                    aria-describedby="wizard-rule-condition-hint"
                    aria-label={intl.formatMessage(messages.wizardRuleCondition)}
                    id="wizard-rule-condition"
                    onValueChange={(val) => patch({ customRuleConditionType: val || undefined })}
                    options={[
                      {
                        value: '',
                        label: intl.formatMessage(messages.wizardRuleConditionAlways),
                      },
                      ...conditions.map((entry) => ({
                        value: entry.type,
                        label: entry.description,
                      })),
                    ]}
                    value={state.customRuleConditionType ?? ''}
                  />
                  <DecisionHint
                    id="wizard-rule-condition-hint"
                    text={selectedCondition?.description}
                  />
                </Field>
                {selectedCondition && (
                  <ElementAuthoringFields
                    entry={selectedCondition}
                    kind="condition"
                    onOptionsChange={(key, value) =>
                      patch({
                        customRuleConditionOptions: {
                          ...state.customRuleConditionOptions,
                          [key]: value,
                        },
                      })
                    }
                    onValueChange={(key, value) =>
                      patch({
                        customRuleConditionValues: {
                          ...state.customRuleConditionValues,
                          [key]: value,
                        },
                      })
                    }
                    options={state.customRuleConditionOptions}
                    optionsLabel={intl.formatMessage(messages.wizardRuleOptions)}
                    values={state.customRuleConditionValues}
                  />
                )}
                {state.customRuleConditions.map((condition, index) => {
                  const entry = conditions.find((candidate) => candidate.type === condition.type);
                  return (
                    <div
                      className="cl-visual-rule-builder__element"
                      key={`${condition.type}-${index}`}
                    >
                      <span>
                        {index > 0 && (
                          <strong>{intl.formatMessage(messages.wizardRuleAnd)} </strong>
                        )}
                        {renderRulePhrase('condition', condition.type, entry, condition)}
                      </span>
                      <Button
                        onClick={() => setState((current) => removeRuleCondition(current, index))}
                        type="button"
                        variant="secondary"
                      >
                        <FormattedMessage {...messages.wizardRuleRemove} />
                      </Button>
                    </div>
                  );
                })}
                {selectedCondition === undefined && state.customRuleConditions.length === 0 && (
                  <Alert tone="info">
                    <FormattedMessage {...messages.wizardRuleConditionlessExplanation} />
                  </Alert>
                )}
                {selectedCondition !== undefined && (
                  <Button
                    disabled={!canAddRuleCondition(state, vocabulary)}
                    onClick={() => setState((current) => addRuleCondition(current, vocabulary))}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.wizardRuleAddCondition} />
                  </Button>
                )}
              </Stack>
            }
            whenLabel={intl.formatMessage(messages.wizardRuleWhen)}
            then={
              <Stack gap="3">
                <Field
                  id="wizard-rule-action"
                  label={intl.formatMessage(messages.wizardRuleAction)}
                >
                  <Select
                    aria-describedby="wizard-rule-action-hint"
                    aria-label={intl.formatMessage(messages.wizardRuleAction)}
                    id="wizard-rule-action"
                    onValueChange={(val) => patch({ customRuleActionType: val || undefined })}
                    options={[
                      {
                        value: '',
                        label: intl.formatMessage(messages.wizardRuleChooseAction),
                      },
                      ...actions.map((entry) => ({
                        value: entry.type,
                        label: entry.description,
                      })),
                    ]}
                    value={state.customRuleActionType ?? ''}
                  />
                  <DecisionHint id="wizard-rule-action-hint" text={selectedAction?.description} />
                </Field>
                {selectedAction && (
                  <ElementAuthoringFields
                    entry={selectedAction}
                    kind="action"
                    onOptionsChange={(key, value) =>
                      patch({
                        customRuleActionOptions: { ...state.customRuleActionOptions, [key]: value },
                      })
                    }
                    onValueChange={(key, value) =>
                      patch({
                        customRuleActionValues: { ...state.customRuleActionValues, [key]: value },
                      })
                    }
                    options={state.customRuleActionOptions}
                    optionsLabel={intl.formatMessage(messages.wizardRuleOptions)}
                    values={state.customRuleActionValues}
                  />
                )}
                {state.customRuleActions.map((action, index) => {
                  const entry = actions.find((candidate) => candidate.type === action.type);
                  return (
                    <div
                      className="cl-visual-rule-builder__element"
                      key={`${action.type}-${index}`}
                    >
                      <span>
                        {index + 1}. {renderRulePhrase('action', action.type, entry, action)}
                      </span>
                      <Button
                        aria-label={intl.formatMessage(messages.wizardRuleMoveActionUp)}
                        disabled={index === 0}
                        onClick={() => setState((current) => moveRuleAction(current, index, -1))}
                        type="button"
                        variant="secondary"
                      >
                        ↑
                      </Button>
                      <Button
                        aria-label={intl.formatMessage(messages.wizardRuleMoveActionDown)}
                        disabled={index === state.customRuleActions.length - 1}
                        onClick={() => setState((current) => moveRuleAction(current, index, 1))}
                        type="button"
                        variant="secondary"
                      >
                        ↓
                      </Button>
                      <Button
                        onClick={() => setState((current) => removeRuleAction(current, index))}
                        type="button"
                        variant="secondary"
                      >
                        <FormattedMessage {...messages.wizardRuleRemove} />
                      </Button>
                    </div>
                  );
                })}
                {selectedAction !== undefined && (
                  <Button
                    disabled={!canAddRuleAction(state, vocabulary)}
                    onClick={() => setState((current) => addRuleAction(current, vocabulary))}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.wizardRuleAddAction} />
                  </Button>
                )}
              </Stack>
            }
            thenLabel={intl.formatMessage(messages.wizardRuleThen)}
          />
          <Button
            disabled={!canAddCustomRule(state, vocabulary)}
            onClick={() => setState((current) => addCustomRule(current, vocabulary))}
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.wizardRuleAddAnother} />
          </Button>
        </>
      )}
    </Stack>
  );
}

export function ElementAuthoringFields({
  entry,
  kind,
  values,
  options,
  optionsLabel,
  onValueChange,
  onOptionsChange,
}: {
  readonly entry: HookVocabularyEntry;
  readonly kind: 'condition' | 'action';
  readonly values: Readonly<Record<string, string>>;
  readonly options: Readonly<Record<string, string>>;
  readonly optionsLabel: string;
  readonly onValueChange: (key: string, value: string) => void;
  readonly onOptionsChange: (key: string, value: string) => void;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <fieldset
      style={{
        border: '1px solid var(--cl-border-muted)',
        padding: 'var(--cl-space-4)',
      }}
    >
      <legend>
        {entry.type} · {entry.description}
      </legend>
      <div className="cl-platform-form-grid">
        {(entry.authoring?.parameters ?? []).map((parameter) => {
          const key = parameterValueKey(kind, entry.type, parameter.name);
          const choices = parameter.valueSchema['enum'];
          const label = `${parameter.description}${parameter.required ? ' *' : ''}`;
          return (
            <Field id={key} key={key} label={label}>
              {Array.isArray(choices) ? (
                <Select
                  aria-label={label}
                  id={key}
                  onValueChange={(val) => onValueChange(key, val)}
                  options={[
                    { value: '', label: '' },
                    ...choices.map((choice) => ({
                      value: String(choice),
                      label: String(choice),
                    })),
                  ]}
                  placeholder={intl.formatMessage(messages.selectPlaceholder)}
                  value={values[key] ?? ''}
                />
              ) : (
                <Input
                  id={key}
                  onChange={(event) => onValueChange(key, event.target.value)}
                  placeholder={parameter.allowExpression ? '{{ event.payload.value }}' : undefined}
                  type={parameter.valueSchema['type'] === 'number' ? 'number' : 'text'}
                  value={values[key] ?? ''}
                />
              )}
            </Field>
          );
        })}
        {entry.authoring?.optionsSchema && (
          <Field id={`options-${entry.type}`} label={optionsLabel}>
            <Textarea
              aria-label={`${entry.type} options`}
              id={`options-${entry.type}`}
              onChange={(event) =>
                onOptionsChange(elementOptionsKey(kind, entry.type), event.target.value)
              }
              rows={4}
              value={options[elementOptionsKey(kind, entry.type)] ?? '{}'}
            />
          </Field>
        )}
      </div>
    </fieldset>
  );
}
