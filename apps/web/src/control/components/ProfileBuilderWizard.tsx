import { useState } from 'react';
import type { SupportedLanguage } from '@copalibre/domain';
import { useIntl } from 'react-intl';
import { Input } from './ui/atoms/input.js';
import { Select } from './ui/atoms/select.js';
import { DecisionHint } from './ui/atoms/decision-hint.js';
import { Field } from './ui/molecules/field.js';
import { LocalizedField } from './ui/molecules/localized-field.js';
import { WizardShell } from './ui/organisms/wizard-shell.js';
import { StageListEditor } from './StageListEditor.js';
import {
  localizedDraftValue,
  localizedFieldLanguages,
  localizedNameFieldView,
  patternFieldView,
  requiredFieldView,
  withLocalizedValue,
} from '../lib/descriptor-authoring.js';
import {
  ALIAS_PATTERN,
  PROFILE_STEPS,
  canContinue,
  canSubmit,
  formatsFor,
  initialProfileWizard,
  nextStep,
  previousStep,
  progress,
  stepProblems,
  toAuthoredModuleRequest,
  type ProfileWizardState,
} from '../lib/profile-authoring.js';
import type { AuthoredModuleValidationFailureResponse } from '../lib/api-client.js';
import type { DisciplineOption } from '../lib/wizard.js';
import { messages } from '../i18n/messages.en.js';

