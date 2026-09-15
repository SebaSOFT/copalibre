import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from './ui/atoms/alert.js';
import { FormattedMessage, useIntl, type IntlShape } from 'react-intl';
import { Button } from './ui/atoms/button.js';
import { Checkbox } from './ui/atoms/checkbox.js';
import { Input } from './ui/atoms/input.js';
import { Select } from './ui/atoms/select.js';
import { Textarea } from './ui/atoms/textarea.js';
import { DecisionHint } from './ui/atoms/decision-hint.js';
import { Stack } from './ui/atoms/layout/stack.js';
import { Field } from './ui/molecules/field.js';
import { StepHeading } from './ui/molecules/step-heading.js';
import { WizardShell } from './ui/organisms/wizard-shell.js';
import { StageListEditor } from './StageListEditor.js';
import {
  WIZARD_STEPS,
  addCustomRule,
  canContinue,
  canAddCustomRule,
  elementOptionsKey,
  formatsFor,
  initialWizard,
  mutationClassOf,
  nextStep,
  parameterValueKey,
  previousStep,
  progress,
  removeCustomRule,
  resolveDecisionDescription,
  reversibilityMessageKey,
  stepProblems,
  toCreateRequest,
  type DisciplineOption,
  type TournamentProfileOption,
  type WizardState,
} from '../lib/wizard.js';
import { initialStages } from '../lib/stage-authoring.js';
import type { HookScriptVocabulary, HookVocabularyEntry } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import { localizedText } from '../../lib/localized-label.js';

const EMPTY_PROFILES: readonly TournamentProfileOption[] = [];
const EMPTY_VOCABULARY: HookScriptVocabulary = { hooks: [], entries: [] };

