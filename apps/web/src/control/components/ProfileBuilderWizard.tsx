import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from './ui/atoms/button.js';
import { Card } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { DecisionHint } from './ui/atoms/decision-hint.js';
import { FormField } from './ui/molecules/form-field.js';
import { TRANSLATABLE_LANGUAGES } from '../lib/descriptor-authoring.js';
import {
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
  type ProfileStageDraft,
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
  const problems = stepProblems(state, disciplines);
  const isLastStep = state.step === 'points';
  const allowedFormats = formatsFor(disciplines, state.disciplineAlias);

  function patch(next: Partial<ProfileWizardState>): void {
    setState((current) => ({ ...current, ...next }));
  }

  return (
    <section
      aria-label={intl.formatMessage(messages.profileWizardTitle)}
      className="cl-form-screen"
    >
      <header className="cl-form-screen__header">
        <h1 className="cl-form-screen__title">
          <FormattedMessage {...messages.profileWizardTitle} />
        </h1>
        <div
          className="cl-stat-tile cl-chamfer cl-chamfer--control"
          data-testid="profile-wizard-progress"
        >
          <strong className="cl-stat-tile__value">{progress(state)}%</strong>
        </div>
      </header>

      <Card className="cl-chamfer cl-chamfer--control">
        <ol
          aria-label={intl.formatMessage(messages.profileWizardSteps)}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(6rem, 1fr))',
            gap: 'var(--cl-space-3)',
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {PROFILE_STEPS.map((step, index) => (
            <li
              key={step.id}
              style={{ display: 'grid', gap: 'var(--cl-space-2)', justifyItems: 'center' }}
            >
              <span aria-current={step.id === state.step ? 'step' : undefined}>{index + 1}</span>
              <span>{intl.formatMessage(step.label)}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="cl-chamfer cl-chamfer--control">
        {state.step === 'name' && (
          <div className="cl-platform-form-grid">
            <FormField id="profile-alias" label={intl.formatMessage(messages.profileFieldAlias)}>
              <Input
                aria-describedby="profile-alias-hint"
                id="profile-alias"
                onChange={(event) => patch({ alias: event.target.value })}
                value={state.alias}
              />
              <DecisionHint
                id="profile-alias-hint"
                text={intl.formatMessage(messages.profileDecisionAlias)}
              />
            </FormField>
            <FormField
              id="profile-version"
              label={intl.formatMessage(messages.profileFieldVersion)}
            >
              <Input
                id="profile-version"
                onChange={(event) => patch({ version: event.target.value })}
                value={state.version}
              />
            </FormField>
            <LocalizedField
              draft={state.name}
              id="profile-name"
              label={intl.formatMessage(messages.profileFieldName)}
              onChange={(name) => patch({ name })}
            />
            <LocalizedField
              draft={state.description}
              id="profile-description"
              label={intl.formatMessage(messages.profileFieldDescription)}
              onChange={(description) => patch({ description })}
              required={false}
            />
          </div>
        )}

        {state.step === 'authorship' && (
          <div className="cl-platform-form-grid">
            <FormField id="profile-author" label={intl.formatMessage(messages.profileFieldAuthor)}>
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
            </FormField>
            <FormField
              id="profile-licence"
              label={intl.formatMessage(messages.profileFieldLicence)}
            >
              <Input
                id="profile-licence"
                onChange={(event) => patch({ licence: event.target.value })}
                value={state.licence}
              />
            </FormField>
            <FormField
              id="profile-source-url"
              label={intl.formatMessage(messages.profileFieldSourceUrl)}
            >
              <Input
                id="profile-source-url"
                onChange={(event) => patch({ sourceUrl: event.target.value })}
                value={state.sourceUrl}
              />
            </FormField>
          </div>
        )}

        {state.step === 'stages' && (
          <div className="cl-platform-form-grid">
            <FormField
              id="profile-discipline"
              label={intl.formatMessage(messages.profileFieldDiscipline)}
            >
              <select
                aria-describedby="profile-discipline-hint"
                className="cl-select cl-select--default cl-focusable"
                id="profile-discipline"
                onChange={(event) => patch({ disciplineAlias: event.target.value, stages: [] })}
                value={state.disciplineAlias}
              >
                <option value="" />
                {disciplines
                  .filter((discipline): discipline is DisciplineOption & { alias: string } =>
                    Boolean(discipline.alias),
                  )
                  .map((discipline) => (
                    <option key={discipline.alias} value={discipline.alias}>
                      {discipline.alias}
                    </option>
                  ))}
              </select>
              <DecisionHint
                id="profile-discipline-hint"
                text={intl.formatMessage(messages.profileDecisionDiscipline)}
              />
            </FormField>
            <div style={{ gridColumn: '1 / -1' }}>
              <StageList
                allowedFormats={allowedFormats}
                onAdd={(stage) => patch({ stages: [...state.stages, stage] })}
                onRemove={(index) =>
                  patch({ stages: state.stages.filter((_stage, i) => i !== index) })
                }
                stages={state.stages}
              />
            </div>
          </div>
        )}

        {state.step === 'points' && (
          <div className="cl-platform-form-grid">
            <FormField
              id="profile-points-win"
              label={intl.formatMessage(messages.profileFieldPointsWin)}
            >
              <Input
                id="profile-points-win"
                min={0}
                onChange={(event) => patch({ pointsWin: Number(event.target.value) })}
                type="number"
                value={state.pointsWin}
              />
            </FormField>
            <FormField
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
            </FormField>
            <FormField
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
            </FormField>
          </div>
        )}

        {problems.length > 0 && (
          <ul className="cl-inline-alert" style={{ marginTop: 'var(--cl-space-4)' }}>
            {problems.map((problem) => (
              <li key={problem.id}>{intl.formatMessage(problem)}</li>
            ))}
          </ul>
        )}

        {failures.length > 0 && (
          <ul
            className="cl-inline-alert"
            data-testid="profile-server-failures"
            style={{ marginTop: 'var(--cl-space-4)' }}
          >
            {failures.map((failure, index) => (
              <li key={`${failure.stage}-${failure.field ?? index}`}>
                [{failure.stage}
                {failure.field ? `:${failure.field}` : ''}] {failure.message}
              </li>
            ))}
          </ul>
        )}

        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--cl-space-3)',
            marginTop: 'var(--cl-space-6)',
          }}
        >
          <Button
            onClick={() => patch({ step: previousStep(state) })}
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.profileBack} />
          </Button>
          {isLastStep ? (
            <Button
              disabled={busy || !canContinue(state, disciplines) || !canSubmit(state, disciplines)}
              onClick={() => onSubmit?.(toAuthoredModuleRequest(state))}
              type="button"
            >
              <FormattedMessage {...messages.profileAuthorAndInstall} />
            </Button>
          ) : (
            <Button
              disabled={!canContinue(state, disciplines)}
              onClick={() => patch({ step: nextStep(state) })}
              type="button"
            >
              <FormattedMessage {...messages.profileContinue} />
            </Button>
          )}
        </footer>
      </Card>
    </section>
  );
}