export function ProfileBuilderWizard({
  disciplines,
  onSubmit,
  failures = [],
  busy = false,
}: {
  readonly disciplines: readonly DisciplineOption[];
  readonly onSubmit?: (request: ReturnType<typeof toAuthoredModuleRequest>) => void;
  readonly failures?: readonly AuthoredModuleValidationFailureResponse[];
  readonly busy?: boolean;
}): React.JSX.Element {
  const intl = useIntl();
  const [state, setState] = useState<ProfileWizardState>(initialProfileWizard);
  // Shared by every localized field on the step: switching the tab on one
  // moves them all together, so translating the pair means picking the
  // language once rather than clicking through each field's own tabs.
  const [activeLanguage, setActiveLanguage] = useState<SupportedLanguage>('en');
  const problems = stepProblems(state, disciplines).filter(
    (problem) => !(problem === messages.profileProblemNameEnglish && activeLanguage === 'en'),
  );
  const aliasView = patternFieldView(
    state.alias,
    ALIAS_PATTERN,
    { hintId: 'profile-alias-hint', errorId: 'profile-alias-error' },
    intl.formatMessage,
    messages.profileProblemAliasFormat,
  );
  const versionView = requiredFieldView(
    state.version,
    'profile-version-error',
    intl.formatMessage,
    messages.profileProblemVersion,
  );
  const nameView = localizedNameFieldView(
    activeLanguage,
    state.name.en,
    intl.formatMessage,
    messages.profileProblemNameEnglish,
  );
  const isLastStep = state.step === 'points';
  const allowedFormats = formatsFor(disciplines, state.disciplineAlias);

  function patch(next: Partial<ProfileWizardState>): void {
    setState((current) => ({ ...current, ...next }));
  }

  return (
    <WizardShell
      ariaLabel={intl.formatMessage(messages.profileWizardTitle)}
      backLabel={intl.formatMessage(messages.profileBack)}
      currentStepId={state.step}
      failures={failures.map((failure, index) => ({
        key: `${failure.stage}-${failure.field ?? index}`,
        text: `[${failure.stage}${failure.field ? `:${failure.field}` : ''}] ${failure.message}`,
      }))}
      failuresTestId="profile-server-failures"
      onBack={() => patch({ step: previousStep(state) })}
      primaryAction={
        isLastStep
          ? {
              label: intl.formatMessage(messages.profileAuthorAndInstall),
              disabled: busy || !canContinue(state, disciplines) || !canSubmit(state, disciplines),
              onClick: () => onSubmit?.(toAuthoredModuleRequest(state)),
            }
          : {
              label: intl.formatMessage(messages.profileContinue),
              disabled: !canContinue(state, disciplines),
              onClick: () => patch({ step: nextStep(state) }),
            }
      }
      problems={problems.map((problem) => intl.formatMessage(problem))}
      progress={progress(state)}
      progressTestId="profile-wizard-progress"
      stepIndicatorVariant="plain"
      steps={PROFILE_STEPS.map((step) => ({ id: step.id, label: intl.formatMessage(step.label) }))}
      stepsAriaLabel={intl.formatMessage(messages.profileWizardSteps)}
      title={intl.formatMessage(messages.profileWizardTitle)}
    >
      {state.step === 'name' && (
        <div className="cl-platform-form-grid">
          <Field
            errorText={aliasView.errorText}
            id="profile-alias"
            label={intl.formatMessage(messages.profileFieldAlias)}
          >
            <Input
              aria-describedby={aliasView.describedBy}
              id="profile-alias"
              invalid={aliasView.invalid}
              onChange={(event) => patch({ alias: event.target.value })}
              value={state.alias}
            />
            <DecisionHint
              id="profile-alias-hint"
              text={intl.formatMessage(messages.profileDecisionAlias)}
            />
          </Field>
          <Field
            errorText={versionView.errorText}
            id="profile-version"
            label={intl.formatMessage(messages.profileFieldVersion)}
          >
            <Input
              aria-describedby={versionView.describedBy}
              id="profile-version"
              invalid={versionView.invalid}
              onChange={(event) => patch({ version: event.target.value })}
              value={state.version}
            />
          </Field>
          <div style={{ gridColumn: 'span 2' }}>
            <LocalizedField
              activeLanguage={activeLanguage}
              errorText={nameView.errorText}
              id="profile-name"
              invalid={nameView.invalid}
              label={intl.formatMessage(messages.profileFieldName)}
              languageTabsLabel={intl.formatMessage(messages.shellLanguage)}
              languages={localizedFieldLanguages(state.name)}
              onActiveLanguageChange={(code) => setActiveLanguage(code as SupportedLanguage)}
              onValueChange={(value) =>
                patch({ name: withLocalizedValue(state.name, activeLanguage, value) })
              }
              required
              value={localizedDraftValue(state.name, activeLanguage)}
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <LocalizedField
              activeLanguage={activeLanguage}
              id="profile-description"
              label={intl.formatMessage(messages.profileFieldDescription)}
              languageTabsLabel={intl.formatMessage(messages.shellLanguage)}
              languages={localizedFieldLanguages(state.description)}
              multiline
              onActiveLanguageChange={(code) => setActiveLanguage(code as SupportedLanguage)}
              onValueChange={(value) =>
                patch({
                  description: withLocalizedValue(state.description, activeLanguage, value),
                })
              }
              value={localizedDraftValue(state.description, activeLanguage)}
            />
          </div>
        </div>
      )}

      {state.step === 'authorship' && (
        <div className="cl-platform-form-grid">
          <Field id="profile-author" label={intl.formatMessage(messages.profileFieldAuthor)}>
            <Input
              aria-describedby="profile-author-hint"
              id="profile-author"
              onChange={(event) => patch({ author: event.target.value })}
              value={state.author}
            />
            <DecisionHint
              id="profile-author-hint"
              text={intl.formatMessage(messages.profileDecisionAuthor)}
            />
          </Field>
          <Field id="profile-licence" label={intl.formatMessage(messages.profileFieldLicence)}>
            <Input
              id="profile-licence"
              onChange={(event) => patch({ licence: event.target.value })}
              value={state.licence}
            />
          </Field>
          <Field id="profile-source-url" label={intl.formatMessage(messages.profileFieldSourceUrl)}>
            <Input
              id="profile-source-url"
              onChange={(event) => patch({ sourceUrl: event.target.value })}
              value={state.sourceUrl}
            />
          </Field>
        </div>
      )}

      {state.step === 'stages' && (
        <div className="cl-platform-form-grid">
          <Field
            id="profile-discipline"
            label={intl.formatMessage(messages.profileFieldDiscipline)}
          >
            <Select
              aria-describedby="profile-discipline-hint"
              id="profile-discipline"
              onValueChange={(val) => patch({ disciplineAlias: val, stages: [] })}
              options={[
                { value: '', label: '' },
                ...disciplines
                  .filter((discipline): discipline is DisciplineOption & { alias: string } =>
                    Boolean(discipline.alias),
                  )
                  .map((discipline) => ({
                    value: discipline.alias,
                    label: discipline.alias,
                  })),
              ]}
              value={state.disciplineAlias}
            />
            <DecisionHint
              id="profile-discipline-hint"
              text={intl.formatMessage(messages.profileDecisionDiscipline)}
            />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <StageListEditor
              formats={allowedFormats}
              onChange={(stages) => patch({ stages })}
              showAllocation
              stages={state.stages}
            />
          </div>
        </div>
      )}

      {state.step === 'points' && (
        <div className="cl-platform-form-grid">
          <Field id="profile-points-win" label={intl.formatMessage(messages.profileFieldPointsWin)}>
            <Input
              id="profile-points-win"
              min={0}
              onChange={(event) => patch({ pointsWin: Number(event.target.value) })}
              type="number"
              value={state.pointsWin}
            />
          </Field>
          <Field
            id="profile-points-draw"
            label={intl.formatMessage(messages.profileFieldPointsDraw)}
          >
            <Input
              id="profile-points-draw"
              min={0}
              onChange={(event) => patch({ pointsDraw: Number(event.target.value) })}
              type="number"
              value={state.pointsDraw}
            />
          </Field>
          <Field
            id="profile-points-loss"
            label={intl.formatMessage(messages.profileFieldPointsLoss)}
          >
            <Input
              id="profile-points-loss"
              min={0}
              onChange={(event) => patch({ pointsLoss: Number(event.target.value) })}
              type="number"
              value={state.pointsLoss}
            />
          </Field>
        </div>
      )}
    </WizardShell>
  );
}
