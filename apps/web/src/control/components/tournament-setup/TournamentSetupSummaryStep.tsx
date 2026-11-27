import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '../ui/atoms/button.js';
import {
  TournamentSummary,
  type TournamentSummaryFacts,
} from '../ui/organisms/tournament-summary.js';
import { mergeOverrides } from '../../lib/discipline-summary.js';
import { type DisciplineOption, type WizardState } from '../../lib/wizard.js';
import { messages } from '../../i18n/messages.en.js';

/**
 * The wizard's final step: everything configured on every prior step,
 * rendered in plain language via `TournamentSummary` — no
 * new fetch, since every fact it needs is already in `state`/the selected
 * `DisciplineOption`. The `rules` section is available here (the
 * discipline's `defaults`/`fieldPolicies`, the wizard's own overlay via
 * `mergeOverrides`) — `segmentTypes`/`eventDefinitions` are never part of a
 * `DisciplineOption`, the same scope `TournamentRulesetTemplate` already
 * renders with. The explicit privacy choice is summarized beside those rules.
 */
export function SummaryStep({
  onReviewPrivacy,
  selectedDiscipline,
  state,
}: {
  readonly onReviewPrivacy: () => void;
  readonly selectedDiscipline: DisciplineOption | undefined;
  readonly state: WizardState;
}): React.JSX.Element {
  const intl = useIntl();
  const fieldPolicies = selectedDiscipline?.fieldPolicies ?? {};
  const defaults = selectedDiscipline?.defaults ?? {};
  const facts: TournamentSummaryFacts = {
    name: state.name ?? '',
    stages: state.stages.map((stage, index) => ({
      name: stage.name.trim() === '' ? `${index + 1}` : stage.name,
      format: stage.format,
      zones: (stage.zones ?? []).map((zone) => ({
        name: zone.name,
        format: zone.format ?? stage.format,
      })),
    })),
    publicRegistration: state.publicRegistration,
    requiresCheckIn: state.requiresCheckIn,
    ...(state.checkInClosesAt !== undefined ? { checkInClosesAt: state.checkInClosesAt } : {}),
    ...(state.region !== undefined && state.region.trim() !== '' ? { region: state.region } : {}),
    ...(state.capacity !== undefined ? { capacity: state.capacity } : {}),
  };
  return (
    <div className="cl-platform-form-grid">
      <TournamentSummary
        discipline={{
          fieldPolicies,
          defaults: mergeOverrides(defaults, state.ruleOverrides, fieldPolicies),
        }}
        facts={facts}
        sections={['rules']}
      />
      <section aria-labelledby="wizard-summary-privacy-heading">
        <h3 id="wizard-summary-privacy-heading">
          {intl.formatMessage(messages.settingsTabPrivacy)}
        </h3>
        <p>
          {intl.formatMessage(
            state.includesMinors
              ? messages.wizardIncludesMinorsYes
              : messages.wizardIncludesMinorsNo,
          )}
        </p>
        <p>{intl.formatMessage(messages.wizardIncludesMinorsHelp)}</p>
        <Button onClick={onReviewPrivacy} type="button" variant="secondary">
          <FormattedMessage {...messages.wizardSummaryReviewPrivacy} />
        </Button>
      </section>
    </div>
  );
}
