import { useRef } from 'react';
import { FormattedMessage, type IntlShape } from 'react-intl';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { DecisionHint } from '../ui/atoms/decision-hint.js';
import { Field } from '../ui/molecules/field.js';
import { StageListEditor } from '../StageListEditor.js';
import { RulesetFieldControl } from '../ui/molecules/ruleset-field-control.js';
import { fieldValueAt } from '../../lib/discipline-summary.js';
import { isSupportedLanguage, resolveFieldPolicyLabel } from '@copalibre/domain';
import {
  type DisciplineOption,
  type TournamentProfileOption,
  type WizardState,
} from '../../lib/wizard.js';
import { initialStages } from '../../lib/stage-authoring.js';
import { messages } from '../../i18n/messages.en.js';
import { localizedText } from '../../../lib/localized-label.js';
import { formatDateTimeInputHint } from '../../lib/presentation-formatting.js';

/** Fields the wizard's own dedicated steps already capture — excluded from the generic list. */
const RESERVED_RULESET_FIELDS = new Set([
  'format',
  'registration.publicOpen',
  'registration.requiresCheckIn',
  'registration.checkInClosesAt',
  'registration.region',
  'registration.capacity',
]);

export function FormatStep({
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
                    ...(stage.groupConfiguration === undefined
                      ? {}
                      : { groupConfiguration: stage.groupConfiguration }),
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
            <StageListEditor
              capacity={state.capacity}
              formats={formats}
              readOnly
              showAllocation
              showStructurePreview
              stages={state.stages}
            />
          </div>
        ) : (
          <StageListEditor
            capacity={state.capacity}
            formatHintText={formatHintText}
            formats={formats}
            onChange={(stages) => patch({ stages })}
            showAllocation
            showSeries
            showStructurePreview
            showZones
            stages={state.stages}
          />
        )}
      </div>
    </div>
  );
}

/**
 * A typed control per discipline-declared ruleset field beyond format/
 * registration.*, reusing the typed `RulesetFieldControl`
 * unmodified. Distinct from `RulesStep` below: that step authors hook-script
 * automation (condition/action pairs); this one sets `RulesetConfig` values
 * the discipline itself declares (`scoring.pointsPerWin`, `tiebreakers`, …).
 */
export function RulesetStep({
  intl,
  patch,
  selectedDiscipline,
  state,
}: {
  readonly intl: IntlShape;
  readonly patch: (next: Partial<WizardState>) => void;
  readonly selectedDiscipline: DisciplineOption | undefined;
  readonly state: WizardState;
}): React.JSX.Element {
  const shortLocale = intl.locale.split('-')[0];
  const language = isSupportedLanguage(shortLocale) ? shortLocale : 'en';
  const fieldPolicies = selectedDiscipline?.fieldPolicies ?? {};
  const defaults = selectedDiscipline?.defaults ?? {};
  const eligibleFields = Object.keys(fieldPolicies).filter(
    (dotPath) =>
      !RESERVED_RULESET_FIELDS.has(dotPath) &&
      fieldPolicies[dotPath]?.permission.kind !== 'forbidden' &&
      fieldPolicies[dotPath]?.permission.kind !== 'inherited',
  );

  if (eligibleFields.length === 0) {
    return (
      <p>
        <FormattedMessage {...messages.wizardRulesetEmpty} />
      </p>
    );
  }

  return (
    <div className="cl-platform-form-grid">
      {eligibleFields.map((dotPath) => {
        const policy = fieldPolicies[dotPath];
        const label =
          policy !== undefined ? resolveFieldPolicyLabel(dotPath, policy, language) : dotPath;
        return (
          <Field id={`wizard-ruleset-${dotPath}`} key={dotPath} label={label}>
            <RulesetFieldControl
              addLabel={intl.formatMessage(messages.rulesetFieldListAdd)}
              availableFormats={selectedDiscipline?.supportedFormats ?? []}
              disciplineDefaultValue={fieldValueAt(defaults, dotPath)}
              dotPath={dotPath}
              id={`wizard-ruleset-${dotPath}`}
              inheritedHeading={intl.formatMessage(messages.rulesetFieldInheritedHeading)}
              label={label}
              onChange={(value) =>
                patch({ ruleOverrides: { ...state.ruleOverrides, [dotPath]: value } })
              }
              overrideValue={state.ruleOverrides[dotPath]}
              policy={policy}
              removeLabel={intl.formatMessage(messages.rulesetOverridesRemoveField)}
              selectPlaceholder={intl.formatMessage(messages.selectPlaceholder)}
              unknownTypeText={intl.formatMessage(messages.rulesetFieldUnknownType)}
              unrecognizedText={intl.formatMessage(messages.rulesetFieldUnrecognized)}
            />
          </Field>
        );
      })}
    </div>
  );
}

export function WindowStep({
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
          helpText={formatDateTimeInputHint(intl)}
          id="wizard-check-in-closes-at"
          label={intl.formatMessage(messages.wizardFieldCheckInClosesAt)}
        >
          <Input
            aria-describedby="wizard-check-in-closes-at-help wizard-check-in-closes-at-hint"
            id="wizard-check-in-closes-at"
            lang={intl.locale}
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
