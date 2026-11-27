import { FormattedMessage, useIntl } from 'react-intl';
import { resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type {
  ConsoleEventDefinition,
  MatchConsoleApiClient,
  MatchConsoleResponse,
} from '../../lib/api-client.js';
import { currentEpochMilliseconds } from '../../lib/match-console.js';
import { formatEntrant } from '../../lib/presentation-formatting.js';
import { Alert } from '../ui/atoms/alert.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Field } from '../ui/molecules/field.js';
import { JerseyGrid } from '../JerseyGrid.js';
import { RosterSelectionStep } from '../RosterSelectionStep.js';
import { messages } from '../../i18n/messages.en.js';
import type { Dispatch, SetStateAction } from 'react';
import type { MatchConsoleSelection } from './use-match-console-selection.js';
import type { secondaryActorFieldsOf } from './match-console-model.js';
import type { sentOffPersonIds } from '../../lib/match-console.js';

export interface MatchConsoleRecordSectionProps {
  readonly api: MatchConsoleApiClient;
  readonly canRecord: boolean;
  readonly canSelectRoster: boolean;
  readonly conditionalEvent: ConsoleEventDefinition | undefined;
  readonly dismissedRosterNotice: boolean;
  readonly description: string;
  readonly language: SupportedLanguage;
  readonly matchId: string;
  readonly onRecord: (definition: ConsoleEventDefinition) => void;
  readonly onRecordFinal: (definition: ConsoleEventDefinition, occurredAt: number) => void;
  readonly onRosterSaved: () => void;
  readonly organizationAlias: string;
  readonly pendingOccurredAt: number | undefined;
  readonly permittedEvents: readonly ConsoleEventDefinition[];
  readonly projection: MatchConsoleResponse;
  readonly rosterStepOpen: boolean;
  readonly secondaryActorFields: ReturnType<typeof secondaryActorFieldsOf>;
  readonly selection: MatchConsoleSelection;
  readonly sentOff: ReturnType<typeof sentOffPersonIds>;
  readonly setDescription: Dispatch<SetStateAction<string>>;
  readonly setDismissedRosterNotice: Dispatch<SetStateAction<boolean>>;
  readonly setRosterStepOpen: Dispatch<SetStateAction<boolean>>;
  readonly tournamentAlias: string;
}

/** The record-event card: roster step, jersey grid, staff, event buttons, the outcome choice and the description. */
export function MatchConsoleRecordSection({
  api,
  canRecord,
  canSelectRoster,
  conditionalEvent,
  dismissedRosterNotice,
  description,
  language,
  matchId,
  onRecord,
  onRecordFinal,
  onRosterSaved,
  organizationAlias,
  pendingOccurredAt,
  permittedEvents,
  projection,
  rosterStepOpen,
  secondaryActorFields,
  selection,
  sentOff,
  setDescription,
  setDismissedRosterNotice,
  setRosterStepOpen,
  tournamentAlias,
}: MatchConsoleRecordSectionProps): React.JSX.Element {
  const intl = useIntl();
  const {
    activeSecondaryField,
    secondaryActorSelections,
    selectedPersonId,
    selectedSide,
    selectedStaffId,
    setActiveSecondaryField,
    setSecondaryActorSelections,
    setSelectedPersonId,
    setSelectedSide,
    setSelectedStaffId,
  } = selection;

  return (
    <>
      <Card className="cl-chamfer cl-chamfer--control">
        <header className="cl-card__header">
          <div className="cl-role-user">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.matchConsoleRecordEvent} />
            </h2>
            {canSelectRoster && (
              <Button
                onClick={() => setRosterStepOpen((open) => !open)}
                type="button"
                variant="secondary"
              >
                <FormattedMessage
                  {...(rosterStepOpen
                    ? messages.matchConsoleHideRosterStep
                    : projection.rosters.length > 0
                      ? messages.matchConsoleEditRoster
                      : messages.matchConsoleSelectRoster)}
                />
              </Button>
            )}
          </div>
        </header>
        <div className="cl-card__content">
          {rosterStepOpen && (
            <RosterSelectionStep
              api={api}
              entrants={projection.entrants}
              existingRosters={projection.rosters}
              matchId={matchId}
              onSaved={onRosterSaved}
              organizationAlias={organizationAlias}
              rosterRoles={projection.rosterRoles}
              tournamentAlias={tournamentAlias}
            />
          )}
          {projection.rosters.length > 0 ? (
            <JerseyGrid
              activeField={activeSecondaryField}
              disabled={!canRecord}
              onChangeActiveField={setActiveSecondaryField}
              onSelectPrimary={(entrantId, personId) => {
                setSelectedSide(entrantId);
                setSelectedPersonId(personId);
                setSelectedStaffId('');
              }}
              onSelectSecondary={(field, personId) =>
                setSecondaryActorSelections((current) => ({ ...current, [field]: personId }))
              }
              organizationAlias={organizationAlias}
              primaryPersonId={selectedPersonId}
              primarySide={selectedSide}
              rosterRoles={projection.rosterRoles}
              rosters={projection.rosters}
              secondaryFields={secondaryActorFields}
              secondarySelections={secondaryActorSelections}
              sentOffPersonIds={sentOff}
            />
          ) : (
            !rosterStepOpen && (
              <>
                {!dismissedRosterNotice && (
                  <Alert
                    dismissLabel={intl.formatMessage(messages.toastDismiss)}
                    onDismiss={() => setDismissedRosterNotice(true)}
                    tone="info"
                  >
                    <FormattedMessage {...messages.matchConsoleNoRosterSelected} />
                  </Alert>
                )}
                {canSelectRoster && (
                  <Button onClick={() => setRosterStepOpen(true)} type="button" variant="secondary">
                    <FormattedMessage {...messages.matchConsoleSelectRoster} />
                  </Button>
                )}
              </>
            )
          )}
          <div className="cl-platform-form-grid">
            <Field id="console-staff" label={intl.formatMessage(messages.matchConsoleStaff)}>
              <Select
                aria-label={intl.formatMessage(messages.matchConsoleEventStaff)}
                disabled={!canRecord || projection.eligibleStaffIds.length === 0}
                id="console-staff"
                onValueChange={(val) => {
                  setSelectedStaffId(val);
                  if (val) setSelectedPersonId('');
                }}
                options={[
                  {
                    value: '',
                    label: intl.formatMessage(messages.matchConsoleNoAttribution),
                  },
                  ...projection.eligibleStaffIds.map((personId) => ({
                    value: personId,
                    label: formatEntrant(intl, {
                      displayName: projection.eligibleStaff?.find(
                        (staff) => staff.personId === personId,
                      )?.displayName,
                    }).fullName,
                  })),
                ]}
                value={selectedStaffId}
              />
            </Field>
          </div>
          <div className="cl-role-user">
            {permittedEvents.map((definition) => (
              <Button
                disabled={!canRecord}
                key={definition.code}
                onClick={() => onRecord(definition)}
                style={{ borderColor: definition.display.color }}
                type="button"
                variant="secondary"
              >
                {resolveLabel(definition.label, language)}
              </Button>
            ))}
          </div>
          {conditionalEvent && (
            <Card
              aria-label={intl.formatMessage(messages.matchConsoleEventOutcome)}
              className="cl-chamfer cl-chamfer--control"
            >
              <strong>{resolveLabel(conditionalEvent.label, language)}</strong>
              <div className="cl-role-user">
                {conditionalEvent.workflow?.options.map((option) => {
                  const finalDefinition = projection.eventDefinitions.find(
                    (definition) => definition.code === option.definitionCode,
                  );
                  if (!finalDefinition) return null;
                  return (
                    <Button
                      disabled={!canRecord}
                      key={option.definitionCode}
                      onClick={() =>
                        onRecordFinal(
                          finalDefinition,
                          pendingOccurredAt ?? currentEpochMilliseconds(),
                        )
                      }
                      type="button"
                      variant="secondary"
                    >
                      {resolveLabel(option.label, language)}
                    </Button>
                  );
                })}
              </div>
            </Card>
          )}
          <Field
            id="console-description"
            label={intl.formatMessage(messages.matchConsoleDescription)}
          >
            <Input
              aria-label={intl.formatMessage(messages.matchConsoleEventDescription)}
              disabled={!canRecord}
              id="console-description"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </Field>
        </div>
      </Card>
    </>
  );
}