export function TournamentSetupWizard({
  disciplines,
  profiles: initialProfiles = EMPTY_PROFILES,
  loadProfiles,
  vocabulary = EMPTY_VOCABULARY,
  onSubmit,
}: {
  readonly disciplines: readonly DisciplineOption[];
  readonly profiles?: readonly TournamentProfileOption[];
  readonly loadProfiles?: (
    descriptorId: string,
    version: string,
    format?: string,
  ) => Promise<readonly TournamentProfileOption[]>;
  readonly vocabulary?: HookScriptVocabulary;
  readonly onSubmit?: (request: ReturnType<typeof toCreateRequest>) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const firstDiscipline = disciplines[0];
  const [asyncProfiles, setAsyncProfiles] = useState<readonly TournamentProfileOption[]>([]);
  const [state, setState] = useState<WizardState>(() => ({
    ...initialWizard(),
    ...(firstDiscipline === undefined
      ? {}
      : {
          descriptorId: firstDiscipline.descriptorId,
          descriptorVersion: firstDiscipline.version,
          stages: initialStages(firstDiscipline.supportedFormats[0]),
        }),
  }));
  const firstStageFormat = state.stages[0]?.format;

  useEffect(() => {
    if (!loadProfiles || !state.descriptorId || !state.descriptorVersion) {
      return;
    }
    let live = true;
    loadProfiles(state.descriptorId, state.descriptorVersion, firstStageFormat)
      .then((loaded) => {
        if (live) setAsyncProfiles(loaded);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [loadProfiles, state.descriptorId, state.descriptorVersion, firstStageFormat]);

  const profiles = loadProfiles ? asyncProfiles : initialProfiles;

  const problems = stepProblems(state, disciplines, vocabulary);
  const activeStepIndex = WIZARD_STEPS.findIndex((step) => step.id === state.step);
  const activeStep = WIZARD_STEPS[activeStepIndex];
  const activeStepNumber = activeStepIndex + 1;
  const conditions = vocabulary.entries.filter((entry) => entry.kind === 'condition');
  const actions = vocabulary.entries.filter((entry) => entry.kind === 'action');
  const selectedCondition = conditions.find(
    (entry) => entry.type === state.customRuleConditionType,
  );
  const selectedAction = actions.find((entry) => entry.type === state.customRuleActionType);
  const formats = useMemo(
    () => formatsFor(disciplines, state.descriptorId),
    [disciplines, state.descriptorId],
  );
  const selectedDiscipline = disciplines.find(
    (discipline) => discipline.descriptorId === state.descriptorId,
  );

  function patch(next: Partial<WizardState>): void {
    setState((current) => ({ ...current, ...next }));
  }

  /**
   * A decision's persistent hint text: the platform-catalogued description,
   * with the reversibility sentence appended when the field's own
   * `ConfigFieldPolicies` entry says a change becomes hard to reverse. The
   * sentence is never authored per field — it is derived from the same policy
   * a mutation attempt is later evaluated against, so the two can never drift.
   */
  function decisionHintText(
    dotPath: string,
    catalogue: (typeof messages)['wizardDecisionFormat'],
  ): string {
    const description = resolveDecisionDescription(undefined, intl.formatMessage(catalogue));
    const mutationClass = mutationClassOf(selectedDiscipline?.fieldPolicies, dotPath);
    const reversibilityKey = reversibilityMessageKey(mutationClass);
    const reversibility =
      reversibilityKey === 'requiresRebuild'
        ? intl.formatMessage(messages.wizardMutationRequiresRebuild)
        : reversibilityKey === 'blockedAfterResults'
          ? intl.formatMessage(messages.wizardMutationBlockedAfterResults)
          : undefined;
    return [description, reversibility]
      .filter((part): part is string => part !== undefined)
      .join(' ');
  }

  function submit(): void {
    onSubmit?.(toCreateRequest(state, vocabulary));
  }

  return (
    <WizardShell
      ariaLabel={intl.formatMessage(messages.wizardTitle)}
      backLabel={intl.formatMessage(messages.wizardBack)}
      breadcrumb={intl.formatMessage(messages.wizardBreadcrumb)}
      currentStepId={state.step}
      onBack={() => patch({ step: previousStep(state) })}
      primaryAction={
        state.step === 'window'
          ? {
              label: intl.formatMessage(messages.wizardCreate),
              disabled: !canContinue(state, disciplines, vocabulary),
              onClick: submit,
            }
          : {
              label: intl.formatMessage(messages.wizardContinue),
              disabled: !canContinue(state, disciplines, vocabulary),
              onClick: () => patch({ step: nextStep(state) }),
            }
      }
      problems={problems.map((problem) => intl.formatMessage(problem))}
      progress={progress(state)}
      progressCaption={intl.formatMessage(messages.wizardConfigured)}
      progressTestId="wizard-progress"
      stepIndicatorVariant="badge"
      steps={WIZARD_STEPS.map((step) => ({ id: step.id, label: intl.formatMessage(step.label) }))}
      stepsAriaLabel={intl.formatMessage(messages.wizardSteps)}
      title={intl.formatMessage(messages.wizardTitle)}
    >
      {/*
        The strip above says where the operator is in the sequence; this says
        what they are doing. Until now the panel carried no heading at all, so
        a screen reader moving by heading arrived at a form with no subject.
      */}
      {activeStep !== undefined && (
        <StepHeading
          level={2}
          step={activeStepNumber}
          title={intl.formatMessage(activeStep.label)}
        />
      )}
      {state.step === 'name' && <NameStep intl={intl} patch={patch} state={state} />}

      {state.step === 'discipline' && (
        <DisciplineStep disciplines={disciplines} intl={intl} patch={patch} state={state} />
      )}

      {state.step === 'format' && (
        <FormatStep
          formatHintText={decisionHintText('format', messages.wizardDecisionFormat)}
          formats={formats}
          intl={intl}
          patch={patch}
          profiles={profiles}
          state={state}
        />
      )}

      {state.step === 'window' && (
        <WindowStep decisionHintText={decisionHintText} intl={intl} patch={patch} state={state} />
      )}

      {state.step === 'rules' && (
        <RulesStep
          actions={actions}
          conditions={conditions}
          intl={intl}
          patch={patch}
          selectedAction={selectedAction}
          selectedCondition={selectedCondition}
          setState={setState}
          state={state}
          vocabulary={vocabulary}
        />
      )}
    </WizardShell>
  );
}

/**
 * One component per wizard step, extracted from `TournamentSetupWizard`'s
 * render body (openspec 0228): each step's own conditionals now count toward
 * its own function, not the wizard shell's, and the shell keeps only the
 * `state.step === '<name>' &&` gate that chooses among them.
 */
function NameStep({
  intl,
  patch,
  state,
}: {
  readonly intl: IntlShape;
  readonly patch: (next: Partial<WizardState>) => void;
  readonly state: WizardState;
}): React.JSX.Element {
  return (
    <div className="cl-platform-form-grid">
      <Field id="wizard-name" label={intl.formatMessage(messages.wizardFieldName)}>
        <Input
          id="wizard-name"
          onChange={(event) => patch({ name: event.target.value })}
          value={state.name ?? ''}
        />
      </Field>
      <Field id="wizard-alias" label={intl.formatMessage(messages.wizardFieldAlias)}>
        <Input
          id="wizard-alias"
          onChange={(event) => patch({ alias: event.target.value })}
          value={state.alias ?? ''}
        />
      </Field>
    </div>
  );
}

function DisciplineStep({
  disciplines,
  intl,
  patch,
  state,
}: {
  readonly disciplines: readonly DisciplineOption[];
  readonly intl: IntlShape;
  readonly patch: (next: Partial<WizardState>) => void;
  readonly state: WizardState;
}): React.JSX.Element {
  return (
    <Field id="wizard-discipline" label={intl.formatMessage(messages.wizardFieldDiscipline)}>
      <Select
        aria-describedby="wizard-discipline-hint"
        aria-label={intl.formatMessage(messages.wizardFieldDiscipline)}
        id="wizard-discipline"
        onValueChange={(val) => {
          const discipline = disciplines.find((one) => one.descriptorId === val);
          patch({
            descriptorId: discipline?.descriptorId,
            descriptorVersion: discipline?.version,
            stages: initialStages(discipline?.supportedFormats[0]),
            profileId: undefined,
            profileVersion: undefined,
          });
        }}
        options={disciplines.map((discipline) => ({
          value: discipline.descriptorId,
          label: `${localizedText(discipline.name, intl.locale)}${
            discipline.description === undefined
              ? ''
              : ` — ${localizedText(discipline.description, intl.locale)}`
          } · ${discipline.version}`,
        }))}
        value={state.descriptorId ?? ''}
      />
      <DecisionHint
        id="wizard-discipline-hint"
        text={intl.formatMessage(messages.wizardDecisionDiscipline)}
      />
    </Field>
  );
}

function FormatStep({
  formatHintText,
  formats,
  intl,
  patch,
  profiles,
  state,
}: {
  readonly formatHintText: string;
  readonly formats: readonly string[];
  readonly intl: IntlShape;
  readonly patch: (next: Partial<WizardState>) => void;
  readonly profiles: readonly TournamentProfileOption[];
  readonly state: WizardState;
}): React.JSX.Element {
  const selectedProfile = profiles.find((profile) => profile.profileId === state.profileId);
  // Stashed so clearing the profile selection restores what the operator had
  // authored, rather than resetting to a single blank stage.
  const preProfileStages = useRef<WizardState['stages'] | undefined>(undefined);

  return (
    <div className="cl-platform-form-grid">
      {profiles.length > 0 && (
        <Field id="wizard-profile" label={intl.formatMessage(messages.wizardFieldProfile)}>
          <Select
            aria-label={intl.formatMessage(messages.wizardFieldProfile)}
            id="wizard-profile"
            onValueChange={(val) => {
              const nextProfile = profiles.find((p) => p.profileId === val);
              if (nextProfile) {
                if (preProfileStages.current === undefined) preProfileStages.current = state.stages;
                patch({
                  profileId: nextProfile.profileId,
                  profileVersion: nextProfile.version,
                  // The wizard submits the profile's own stages verbatim — this
                  // read-only preview and the submitted request never disagree.
                  stages: nextProfile.stages.map((stage) => ({
                    number: stage.number,
                    name: stage.name,
                    format: stage.format,
                    ...(stage.allocation === undefined ? {} : { allocation: stage.allocation }),
                  })),
                });
              } else {
                patch({
                  profileId: undefined,
                  profileVersion: undefined,
                  stages: preProfileStages.current ?? initialStages(formats[0]),
                });
                preProfileStages.current = undefined;
              }
            }}
            options={[
              { value: '', label: intl.formatMessage(messages.wizardProfileNone) },
              ...profiles.map((profile) => ({
                value: profile.profileId,
                label: `${localizedText(profile.name, intl.locale)} (${profile.stages
                  .map((s) => s.name)
                  .join(' → ')}) · ${profile.version}`,
              })),
            ]}
            value={state.profileId ?? ''}
          />
        </Field>
      )}

      <div style={{ gridColumn: '1 / -1' }}>
        {selectedProfile ? (
          <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
            <p style={{ margin: 0, color: 'var(--cl-text-secondary)' }}>
              <FormattedMessage {...messages.stageEditorProfilePreviewHint} />
            </p>
            <StageListEditor formats={formats} readOnly showAllocation stages={state.stages} />
          </div>
        ) : (
          <StageListEditor
            formatHintText={formatHintText}
            formats={formats}
            onChange={(stages) => patch({ stages })}
            showAllocation
            showSeries
            stages={state.stages}
          />
        )}
      </div>
    </div>
  );
}

function WindowStep({
  decisionHintText,
  intl,
  patch,
  state,
}: {
  readonly decisionHintText: (
    dotPath: string,
    catalogue: (typeof messages)['wizardDecisionFormat'],
  ) => string;
  readonly intl: IntlShape;
  readonly patch: (next: Partial<WizardState>) => void;
  readonly state: WizardState;
}): React.JSX.Element {
  return (
    <div className="cl-platform-form-grid">
      <Field id="wizard-region" label={intl.formatMessage(messages.wizardFieldRegion)}>
        <Input
          aria-describedby="wizard-region-hint"
          id="wizard-region"
          onChange={(event) => patch({ region: event.target.value })}
          value={state.region ?? ''}
        />
        <DecisionHint
          id="wizard-region-hint"
          text={decisionHintText('registration.region', messages.wizardDecisionRegion)}
        />
      </Field>
      <Field id="wizard-capacity" label={intl.formatMessage(messages.wizardFieldCapacity)}>
        <Input
          aria-describedby="wizard-capacity-hint"
          id="wizard-capacity"
          min={2}
          onChange={(event) =>
            patch({
              capacity: event.target.value === '' ? undefined : Number(event.target.value),
            })
          }
          type="number"
          value={state.capacity ?? ''}
        />
        <DecisionHint
          id="wizard-capacity-hint"
          text={decisionHintText('registration.capacity', messages.wizardDecisionCapacity)}
        />
      </Field>
      <label
        className="cl-toggle cl-focusable"
        htmlFor="wizard-public-registration"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}
      >
        <Checkbox
          aria-describedby="wizard-public-registration-hint"
          aria-label={intl.formatMessage(messages.wizardPublicRegistration)}
          checked={state.publicRegistration}
          id="wizard-public-registration"
          onCheckedChange={(checked) => patch({ publicRegistration: checked })}
        />
        <span>
          <FormattedMessage {...messages.wizardPublicRegistration} />
        </span>
      </label>
      <DecisionHint
        id="wizard-public-registration-hint"
        text={decisionHintText(
          'registration.publicOpen',
          messages.wizardDecisionPublicRegistration,
        )}
      />
      <label
        className="cl-toggle cl-focusable"
        htmlFor="wizard-requires-check-in"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}
      >
        <Checkbox
          aria-describedby="wizard-requires-check-in-hint"
          aria-label={intl.formatMessage(messages.wizardRequiresCheckIn)}
          checked={state.requiresCheckIn}
          id="wizard-requires-check-in"
          onCheckedChange={(checked) => patch({ requiresCheckIn: checked })}
        />
        <span>
          <FormattedMessage {...messages.wizardRequiresCheckIn} />
        </span>
      </label>
      <DecisionHint
        id="wizard-requires-check-in-hint"
        text={decisionHintText(
          'registration.requiresCheckIn',
          messages.wizardDecisionRequiresCheckIn,
        )}
      />
      {state.requiresCheckIn && (
        <Field
          id="wizard-check-in-closes-at"
          label={intl.formatMessage(messages.wizardFieldCheckInClosesAt)}
        >
          <Input
            aria-describedby="wizard-check-in-closes-at-hint"
            id="wizard-check-in-closes-at"
            onChange={(event) => patch({ checkInClosesAt: event.target.value })}
            type="datetime-local"
            value={state.checkInClosesAt ?? ''}
          />
          <DecisionHint
            id="wizard-check-in-closes-at-hint"
            text={decisionHintText(
              'registration.checkInClosesAt',
              messages.wizardDecisionCheckInClosesAt,
            )}
          />
        </Field>
      )}
    </div>
  );
}

function RulesStep({
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
          <p style={{ margin: 0, color: 'var(--cl-text-secondary)' }}>
            <FormattedMessage {...messages.wizardRuleHookHelp} />
          </p>
          {state.customRules.length > 0 && (
            <ol style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
              {state.customRules.map((rule, index) => (
                <li
                  key={`${rule.actionType}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--cl-space-3)',
                  }}
                >
                  <span>
                    {index + 1}. {rule.conditionType ?? 'always'} → {rule.actionType}
                  </span>
                  <Button
                    onClick={() => setState((current) => removeCustomRule(current, index))}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.wizardRuleRemove} />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <div className="cl-platform-form-grid">
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
                    label: `${entry.type} — ${entry.description}`,
                  })),
                ]}
                value={state.customRuleConditionType ?? ''}
              />
              <DecisionHint id="wizard-rule-condition-hint" text={selectedCondition?.description} />
            </Field>
            <Field id="wizard-rule-action" label={intl.formatMessage(messages.wizardRuleAction)}>
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
                    label: `${entry.type} — ${entry.description}`,
                  })),
                ]}
                value={state.customRuleActionType ?? ''}
              />
              <DecisionHint id="wizard-rule-action-hint" text={selectedAction?.description} />
            </Field>
          </div>
          {selectedCondition === undefined && (
            <Alert tone="info">
              <FormattedMessage {...messages.wizardRuleConditionlessExplanation} />
            </Alert>
          )}
          {selectedCondition && (
            <ElementAuthoringFields
              entry={selectedCondition}
              kind="condition"
              onOptionsChange={(key, value) =>
                patch({ customRuleOptions: { ...state.customRuleOptions, [key]: value } })
              }
              onValueChange={(key, value) =>
                patch({ customRuleValues: { ...state.customRuleValues, [key]: value } })
              }
              options={state.customRuleOptions}
              optionsLabel={intl.formatMessage(messages.wizardRuleOptions)}
              values={state.customRuleValues}
            />
          )}
          {selectedAction && (
            <ElementAuthoringFields
              entry={selectedAction}
              kind="action"
              onOptionsChange={(key, value) =>
                patch({ customRuleOptions: { ...state.customRuleOptions, [key]: value } })
              }
              onValueChange={(key, value) =>
                patch({ customRuleValues: { ...state.customRuleValues, [key]: value } })
              }
              options={state.customRuleOptions}
              optionsLabel={intl.formatMessage(messages.wizardRuleOptions)}
              values={state.customRuleValues}
            />
          )}
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

function ElementAuthoringFields({
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
