import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from './ui/button.js';
import { Card } from './ui/card.js';
import {
  WIZARD_STEPS,
  canContinue,
  formatsFor,
  initialWizard,
  nextStep,
  previousStep,
  progress,
  stepProblems,
  toCreateRequest,
  type DisciplineOption,
  type TournamentProfileOption,
  type WizardState,
} from '../lib/wizard.js';
import { messages } from '../i18n/messages.en.js';
import { localizedText } from '../../lib/localized-label.js';

const EMPTY_PROFILES: readonly TournamentProfileOption[] = [];

export function TournamentSetupWizard({
  disciplines,
  profiles: initialProfiles = EMPTY_PROFILES,
  loadProfiles,
  onSubmit,
}: {
  readonly disciplines: readonly DisciplineOption[];
  readonly profiles?: readonly TournamentProfileOption[];
  readonly loadProfiles?: (
    descriptorId: string,
    version: string,
    format?: string,
  ) => Promise<readonly TournamentProfileOption[]>;
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

  const problems = stepProblems(state, disciplines);
  const formats = useMemo(
    () => formatsFor(disciplines, state.descriptorId),
    [disciplines, state.descriptorId],
  );

  function patch(next: Partial<WizardState>): void {
    setState((current) => ({ ...current, ...next }));
  }

  function submit(): void {
    onSubmit?.(toCreateRequest(state));
  }

  return (
    <section aria-label={intl.formatMessage(messages.wizardTitle)} style={stackStyle}>
      <header style={headerStyle}>
        <div>
          <p style={metaStyle}>
            <FormattedMessage {...messages.wizardBreadcrumb} />
          </p>
          <h1 style={titleStyle}>
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

      <Card>
        <ol aria-label={intl.formatMessage(messages.wizardSteps)} style={stepperStyle}>
          {WIZARD_STEPS.map((step, index) => (
            <li key={step.id} style={stepStyle}>
              <span
                aria-current={step.id === state.step ? 'step' : undefined}
                style={{
                  ...stepNumberStyle,
                  ...(step.id === state.step ? stepNumberActiveStyle : {}),
                }}
              >
                {index + 1}
              </span>
              <span>{intl.formatMessage(step.label)}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        {state.step === 'name' && (
          <div style={formGridStyle}>
            <Field label={intl.formatMessage(messages.wizardFieldName)}>
              <input
                aria-label={intl.formatMessage(messages.wizardFieldName)}
                className="cl-focusable"
                onChange={(event) => patch({ name: event.target.value })}
                style={fieldStyle}
                value={state.name ?? ''}
              />
            </Field>
            <Field label={intl.formatMessage(messages.wizardFieldAlias)}>
              <input
                aria-label={intl.formatMessage(messages.wizardFieldAlias)}
                className="cl-focusable"
                onChange={(event) => patch({ alias: event.target.value })}
                style={fieldStyle}
                value={state.alias ?? ''}
              />
            </Field>
          </div>
        )}

        {state.step === 'discipline' && (
          <Field label={intl.formatMessage(messages.wizardFieldDiscipline)}>
            <select
              aria-label={intl.formatMessage(messages.wizardFieldDiscipline)}
              className="cl-focusable"
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
              style={fieldStyle}
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
          </Field>
        )}

        {state.step === 'format' && (
          <div style={formGridStyle}>
            <Field label={intl.formatMessage(messages.wizardFieldFormat)}>
              <select
                aria-label={intl.formatMessage(messages.wizardFieldFormat)}
                className="cl-focusable"
                onChange={(event) =>
                  patch({
                    format: event.target.value,
                    profileId: undefined,
                    profileVersion: undefined,
                  })
                }
                style={fieldStyle}
                value={state.format ?? ''}
              >
                {formats.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </Field>

            {profiles.length > 0 && (
              <Field label={intl.formatMessage(messages.wizardFieldProfile)}>
                <select
                  aria-label={intl.formatMessage(messages.wizardFieldProfile)}
                  className="cl-focusable"
                  onChange={(event) => {
                    const selectedProfile = profiles.find(
                      (p) => p.profileId === event.target.value,
                    );
                    patch({
                      profileId: selectedProfile?.profileId,
                      profileVersion: selectedProfile?.version,
                    });
                  }}
                  style={fieldStyle}
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
              </Field>
            )}
          </div>
        )}

        {state.step === 'window' && (
          <div style={formGridStyle}>
            <Field label={intl.formatMessage(messages.wizardFieldRegion)}>
              <input
                aria-label={intl.formatMessage(messages.wizardFieldRegion)}
                className="cl-focusable"
                onChange={(event) => patch({ region: event.target.value })}
                style={fieldStyle}
                value={state.region ?? ''}
              />
            </Field>
            <Field label={intl.formatMessage(messages.wizardFieldCapacity)}>
              <input
                aria-label={intl.formatMessage(messages.wizardFieldCapacity)}
                className="cl-focusable"
                min={2}
                onChange={(event) =>
                  patch({
                    capacity: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
                style={fieldStyle}
                type="number"
                value={state.capacity ?? ''}
              />
            </Field>
            <label style={toggleStyle}>
              <input
                checked={state.publicRegistration}
                onChange={(event) => patch({ publicRegistration: event.target.checked })}
                type="checkbox"
              />
              <FormattedMessage {...messages.wizardPublicRegistration} />
            </label>
            <label style={toggleStyle}>
              <input
                checked={state.requiresCheckIn}
                onChange={(event) => patch({ requiresCheckIn: event.target.checked })}
                type="checkbox"
              />
              <FormattedMessage {...messages.wizardRequiresCheckIn} />
            </label>
            {state.requiresCheckIn && (
              <Field label={intl.formatMessage(messages.wizardFieldCheckInClosesAt)}>
                <input
                  aria-label={intl.formatMessage(messages.wizardFieldCheckInClosesAt)}
                  className="cl-focusable"
                  onChange={(event) => patch({ checkInClosesAt: event.target.value })}
                  style={fieldStyle}
                  type="datetime-local"
                  value={state.checkInClosesAt ?? ''}
                />
              </Field>
            )}
          </div>
        )}

        {problems.length > 0 && (
          <ul className="cl-inline-alert" style={problemStyle}>
            {problems.map((problem) => (
              <li key={problem.id}>{intl.formatMessage(problem)}</li>
            ))}
          </ul>
        )}

        <footer style={footerStyle}>
          <Button
            onClick={() => patch({ step: previousStep(state) })}
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.wizardBack} />
          </Button>
          {state.step === 'window' ? (
            <Button disabled={!canContinue(state, disciplines)} onClick={submit} type="button">
              <FormattedMessage {...messages.wizardCreate} />
            </Button>
          ) : (
            <Button
              disabled={!canContinue(state, disciplines)}
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

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label style={labelStyle}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const stackStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-6)' };
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--cl-space-4)',
  alignItems: 'end',
};
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
  fontSize: '3rem',
  textTransform: 'uppercase',
};
const metaStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--cl-state-live)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
};
const stepperStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 'var(--cl-space-3)',
  listStyle: 'none',
  padding: 0,
  margin: 0,
};
const stepStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-2)',
  justifyItems: 'center',
  color: 'var(--cl-text-secondary)',
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
};
const stepNumberStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 32,
  height: 32,
  borderWidth: 2,
  borderStyle: 'solid',
  borderColor: 'var(--cl-border-muted)',
};
const stepNumberActiveStyle: React.CSSProperties = {
  borderColor: 'var(--cl-state-live)',
  background: 'var(--cl-state-live)',
  color: 'var(--cl-surface-base)',
};
const formGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 'var(--cl-space-4)',
};
const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-2)',
  color: 'var(--cl-text-secondary)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
};
const fieldStyle: React.CSSProperties = {
  minHeight: 44,
  background: 'var(--cl-surface-base)',
  color: 'var(--cl-text-primary)',
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-3)',
  font: 'inherit',
};
const toggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-2)',
  color: 'var(--cl-text-primary)',
};
const problemStyle: React.CSSProperties = { marginTop: 'var(--cl-space-4)' };
const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--cl-space-3)',
  marginTop: 'var(--cl-space-6)',
};
