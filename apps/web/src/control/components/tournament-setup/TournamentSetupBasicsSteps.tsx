import { type IntlShape } from 'react-intl';
import { RadioGroup, RadioGroupItem } from '../ui/atoms/radio.js';
import { Label } from '../ui/atoms/label.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { DecisionHint } from '../ui/atoms/decision-hint.js';
import { Field } from '../ui/molecules/field.js';
import { WizardEmblemPane, type WizardEmblem } from '../WizardEmblemPane.js';
import { type DisciplineOption, type WizardState } from '../../lib/wizard.js';
import { initialStages } from '../../lib/stage-authoring.js';
import { messages } from '../../i18n/messages.en.js';
import { localizedText } from '../../../lib/localized-label.js';

/**
 * One component per wizard step, extracted from `TournamentSetupWizard`'s
 * render body: each step's own conditionals now count toward
 * its own function, not the wizard shell's, and the shell keeps only the
 * `state.step === '<name>' &&` gate that chooses among them.
 */
export function NameStep({
  emblem,
  intl,
  onEmblemChange,
  patch,
  state,
}: {
  readonly emblem: WizardEmblem | undefined;
  readonly intl: IntlShape;
  readonly onEmblemChange: (emblem: WizardEmblem | undefined) => void;
  readonly patch: (next: Partial<WizardState>) => void;
  readonly state: WizardState;
}): React.JSX.Element {
  // The same media-form split the tournament settings screen composes: the emblem beside the fields.
  return (
    <div className="cl-wizard-step-split">
      <WizardEmblemPane emblem={emblem} onChange={onEmblemChange} />
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
    </div>
  );
}

export function PrivacyStep({
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
      <div className="cl-form-field">
        <h3 id="wizard-includes-minors-label">
          {intl.formatMessage(messages.wizardIncludesMinorsQuestion)}
        </h3>
        <p className="cl-form-field__help" id="wizard-includes-minors-help">
          {intl.formatMessage(messages.wizardIncludesMinorsHelp)}
        </p>
        <RadioGroup
          aria-describedby="wizard-includes-minors-help"
          aria-labelledby="wizard-includes-minors-label"
          aria-required="true"
          onValueChange={(value) => patch({ includesMinors: value === 'yes' })}
          value={state.includesMinors === undefined ? '' : state.includesMinors ? 'yes' : 'no'}
        >
          <div>
            <RadioGroupItem id="wizard-includes-minors-yes" value="yes" />
            <Label htmlFor="wizard-includes-minors-yes">
              {intl.formatMessage(messages.wizardIncludesMinorsYes)}
            </Label>
          </div>
          <div>
            <RadioGroupItem id="wizard-includes-minors-no" value="no" />
            <Label htmlFor="wizard-includes-minors-no">
              {intl.formatMessage(messages.wizardIncludesMinorsNo)}
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}

export function DisciplineStep({
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
        placeholder={intl.formatMessage(messages.selectPlaceholder)}
        value={state.descriptorId ?? ''}
      />
      <DecisionHint
        id="wizard-discipline-hint"
        text={intl.formatMessage(messages.wizardDecisionDiscipline)}
      />
    </Field>
  );
}
