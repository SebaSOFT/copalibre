import { useState } from 'react';
import { Alert } from './ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from './ui/atoms/button.js';
import { Card } from './ui/atoms/card.js';
import { Checkbox } from './ui/atoms/checkbox.js';
import { Input } from './ui/atoms/input.js';
import { Select } from './ui/atoms/select.js';
import { DecisionHint } from './ui/atoms/decision-hint.js';
import { TerminalBlock } from './ui/atoms/TerminalBlock.js';
import { FormField } from './ui/molecules/form-field.js';
import {
  ACTOR_REQUIREMENTS,
  AGGREGATION_MODES,
  DESCRIPTOR_STEPS,
  EVENT_CATEGORIES,
  TOURNAMENT_FORMATS,
  TRANSLATABLE_LANGUAGES,
  canContinue,
  canSubmit,
  initialDescriptorWizard,
  nextStep,
  previousStep,
  progress,
  stepProblems,
  toAuthoredModuleRequest,
  type DescriptorWizardState,
  type EventDefinitionDraft,
  type ScoringInputDraft,
  type SegmentTypeDraft,
  type StatisticDraft,
} from '../lib/descriptor-authoring.js';
import type { AuthoredModuleValidationFailureResponse } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';

export function DescriptorBuilderWizard({
  onSubmit,
  failures = [],
  busy = false,
}: {
  readonly onSubmit?: (request: ReturnType<typeof toAuthoredModuleRequest>) => void;
  readonly failures?: readonly AuthoredModuleValidationFailureResponse[];
  readonly busy?: boolean;
}): React.JSX.Element {
  const intl = useIntl();
  const [state, setState] = useState<DescriptorWizardState>(initialDescriptorWizard);
  const problems = stepProblems(state);

  function patch(next: Partial<DescriptorWizardState>): void {
    setState((current) => ({ ...current, ...next }));
  }

  const isLastStep = state.step === 'winCondition';
  // Rendered only on the last step, so the wizard does not serialize the whole
  // document on every keystroke of every earlier one.
  const authoredDocument = isLastStep
    ? JSON.stringify(toAuthoredModuleRequest(state).document, undefined, 2)
    : '';
  const documentFilename = `${state.alias === undefined || state.alias === '' ? 'discipline' : state.alias}.json`;

  return (
    <section
      aria-label={intl.formatMessage(messages.descriptorWizardTitle)}
      className="cl-form-screen"
    >
      <header className="cl-form-screen__header">
        <h1 className="cl-form-screen__title">
          <FormattedMessage {...messages.descriptorWizardTitle} />
        </h1>
        <div
          className="cl-stat-tile cl-chamfer cl-chamfer--control"
          data-testid="descriptor-wizard-progress"
        >
          <strong className="cl-stat-tile__value">{progress(state)}%</strong>
        </div>
      </header>

      <Card className="cl-chamfer cl-chamfer--control">
        <ol
          aria-label={intl.formatMessage(messages.descriptorWizardSteps)}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6rem), 1fr))',
            gap: 'var(--cl-space-3)',
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {DESCRIPTOR_STEPS.map((step, index) => (
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
            <FormField
              id="descriptor-alias"
              label={intl.formatMessage(messages.descriptorFieldAlias)}
            >
              <Input
                aria-describedby="descriptor-alias-hint"
                id="descriptor-alias"
                onChange={(event) => patch({ alias: event.target.value })}
                value={state.alias}
              />
              <DecisionHint
                id="descriptor-alias-hint"
                text={intl.formatMessage(messages.descriptorDecisionAlias)}
              />
            </FormField>
            <FormField
              id="descriptor-version"
              label={intl.formatMessage(messages.descriptorFieldVersion)}
            >
              <Input
                id="descriptor-version"
                onChange={(event) => patch({ version: event.target.value })}
                value={state.version}
              />
            </FormField>
            <LocalizedField
              draft={state.name}
              id="descriptor-name"
              label={intl.formatMessage(messages.descriptorFieldName)}
              onChange={(name) => patch({ name })}
            />
            <LocalizedField
              draft={state.description}
              id="descriptor-description"
              label={intl.formatMessage(messages.descriptorFieldDescription)}
              onChange={(description) => patch({ description })}
              required={false}
            />
          </div>
        )}

        {state.step === 'authorship' && (
          <div className="cl-platform-form-grid">
            <FormField
              id="descriptor-author"
              label={intl.formatMessage(messages.descriptorFieldAuthor)}
            >
              <Input
                aria-describedby="descriptor-author-hint"
                id="descriptor-author"
                onChange={(event) => patch({ author: event.target.value })}
                value={state.author}
              />
              <DecisionHint
                id="descriptor-author-hint"
                text={intl.formatMessage(messages.descriptorDecisionAuthor)}
              />
            </FormField>
            <FormField
              id="descriptor-licence"
              label={intl.formatMessage(messages.descriptorFieldLicence)}
            >
              <Input
                aria-describedby="descriptor-licence-hint"
                id="descriptor-licence"
                onChange={(event) => patch({ licence: event.target.value })}
                value={state.licence}
              />
              <DecisionHint
                id="descriptor-licence-hint"
                text={intl.formatMessage(messages.descriptorDecisionLicence)}
              />
            </FormField>
            <FormField
              id="descriptor-source-url"
              label={intl.formatMessage(messages.descriptorFieldSourceUrl)}
            >
              <Input
                id="descriptor-source-url"
                onChange={(event) => patch({ sourceUrl: event.target.value })}
                value={state.sourceUrl}
              />
            </FormField>
          </div>
        )}

        {state.step === 'participants' && (
          <div className="cl-platform-form-grid">
            <FormField
              id="descriptor-participant-types"
              label={intl.formatMessage(messages.descriptorFieldParticipantTypes)}
            >
              <div
                aria-describedby="descriptor-participant-types-hint"
                style={{ display: 'flex', gap: 'var(--cl-space-3)' }}
              >
                {(['individual', 'team'] as const).map((type) => (
                  <label
                    key={type}
                    className="cl-toggle cl-focusable"
                    style={{ display: 'flex', gap: 'var(--cl-space-2)' }}
                  >
                    <Checkbox
                      aria-label={type}
                      checked={state.participantTypes.includes(type)}
                      id={`descriptor-participant-type-${type}`}
                      onCheckedChange={(checked) =>
                        patch({
                          participantTypes: checked
                            ? [...state.participantTypes, type]
                            : state.participantTypes.filter((one) => one !== type),
                        })
                      }
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
              <DecisionHint
                id="descriptor-participant-types-hint"
                text={intl.formatMessage(messages.descriptorDecisionParticipantTypes)}
              />
            </FormField>
            <FormField
              id="descriptor-min-players"
              label={intl.formatMessage(messages.descriptorFieldMinPlayers)}
            >
              <Input
                id="descriptor-min-players"
                min={1}
                onChange={(event) => patch({ minPlayers: Number(event.target.value) })}
                type="number"
                value={state.minPlayers}
              />
            </FormField>
            <FormField
              id="descriptor-max-players"
              label={intl.formatMessage(messages.descriptorFieldMaxPlayers)}
            >
              <Input
                aria-describedby="descriptor-max-players-hint"
                id="descriptor-max-players"
                min={1}
                onChange={(event) => patch({ maxPlayers: Number(event.target.value) })}
                type="number"
                value={state.maxPlayers}
              />
              <DecisionHint
                id="descriptor-max-players-hint"
                text={intl.formatMessage(messages.descriptorDecisionRosterConstraints)}
              />
            </FormField>
            <label
              className="cl-toggle cl-focusable"
              style={{ display: 'flex', gap: 'var(--cl-space-2)' }}
            >
              <Checkbox
                aria-label={intl.formatMessage(messages.descriptorFieldAllowMidTournamentChanges)}
                checked={state.allowMidTournamentChanges}
                id="descriptor-mid-tournament-changes"
                onCheckedChange={(checked) => patch({ allowMidTournamentChanges: checked })}
              />
              <span>
                <FormattedMessage {...messages.descriptorFieldAllowMidTournamentChanges} />
              </span>
            </label>

            <div style={{ gridColumn: '1 / -1' }}>
              <h3>
                <FormattedMessage {...messages.descriptorSegmentTypesHeading} />
              </h3>
              <DecisionHint
                id="descriptor-segment-types-hint"
                text={intl.formatMessage(messages.descriptorDecisionSegmentTypes)}
              />
              <SegmentTypeList
                onAdd={(segment) => patch({ segmentTypes: [...state.segmentTypes, segment] })}
                onRemove={(index) =>
                  patch({ segmentTypes: state.segmentTypes.filter((_segment, i) => i !== index) })
                }
                segments={state.segmentTypes}
              />
            </div>
          </div>
        )}

        {state.step === 'statistics' && (
          <div style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
            <div>
              <h3>
                <FormattedMessage {...messages.descriptorStatisticsHeading} />
              </h3>
              <DecisionHint
                id="descriptor-statistics-hint"
                text={intl.formatMessage(messages.descriptorDecisionStatistics)}
              />
              <StatisticList
                onAdd={(statistic) => patch({ statistics: [...state.statistics, statistic] })}
                onRemove={(index) =>
                  patch({ statistics: state.statistics.filter((_statistic, i) => i !== index) })
                }
                statistics={state.statistics}
              />
            </div>
            <div>
              <h3>
                <FormattedMessage {...messages.descriptorEventsHeading} />
              </h3>
              <DecisionHint
                id="descriptor-events-hint"
                text={intl.formatMessage(messages.descriptorDecisionEvents)}
              />
              <EventDefinitionList
                events={state.eventDefinitions}
                onAdd={(event) => patch({ eventDefinitions: [...state.eventDefinitions, event] })}
                onRemove={(index) =>
                  patch({
                    eventDefinitions: state.eventDefinitions.filter((_event, i) => i !== index),
                  })
                }
                segmentTypes={state.segmentTypes}
                statistics={state.statistics}
              />
            </div>
          </div>
        )}

        {state.step === 'formats' && (
          <div className="cl-platform-form-grid">
            <FormField
              id="descriptor-formats"
              label={intl.formatMessage(messages.descriptorFieldAvailableFormats)}
            >
              <div
                aria-describedby="descriptor-formats-hint"
                style={{ display: 'grid', gap: 'var(--cl-space-2)' }}
              >
                {TOURNAMENT_FORMATS.map((format) => (
                  <label
                    key={format}
                    className="cl-toggle cl-focusable"
                    style={{ display: 'flex', gap: 'var(--cl-space-2)' }}
                  >
                    <Checkbox
                      aria-label={format}
                      checked={state.availableFormats.includes(format)}
                      id={`descriptor-format-${format}`}
                      onCheckedChange={(checked) =>
                        patch({
                          availableFormats: checked
                            ? [...state.availableFormats, format]
                            : state.availableFormats.filter((one) => one !== format),
                        })
                      }
                    />
                    <span>{format}</span>
                  </label>
                ))}
              </div>
              <DecisionHint
                id="descriptor-formats-hint"
                text={intl.formatMessage(messages.descriptorDecisionFormats)}
              />
            </FormField>
            <div style={{ gridColumn: '1 / -1' }}>
              <h3>
                <FormattedMessage {...messages.descriptorScoringInputsHeading} />
              </h3>
              <DecisionHint
                id="descriptor-scoring-inputs-hint"
                text={intl.formatMessage(messages.descriptorDecisionScoringInputs)}
              />
              <ScoringInputList
                inputs={state.scoringInputs}
                onAdd={(input) => patch({ scoringInputs: [...state.scoringInputs, input] })}
                onRemove={(index) =>
                  patch({ scoringInputs: state.scoringInputs.filter((_input, i) => i !== index) })
                }
              />
            </div>
          </div>
        )}

        {state.step === 'winCondition' && (
          <div className="cl-platform-form-grid">
            <FormField
              id="descriptor-win-condition-mode"
              label={intl.formatMessage(messages.descriptorFieldWinConditionMode)}
            >
              <Select
                aria-describedby="descriptor-win-condition-mode-hint"
                aria-label={intl.formatMessage(messages.descriptorFieldWinConditionMode)}
                id="descriptor-win-condition-mode"
                onValueChange={(val) =>
                  patch({
                    winConditionMode: val as DescriptorWizardState['winConditionMode'],
                  })
                }
                options={[
                  {
                    value: 'simple',
                    label: intl.formatMessage(messages.descriptorWinConditionModeSimple),
                  },
                  {
                    value: 'segmented',
                    label: intl.formatMessage(messages.descriptorWinConditionModeSegmented),
                  },
                ]}
                value={state.winConditionMode}
              />
              <DecisionHint
                id="descriptor-win-condition-mode-hint"
                text={intl.formatMessage(messages.descriptorDecisionWinConditionMode)}
              />
            </FormField>

            {state.winConditionMode === 'segmented' && (
              <>
                <FormField
                  id="descriptor-segment-margin"
                  label={intl.formatMessage(messages.descriptorFieldSegmentMargin)}
                >
                  <Input
                    id="descriptor-segment-margin"
                    min={0}
                    onChange={(event) =>
                      patch({
                        segmentMargin:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                    type="number"
                    value={state.segmentMargin ?? ''}
                  />
                </FormField>
                <FormField
                  id="descriptor-segment-name"
                  label={intl.formatMessage(messages.descriptorFieldSegmentName)}
                >
                  <Select
                    aria-label={intl.formatMessage(messages.descriptorFieldSegmentName)}
                    id="descriptor-segment-name"
                    onValueChange={(val) => patch({ segmentName: val })}
                    options={[
                      { value: '', label: '' },
                      ...state.segmentTypes.map((segment) => ({
                        value: segment.name,
                        label: segment.name,
                      })),
                    ]}
                    value={state.segmentName}
                  />
                </FormField>
                <FormField
                  id="descriptor-segment-target"
                  label={intl.formatMessage(messages.descriptorFieldSegmentTarget)}
                >
                  <Input
                    id="descriptor-segment-target"
                    min={1}
                    onChange={(event) =>
                      patch({
                        segmentTarget:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                    type="number"
                    value={state.segmentTarget ?? ''}
                  />
                </FormField>
                <FormField
                  id="descriptor-tiebreak-at"
                  label={intl.formatMessage(messages.descriptorFieldTiebreakAt)}
                >
                  <Input
                    id="descriptor-tiebreak-at"
                    min={0}
                    onChange={(event) =>
                      patch({
                        tiebreakAt:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                    type="number"
                    value={state.tiebreakAt ?? ''}
                  />
                </FormField>
                <FormField
                  id="descriptor-tiebreak-target"
                  label={intl.formatMessage(messages.descriptorFieldTiebreakTarget)}
                >
                  <Input
                    id="descriptor-tiebreak-target"
                    min={0}
                    onChange={(event) =>
                      patch({
                        tiebreakTarget:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                    type="number"
                    value={state.tiebreakTarget ?? ''}
                  />
                </FormField>
                <FormField
                  id="descriptor-tiebreak-margin"
                  label={intl.formatMessage(messages.descriptorFieldTiebreakMargin)}
                >
                  <Input
                    id="descriptor-tiebreak-margin"
                    min={0}
                    onChange={(event) =>
                      patch({
                        tiebreakMargin:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                    type="number"
                    value={state.tiebreakMargin ?? ''}
                  />
                </FormField>
              </>
            )}

            <FormField
              id="descriptor-win-match-unit"
              label={intl.formatMessage(
                state.winConditionMode === 'simple'
                  ? messages.descriptorFieldWinMatchUnitSimple
                  : messages.descriptorFieldWinMatchUnitSegmented,
              )}
            >
              <Input
                aria-describedby="descriptor-win-match-unit-hint"
                id="descriptor-win-match-unit"
                onChange={(event) => patch({ winMatchUnit: event.target.value })}
                value={state.winMatchUnit}
              />
              <DecisionHint
                id="descriptor-win-match-unit-hint"
                text={intl.formatMessage(messages.descriptorDecisionWinMatchUnit)}
              />
            </FormField>
            <FormField
              id="descriptor-win-match-target"
              label={intl.formatMessage(messages.descriptorFieldWinMatchTarget)}
            >
              <Input
                aria-describedby="descriptor-win-match-target-hint"
                id="descriptor-win-match-target"
                min={0}
                onChange={(event) =>
                  patch({
                    winMatchTarget:
                      event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
                type="number"
                value={state.winMatchTarget ?? ''}
              />
              <DecisionHint
                id="descriptor-win-match-target-hint"
                text={intl.formatMessage(messages.descriptorDecisionWinMatchTarget)}
              />
            </FormField>
          </div>
        )}

        {problems.length > 0 && (
          <Alert block className="cl-inline-alert--spaced" tone="destructive">
            <ul>
              {problems.map((problem) => (
                <li key={problem.id}>{intl.formatMessage(problem)}</li>
              ))}
            </ul>
          </Alert>
        )}

        {failures.length > 0 && (
          <Alert
            block
            className="cl-inline-alert--spaced"
            testId="descriptor-server-failures"
            tone="destructive"
          >
            <ul>
              {failures.map((failure, index) => (
                <li key={`${failure.stage}-${failure.field ?? index}`}>
                  [{failure.stage}
                  {failure.field ? `:${failure.field}` : ''}] {failure.message}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {/*
          The document itself, on the step that installs it. Versioned modules
          are JSON in this repository's own model, so an author about to install
          one wants the file — to read before committing to it, and to keep
          under version control afterwards. It is shown, never generated on the
          side: this is `toAuthoredModuleRequest`'s own document, the same bytes
          the button below submits.
        */}
        {isLastStep && (
          <TerminalBlock
            code={authoredDocument}
            codeRegionLabel={intl.formatMessage(messages.descriptorDocumentRegion)}
            copiedLabel={intl.formatMessage(messages.descriptorDocumentCopied)}
            copyFailedLabel={intl.formatMessage(messages.descriptorDocumentCopyFailed)}
            copyLabel={intl.formatMessage(messages.descriptorDocumentCopy)}
            language="json"
            title={documentFilename}
            variant="file"
          />
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
            <FormattedMessage {...messages.descriptorBack} />
          </Button>
          {isLastStep ? (
            <Button
              disabled={busy || !canContinue(state) || !canSubmit(state)}
              onClick={() => onSubmit?.(toAuthoredModuleRequest(state))}
              type="button"
            >
              <FormattedMessage {...messages.descriptorAuthorAndInstall} />
            </Button>
          ) : (
            <Button
              disabled={!canContinue(state)}
              onClick={() => patch({ step: nextStep(state) })}
              type="button"
            >
              <FormattedMessage {...messages.descriptorContinue} />
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
  readonly draft: DescriptorWizardState['name'];
  readonly onChange: (draft: DescriptorWizardState['name']) => void;
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
      <p style={{ margin: 0, color: 'var(--cl-text-secondary)' }}>
        <FormattedMessage {...messages.descriptorTranslationHelp} />
      </p>
    </FormField>
  );
}

function SegmentTypeList({
  segments,
  onAdd,
  onRemove,
}: {
  readonly segments: readonly SegmentTypeDraft[];
  readonly onAdd: (segment: SegmentTypeDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{
    name: string;
    label: string;
    timed: boolean;
    defaultDurationSeconds: string;
  }>({ name: '', label: '', timed: false, defaultDurationSeconds: '' });
  return (
    <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
      {segments.length > 0 && (
        <ul>
          {segments.map((segment, index) => (
            <li key={`${segment.name}-${index}`}>
              {segment.name} — {segment.label} ({segment.timed ? 'timed' : 'untimed'})
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.descriptorRemove} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldSegmentTypeName)}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldSegmentTypeName)}
          value={draft.name}
        />
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldSegmentTypeLabel)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldSegmentTypeLabel)}
          value={draft.label}
        />
        <label
          className="cl-toggle cl-focusable"
          style={{ display: 'flex', gap: 'var(--cl-space-2)' }}
        >
          <Checkbox
            aria-label={intl.formatMessage(messages.descriptorFieldSegmentTimed)}
            checked={draft.timed}
            id="descriptor-segment-timed"
            onCheckedChange={(checked) => setDraft({ ...draft, timed: checked })}
          />
          <span>
            <FormattedMessage {...messages.descriptorFieldSegmentTimed} />
          </span>
        </label>
        <Button
          disabled={draft.name.trim() === '' || draft.label.trim() === ''}
          onClick={() => {
            onAdd({
              name: draft.name.trim(),
              label: draft.label.trim(),
              timed: draft.timed,
              ...(draft.defaultDurationSeconds.trim() === ''
                ? {}
                : { defaultDurationSeconds: Number(draft.defaultDurationSeconds) }),
            });
            setDraft({ name: '', label: '', timed: false, defaultDurationSeconds: '' });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.descriptorAdd} />
        </Button>
      </div>
    </div>
  );
}

function StatisticList({
  statistics,
  onAdd,
  onRemove,
}: {
  readonly statistics: readonly StatisticDraft[];
  readonly onAdd: (statistic: StatisticDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{
    code: string;
    label: string;
    aggregation: StatisticDraft['aggregation'];
  }>({ code: '', label: '', aggregation: 'sum' });
  return (
    <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
      {statistics.length > 0 && (
        <ul>
          {statistics.map((statistic, index) => (
            <li key={`${statistic.code}-${index}`}>
              {statistic.code} — {statistic.label} ({statistic.aggregation})
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.descriptorRemove} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldStatisticCode)}
          onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldStatisticCode)}
          value={draft.code}
        />
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldStatisticLabel)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldStatisticLabel)}
          value={draft.label}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldAggregation)}
          id="descriptor-statistic-aggregation"
          onValueChange={(val) =>
            setDraft({ ...draft, aggregation: val as StatisticDraft['aggregation'] })
          }
          options={AGGREGATION_MODES.map((mode) => ({
            value: mode,
            label: mode,
          }))}
          value={draft.aggregation}
        />
        <Button
          disabled={draft.code.trim() === '' || draft.label.trim() === ''}
          onClick={() => {
            onAdd({
              code: draft.code.trim(),
              label: draft.label.trim(),
              aggregation: draft.aggregation,
            });
            setDraft({ code: '', label: '', aggregation: 'sum' });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.descriptorAdd} />
        </Button>
      </div>
    </div>
  );
}

function EventDefinitionList({
  events,
  statistics,
  segmentTypes,
  onAdd,
  onRemove,
}: {
  readonly events: readonly EventDefinitionDraft[];
  readonly statistics: readonly StatisticDraft[];
  readonly segmentTypes: readonly SegmentTypeDraft[];
  readonly onAdd: (event: EventDefinitionDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{
    code: string;
    label: string;
    category: EventDefinitionDraft['category'];
    actorRequirement: EventDefinitionDraft['actorRequirement'];
    permittedSegmentTypes: readonly string[];
    awardsStatisticCode: string;
    awardsDelta: string;
  }>({
    code: '',
    label: '',
    category: 'positive',
    actorRequirement: 'side',
    permittedSegmentTypes: [],
    awardsStatisticCode: '',
    awardsDelta: '1',
  });
  return (
    <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
      {events.length > 0 && (
        <ul>
          {events.map((event, index) => (
            <li key={`${event.code}-${index}`}>
              {event.code} — {event.label} ({event.category})
              {event.awardsStatisticCode
                ? ` → +${event.awardsDelta} ${event.awardsStatisticCode}`
                : ''}
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.descriptorRemove} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldEventCode)}
          onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldEventCode)}
          value={draft.code}
        />
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldEventLabel)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldEventLabel)}
          value={draft.label}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldEventCategory)}
          id="descriptor-event-category"
          onValueChange={(val) =>
            setDraft({ ...draft, category: val as EventDefinitionDraft['category'] })
          }
          options={EVENT_CATEGORIES.map((category) => ({
            value: category,
            label: category,
          }))}
          value={draft.category}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldEventActorRequirement)}
          id="descriptor-event-actor-requirement"
          onValueChange={(val) =>
            setDraft({
              ...draft,
              actorRequirement: val as EventDefinitionDraft['actorRequirement'],
            })
          }
          options={ACTOR_REQUIREMENTS.map((requirement) => ({
            value: requirement,
            label: requirement,
          }))}
          value={draft.actorRequirement}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldEventAwardsStatistic)}
          id="descriptor-event-awards-statistic"
          onValueChange={(val) => setDraft({ ...draft, awardsStatisticCode: val })}
          options={[
            { value: '', label: intl.formatMessage(messages.descriptorEventAwardsNone) },
            ...statistics.map((statistic) => ({
              value: statistic.code,
              label: statistic.code,
            })),
          ]}
          value={draft.awardsStatisticCode}
        />
        {draft.awardsStatisticCode !== '' && (
          <Input
            aria-label={intl.formatMessage(messages.descriptorFieldEventAwardsDelta)}
            onChange={(event) => setDraft({ ...draft, awardsDelta: event.target.value })}
            type="number"
            value={draft.awardsDelta}
          />
        )}
        {segmentTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--cl-space-2)', flexWrap: 'wrap' }}>
            {segmentTypes.map((segment) => (
              <label
                key={segment.name}
                className="cl-toggle cl-focusable"
                style={{ display: 'flex', gap: 'var(--cl-space-2)' }}
              >
                <Checkbox
                  aria-label={segment.name}
                  checked={draft.permittedSegmentTypes.includes(segment.name)}
                  id={`descriptor-permitted-segment-${segment.name}`}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      permittedSegmentTypes: checked
                        ? [...draft.permittedSegmentTypes, segment.name]
                        : draft.permittedSegmentTypes.filter((name) => name !== segment.name),
                    })
                  }
                />
                <span>{segment.name}</span>
              </label>
            ))}
          </div>
        )}
        <Button
          disabled={draft.code.trim() === '' || draft.label.trim() === ''}
          onClick={() => {
            onAdd({
              code: draft.code.trim(),
              label: draft.label.trim(),
              category: draft.category,
              actorRequirement: draft.actorRequirement,
              permittedSegmentTypes: draft.permittedSegmentTypes,
              awardsDelta: Number(draft.awardsDelta) || 1,
              ...(draft.awardsStatisticCode === ''
                ? {}
                : { awardsStatisticCode: draft.awardsStatisticCode }),
            });
            setDraft({
              code: '',
              label: '',
              category: 'positive',
              actorRequirement: 'side',
              permittedSegmentTypes: [],
              awardsStatisticCode: '',
              awardsDelta: '1',
            });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.descriptorAdd} />
        </Button>
      </div>
    </div>
  );
}

function ScoringInputList({
  inputs,
  onAdd,
  onRemove,
}: {
  readonly inputs: readonly ScoringInputDraft[];
  readonly onAdd: (input: ScoringInputDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{
    code: string;
    label: string;
    source: ScoringInputDraft['source'];
  }>({
    code: '',
    label: '',
    source: 'event-derived',
  });
  return (
    <div style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
      {inputs.length > 0 && (
        <ul>
          {inputs.map((input, index) => (
            <li key={`${input.code}-${index}`}>
              {input.code} — {input.label} ({input.source})
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.descriptorRemove} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldScoringInputCode)}
          onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldScoringInputCode)}
          value={draft.code}
        />
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldScoringInputLabel)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldScoringInputLabel)}
          value={draft.label}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldScoringInputSource)}
          id="descriptor-scoring-input-source"
          onValueChange={(val) =>
            setDraft({ ...draft, source: val as ScoringInputDraft['source'] })
          }
          options={[
            { value: 'event-derived', label: 'event-derived' },
            { value: 'operator-entered', label: 'operator-entered' },
          ]}
          value={draft.source}
        />
        <Button
          disabled={draft.code.trim() === '' || draft.label.trim() === ''}
          onClick={() => {
            onAdd({ code: draft.code.trim(), label: draft.label.trim(), source: draft.source });
            setDraft({ code: '', label: '', source: 'event-derived' });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.descriptorAdd} />
        </Button>
      </div>
    </div>
  );
}
