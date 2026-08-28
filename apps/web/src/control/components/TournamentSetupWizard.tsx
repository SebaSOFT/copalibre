import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from './ui/atoms/button.js';
import { Card } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { Textarea } from './ui/atoms/textarea.js';
import { FormField } from './ui/molecules/form-field.js';
import {
  SERIES_RESOLUTION_CLASSES,
  WIZARD_STEPS,
  addCustomRule,
  canContinue,
  canAddCustomRule,
  elementOptionsKey,
  formatsFor,
  initialWizard,
  nextStep,
  parameterValueKey,
  previousStep,
  progress,
  removeCustomRule,
  stepProblems,
  toCreateRequest,
  type DisciplineOption,
  type SeriesResolutionClass,
  type TournamentProfileOption,
  type WizardState,
} from '../lib/wizard.js';
import type { HookScriptVocabulary, HookVocabularyEntry } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import { localizedText } from '../../lib/localized-label.js';

const EMPTY_PROFILES: readonly TournamentProfileOption[] = [];
const EMPTY_VOCABULARY: HookScriptVocabulary = { hooks: [], entries: [] };

/**
 * Each class answers a different question for the operator, so each gets its own
 * sentence rather than a bare enum value the wizard would otherwise render raw.
 */
const SERIES_CLASS_LABELS: Record<SeriesResolutionClass, typeof messages.wizardSeriesClassBestOf> =
  {
    'best-of': messages.wizardSeriesClassBestOf,
    aggregate: messages.wizardSeriesClassAggregate,
    'points-per-leg': messages.wizardSeriesClassPointsPerLeg,
  };

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
          format: firstDiscipline.supportedFormats[0],
        }),
  }));

  useEffect(() => {
    if (!loadProfiles || !state.descriptorId || !state.descriptorVersion) {
      return;
    }
    let live = true;
    loadProfiles(state.descriptorId, state.descriptorVersion, state.format)
      .then((loaded) => {
        if (live) setAsyncProfiles(loaded);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [loadProfiles, state.descriptorId, state.descriptorVersion, state.format]);

  const profiles = loadProfiles ? asyncProfiles : initialProfiles;

  const problems = stepProblems(state, disciplines, vocabulary);
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

  function patch(next: Partial<WizardState>): void {
    setState((current) => ({ ...current, ...next }));
  }

  function submit(): void {
    onSubmit?.(toCreateRequest(state, vocabulary));
  }

  return (
    <section aria-label={intl.formatMessage(messages.wizardTitle)} className="cl-form-screen">
      <header className="cl-form-screen__header">
        <div>
          <p className="cl-form-screen__breadcrumb">
            <FormattedMessage {...messages.wizardBreadcrumb} />
          </p>
          <h1 className="cl-form-screen__title">
            <FormattedMessage {...messages.wizardTitle} />
          </h1>
        </div>
        <div className="cl-stat-tile cl-chamfer cl-chamfer--control" data-testid="wizard-progress">
          <strong className="cl-stat-tile__value">{progress(state)}%</strong>
          <span>
            <FormattedMessage {...messages.wizardConfigured} />
          </span>
        </div>
      </header>

      <Card
        className="cl-chamfer cl-chamfer--control"
        style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}
      >
        <ol
          aria-label={intl.formatMessage(messages.wizardSteps)}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(8rem, 1fr))',
            gap: 'var(--cl-space-3)',
            listStyle: 'none',
            padding: 0,
            margin: 0,
            width: '100%',
            maxWidth: '100%',
            overflowX: 'auto',
            scrollbarGutter: 'stable',
          }}
        >
          {WIZARD_STEPS.map((step, index) => (
            <li
              key={step.id}
              style={{
                display: 'grid',
                gap: 'var(--cl-space-2)',
                justifyItems: 'center',
                color: 'var(--cl-text-secondary)',
                fontFamily: 'var(--cl-font-mono)',
                textTransform: 'uppercase',
                fontSize: 'var(--cl-font-size-xs)',
              }}
            >
              <span
                aria-current={step.id === state.step ? 'step' : undefined}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 32,
                  height: 32,
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor:
                    step.id === state.step ? 'var(--cl-state-live)' : 'var(--cl-border-muted)',
                  background: step.id === state.step ? 'var(--cl-state-live)' : 'transparent',
                  color: step.id === state.step ? 'var(--cl-surface-base)' : 'inherit',
                }}
              >
                {index + 1}
              </span>
              <span>{intl.formatMessage(step.label)}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="cl-chamfer cl-chamfer--control">
        {state.step === 'name' && (
          <div className="cl-platform-form-grid">
            <FormField id="wizard-name" label={intl.formatMessage(messages.wizardFieldName)}>
              <Input
                id="wizard-name"
                onChange={(event) => patch({ name: event.target.value })}
                value={state.name ?? ''}
              />
            </FormField>
            <FormField id="wizard-alias" label={intl.formatMessage(messages.wizardFieldAlias)}>
              <Input
                id="wizard-alias"
                onChange={(event) => patch({ alias: event.target.value })}
                value={state.alias ?? ''}
              />
            </FormField>
          </div>
        )}

        {state.step === 'discipline' && (
          <FormField
            id="wizard-discipline"
            label={intl.formatMessage(messages.wizardFieldDiscipline)}
          >
            <select
              className="cl-select cl-select--default cl-focusable"
              id="wizard-discipline"
              onChange={(event) => {
                const discipline = disciplines.find(
                  (one) => one.descriptorId === event.target.value,
                );
                patch({
                  descriptorId: discipline?.descriptorId,
                  descriptorVersion: discipline?.version,
                  format: discipline?.supportedFormats[0],
                  profileId: undefined,
                  profileVersion: undefined,
                });
              }}
              value={state.descriptorId ?? ''}
            >
              {disciplines.map((discipline) => (
                <option key={discipline.descriptorId} value={discipline.descriptorId}>
                  {localizedText(discipline.name, intl.locale)}
                  {discipline.description === undefined
                    ? ''
                    : ` — ${localizedText(discipline.description, intl.locale)}`}{' '}
                  · {discipline.version}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {state.step === 'format' && (
          <div className="cl-platform-form-grid">
            <FormField id="wizard-format" label={intl.formatMessage(messages.wizardFieldFormat)}>
              <select
                className="cl-select cl-select--default cl-focusable"
                id="wizard-format"
                onChange={(event) =>
                  patch({
                    format: event.target.value,
                    profileId: undefined,
                    profileVersion: undefined,
                  })
                }
                value={state.format ?? ''}
              >
                {formats.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </FormField>

            {profiles.length > 0 && (
              <FormField
                id="wizard-profile"
                label={intl.formatMessage(messages.wizardFieldProfile)}
              >
                <select
                  className="cl-select cl-select--default cl-focusable"
                  id="wizard-profile"
                  onChange={(event) => {
                    const selectedProfile = profiles.find(
                      (p) => p.profileId === event.target.value,
                    );
                    patch({
                      profileId: selectedProfile?.profileId,
                      profileVersion: selectedProfile?.version,
                    });
                  }}
                  value={state.profileId ?? ''}
                >
                  <option value="">{intl.formatMessage(messages.wizardProfileNone)}</option>
                  {profiles.map((profile) => (
                    <option key={profile.profileId} value={profile.profileId}>
                      {localizedText(profile.name, intl.locale)} (
                      {profile.stages.map((s) => s.name).join(' → ')}) · {profile.version}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <div style={{ display: 'grid', gap: 'var(--cl-space-4)', gridColumn: '1 / -1' }}>
              <label
                className="cl-toggle cl-focusable"
                htmlFor="wizard-enable-series"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}
              >
                <input
                  checked={state.seriesEnabled}
                  className="cl-checkbox cl-focusable"
                  id="wizard-enable-series"
                  onChange={(event) =>
                    patch({
                      seriesEnabled: event.target.checked,
                      // Defaults appear only once the operator opts in, so an
                      // untouched wizard submits no series at all.
                      ...(event.target.checked && state.seriesSpan === undefined
                        ? { seriesSpan: 3, seriesResolutionClass: 'best-of' as const }
                        : {}),
                    })
                  }
                  type="checkbox"
                />
                <span>
                  <FormattedMessage {...messages.wizardEnableSeries} />
                </span>
              </label>

              {!state.seriesEnabled && (
                <p style={{ margin: 0, color: 'var(--cl-text-secondary)' }}>
                  <FormattedMessage {...messages.wizardSeriesHelp} />
                </p>
              )}

              {state.seriesEnabled && (
                <div className="cl-platform-form-grid">
                  <FormField
                    id="wizard-series-span"
                    label={intl.formatMessage(messages.wizardFieldSeriesSpan)}
                  >
                    <Input
                      id="wizard-series-span"
                      inputMode="numeric"
                      min={2}
                      onChange={(event) =>
                        patch({
                          seriesSpan:
                            event.target.value === ''
                              ? undefined
                              : Number.parseInt(event.target.value, 10),
                        })
                      }
                      type="number"
                      value={state.seriesSpan ?? ''}
                    />
                  </FormField>

                  <FormField
                    id="wizard-series-class"
                    label={intl.formatMessage(messages.wizardFieldSeriesResolutionClass)}
                  >
                    <select
                      className="cl-select cl-select--default cl-focusable"
                      id="wizard-series-class"
                      onChange={(event) =>
                        patch({
                          seriesResolutionClass: event.target
                            .value as WizardState['seriesResolutionClass'],
                        })
                      }
                      value={state.seriesResolutionClass ?? ''}
                    >
                      {SERIES_RESOLUTION_CLASSES.map((resolutionClass) => (
                        <option key={resolutionClass} value={resolutionClass}>
                          {intl.formatMessage(SERIES_CLASS_LABELS[resolutionClass])}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <label
                    className="cl-toggle cl-focusable"
                    htmlFor="wizard-series-neutral-ground"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--cl-space-2)',
                      gridColumn: '1 / -1',
                    }}
                  >
                    <input
                      checked={state.seriesNeutralGround}
                      className="cl-checkbox cl-focusable"
                      id="wizard-series-neutral-ground"
                      onChange={(event) => patch({ seriesNeutralGround: event.target.checked })}
                      type="checkbox"
                    />
                    <span>
                      <FormattedMessage {...messages.wizardFieldSeriesNeutralGround} />
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {state.step === 'window' && (
          <div className="cl-platform-form-grid">
            <FormField id="wizard-region" label={intl.formatMessage(messages.wizardFieldRegion)}>
              <Input
                id="wizard-region"
                onChange={(event) => patch({ region: event.target.value })}
                value={state.region ?? ''}
              />
            </FormField>
            <FormField
              id="wizard-capacity"
              label={intl.formatMessage(messages.wizardFieldCapacity)}
            >
              <Input
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
            </FormField>
            <label
              className="cl-toggle cl-focusable"
              htmlFor="wizard-public-registration"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}
            >
              <input
                checked={state.publicRegistration}
                className="cl-checkbox cl-focusable"
                id="wizard-public-registration"
                onChange={(event) => patch({ publicRegistration: event.target.checked })}
                type="checkbox"
              />
              <span>
                <FormattedMessage {...messages.wizardPublicRegistration} />
              </span>
            </label>
            <label
              className="cl-toggle cl-focusable"
              htmlFor="wizard-requires-check-in"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}
            >
              <input
                checked={state.requiresCheckIn}
                className="cl-checkbox cl-focusable"
                id="wizard-requires-check-in"
                onChange={(event) => patch({ requiresCheckIn: event.target.checked })}
                type="checkbox"
              />
              <span>
                <FormattedMessage {...messages.wizardRequiresCheckIn} />
              </span>
            </label>
            {state.requiresCheckIn && (
              <FormField
                id="wizard-check-in-closes-at"
                label={intl.formatMessage(messages.wizardFieldCheckInClosesAt)}
              >
                <Input
                  id="wizard-check-in-closes-at"
                  onChange={(event) => patch({ checkInClosesAt: event.target.value })}
                  type="datetime-local"
                  value={state.checkInClosesAt ?? ''}
                />
              </FormField>
            )}
          </div>
        )}

        {state.step === 'rules' && (
          <div style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
            <label
              className="cl-toggle cl-focusable"
              htmlFor="wizard-enable-custom-rule"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}
            >
              <input
                checked={state.customRuleEnabled}
                className="cl-checkbox cl-focusable"
                id="wizard-enable-custom-rule"
                onChange={(event) => patch({ customRuleEnabled: event.target.checked })}
                type="checkbox"
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
                  <FormField
                    id="wizard-rule-condition"
                    label={intl.formatMessage(messages.wizardRuleCondition)}
                  >
                    <select
                      className="cl-select cl-select--default cl-focusable"
                      id="wizard-rule-condition"
                      onChange={(event) =>
                        patch({ customRuleConditionType: event.target.value || undefined })
                      }
                      value={state.customRuleConditionType ?? ''}
                    >
                      <option value="">
                        {intl.formatMessage(messages.wizardRuleConditionAlways)}
                      </option>
                      {conditions.map((entry) => (
                        <option key={entry.type} value={entry.type}>
                          {entry.type} — {entry.description}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    id="wizard-rule-action"
                    label={intl.formatMessage(messages.wizardRuleAction)}
                  >
                    <select
                      className="cl-select cl-select--default cl-focusable"
                      id="wizard-rule-action"
                      onChange={(event) =>
                        patch({ customRuleActionType: event.target.value || undefined })
                      }
                      value={state.customRuleActionType ?? ''}
                    >
                      <option value="">
                        {intl.formatMessage(messages.wizardRuleChooseAction)}
                      </option>
                      {actions.map((entry) => (
                        <option key={entry.type} value={entry.type}>
                          {entry.type} — {entry.description}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                {selectedCondition === undefined && (
                  <p className="cl-inline-alert">
                    <FormattedMessage {...messages.wizardRuleConditionlessExplanation} />
                  </p>
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
          </div>
        )}

        {problems.length > 0 && (
          <ul className="cl-inline-alert" style={{ marginTop: 'var(--cl-space-4)' }}>
            {problems.map((problem) => (
              <li key={problem.id}>{intl.formatMessage(problem)}</li>
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
            <FormattedMessage {...messages.wizardBack} />
          </Button>
          {state.step === 'window' ? (
            <Button
              disabled={!canContinue(state, disciplines, vocabulary)}
              onClick={submit}
              type="button"
            >
              <FormattedMessage {...messages.wizardCreate} />
            </Button>
          ) : (
            <Button
              disabled={!canContinue(state, disciplines, vocabulary)}
              onClick={() => patch({ step: nextStep(state) })}
              type="button"
            >
              <FormattedMessage {...messages.wizardContinue} />
            </Button>
          )}
        </footer>
      </Card>
    </section>
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
            <FormField id={key} key={key} label={label}>
              {Array.isArray(choices) ? (
                <select
                  className="cl-select cl-select--default cl-focusable"
                  id={key}
                  onChange={(event) => onValueChange(key, event.target.value)}
                  value={values[key] ?? ''}
                >
                  <option value="" />
                  {choices.map((choice) => (
                    <option key={String(choice)} value={String(choice)}>
                      {String(choice)}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={key}
                  onChange={(event) => onValueChange(key, event.target.value)}
                  placeholder={parameter.allowExpression ? '{{ event.payload.value }}' : undefined}
                  type={parameter.valueSchema['type'] === 'number' ? 'number' : 'text'}
                  value={values[key] ?? ''}
                />
              )}
            </FormField>
          );
        })}
        {entry.authoring?.optionsSchema && (
          <FormField id={`options-${entry.type}`} label={optionsLabel}>
            <Textarea
              aria-label={`${entry.type} options`}
              id={`options-${entry.type}`}
              onChange={(event) =>
                onOptionsChange(elementOptionsKey(kind, entry.type), event.target.value)
              }
              rows={4}
              value={options[elementOptionsKey(kind, entry.type)] ?? '{}'}
            />
          </FormField>
        )}
      </div>
    </fieldset>
  );
}