function LocalizedField({
  id,
  label,
  draft,
  onChange,
  required = true,
}: {
  readonly id: string;
  readonly label: string;
  readonly draft: ProfileWizardState['name'];
  readonly onChange: (draft: ProfileWizardState['name']) => void;
  readonly required?: boolean;
}): React.JSX.Element {
  return (
    <FormField id={id} label={`${label}${required ? ' *' : ''}`}>
      <Input
        id={id}
        onChange={(event) => onChange({ ...draft, en: event.target.value })}
        value={draft.en}
      />
      <div style={{ display: 'grid', gap: 'var(--cl-space-2)', marginTop: 'var(--cl-space-2)' }}>
        {TRANSLATABLE_LANGUAGES.map((language) => (
          <Input
            aria-label={`${label} (${language})`}
            key={language}
            onChange={(event) =>
              onChange({
                ...draft,
                translations: { ...draft.translations, [language]: event.target.value },
              })
            }
            placeholder={language}
            value={draft.translations[language] ?? ''}
          />
        ))}
      </div>
    </FormField>
  );
}

function StageList({
  stages,
  allowedFormats,
  onAdd,
  onRemove,
}: {
  readonly stages: readonly ProfileStageDraft[];
  readonly allowedFormats: readonly string[];
  readonly onAdd: (stage: ProfileStageDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{ name: string; format: string }>({
    name: '',
    format: allowedFormats[0] ?? '',
  });
  return (
    <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
      <h3>
        <FormattedMessage {...messages.profileStagesHeading} />
      </h3>
      <DecisionHint
        id="profile-stages-hint"
        text={intl.formatMessage(messages.profileDecisionStages)}
      />
      {stages.length > 0 && (
        <ol>
          {stages.map((stage, index) => (
            <li key={`${stage.name}-${index}`}>
              {stage.number}. {stage.name} ({stage.format})
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.profileRemove} />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.profileFieldStageName)}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder={intl.formatMessage(messages.profileFieldStageName)}
          value={draft.name}
        />
        <select
          className="cl-select cl-select--default cl-focusable"
          onChange={(event) => setDraft({ ...draft, format: event.target.value })}
          value={draft.format}
        >
          <option value="" />
          {allowedFormats.map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
        <Button
          disabled={draft.name.trim() === '' || draft.format.trim() === ''}
          onClick={() => {
            onAdd({ number: stages.length + 1, name: draft.name.trim(), format: draft.format });
            setDraft({ name: '', format: allowedFormats[0] ?? '' });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.profileAdd} />
        </Button>
      </div>
    </div>
  );
}
