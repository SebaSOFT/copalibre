import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { StepHeading } from './ui/molecules/step-heading.js';
import { WizardShell } from './ui/organisms/wizard-shell.js';
import { type WizardEmblem } from './WizardEmblemPane.js';
import {
  WIZARD_STEPS,
  canContinue,
  formatsFor,
  initialWizard,
  mutationClassOf,
  nextStep,
  previousStep,
  progress,
  resolveDecisionDescription,
  reversibilityMessageKey,
  stepProblems,
  toCreateRequest,
  type DisciplineOption,
  type TournamentProfileOption,
  type WizardState,
} from '../lib/wizard.js';
import { initialStages } from '../lib/stage-authoring.js';
import type { HookScriptVocabulary } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import {
  NameStep,
  PrivacyStep,
  DisciplineStep,
} from './tournament-setup/TournamentSetupBasicsSteps.js';
import {
  FormatStep,
  RulesetStep,
  WindowStep,
} from './tournament-setup/TournamentSetupFormatSteps.js';
import { RulesStep } from './tournament-setup/TournamentSetupRulesStep.js';
import { SummaryStep } from './tournament-setup/TournamentSetupSummaryStep.js';

const EMPTY_PROFILES: readonly TournamentProfileOption[] = [];
const EMPTY_VOCABULARY: HookScriptVocabulary = { hooks: [], entries: [] };

export function TournamentSetupWizard({
  disciplines,
  profiles: initialProfiles = EMPTY_PROFILES,
  loadProfiles,
  vocabulary = EMPTY_VOCABULARY,
  onSubmit,
  initialState,
}: {
  readonly disciplines: readonly DisciplineOption[];
  readonly profiles?: readonly TournamentProfileOption[];
  readonly loadProfiles?: (
    descriptorId: string,
    version: string,
    format?: string,
  ) => Promise<readonly TournamentProfileOption[]>;
  readonly vocabulary?: HookScriptVocabulary;
  /** The emblem rides along only when the operator picked one: it is not part of the create request. */
  readonly onSubmit?: (
    request: ReturnType<typeof toCreateRequest>,
    extras?: { readonly emblem: WizardEmblem },
  ) => void;
  readonly initialState?: Partial<WizardState>;
}): React.JSX.Element {
  const intl = useIntl();
  const firstDiscipline = disciplines[0];
  const [asyncProfiles, setAsyncProfiles] = useState<readonly TournamentProfileOption[]>([]);
  const [privacyReturnToSummary, setPrivacyReturnToSummary] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [emblem, setEmblem] = useState<WizardEmblem | undefined>(undefined);
  const [state, setState] = useState<WizardState>(() => ({
    ...initialWizard(),
    ...(firstDiscipline === undefined
      ? {}
      : {
          descriptorId: firstDiscipline.descriptorId,
          descriptorVersion: firstDiscipline.version,
          stages: initialStages(firstDiscipline.supportedFormats[0]),
        }),
    ...initialState,
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
    const request = toCreateRequest(state, vocabulary);
    if (emblem === undefined) onSubmit?.(request);
    else onSubmit?.(request, { emblem });
  }

  return (
    <WizardShell
      ariaLabel={intl.formatMessage(messages.wizardTitle)}
      backLabel={intl.formatMessage(messages.wizardBack)}
      breadcrumb={intl.formatMessage(messages.wizardBreadcrumb)}
      currentStepId={state.step}
      nextStepCaption={(step) => intl.formatMessage(messages.wizardNextStep, { step })}
      onBack={() => {
        setShowValidation(false);
        if (state.step === 'privacy' && privacyReturnToSummary) {
          setPrivacyReturnToSummary(false);
          patch({ step: 'summary' });
          return;
        }
        patch({ step: previousStep(state) });
      }}
      primaryAction={
        state.step === 'summary'
          ? {
              label: intl.formatMessage(messages.wizardCreate),
              disabled: !canContinue(state, disciplines, vocabulary),
              onClick: submit,
            }
          : {
              label: intl.formatMessage(
                state.step === 'privacy' && privacyReturnToSummary
                  ? messages.wizardReturnToSummary
                  : messages.wizardContinue,
              ),
              disabled: !canContinue(state, disciplines, vocabulary),
              onClick: () => {
                if (state.step === 'privacy' && privacyReturnToSummary) {
                  setShowValidation(false);
                  setPrivacyReturnToSummary(false);
                  patch({ step: 'summary' });
                  return;
                }
                setShowValidation(false);
                patch({ step: nextStep(state) });
              },
            }
      }
      problems={showValidation ? problems.map((problem) => intl.formatMessage(problem)) : []}
      progress={progress(state, problems.length === 0)}
      progressCaption={` ${intl.formatMessage(messages.wizardConfigured)}`}
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
      <div onBlurCapture={() => setShowValidation(true)}>
        {activeStep !== undefined && (
          <StepHeading
            level={2}
            step={activeStepNumber}
            totalSteps={WIZARD_STEPS.length}
            title={intl.formatMessage(activeStep.label)}
          />
        )}
        {state.step === 'name' && (
          <NameStep
            emblem={emblem}
            intl={intl}
            onEmblemChange={setEmblem}
            patch={patch}
            state={state}
          />
        )}

        {state.step === 'privacy' && <PrivacyStep intl={intl} patch={patch} state={state} />}

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

        {state.step === 'ruleset' && (
          <RulesetStep
            intl={intl}
            patch={patch}
            selectedDiscipline={selectedDiscipline}
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

        {state.step === 'summary' && (
          <SummaryStep
            onReviewPrivacy={() => {
              setPrivacyReturnToSummary(true);
              patch({ step: 'privacy' });
            }}
            selectedDiscipline={selectedDiscipline}
            state={state}
          />
        )}
      </div>
    </WizardShell>
  );
}
