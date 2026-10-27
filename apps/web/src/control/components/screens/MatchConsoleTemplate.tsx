import { useContext, useEffect, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl, type IntlShape } from 'react-intl';
import { isSupportedLanguage, resolveLabel } from '@copalibre/domain';
import type {
  ConsoleEventDefinition,
  ConsoleMatchEvent,
  ConsoleSegment,
  MatchConsoleApiClient,
  MatchConsoleResponse,
  SegmentClockCommand,
} from '../../lib/api-client.js';
import {
  awaitingSourceText,
  currentEpochMilliseconds,
  formatClock,
  isEventPermitted,
  segmentLabel,
  sentOffPersonIds,
  undecidedSidesOf,
} from '../../lib/match-console.js';
import { sideSourceLabelsFromControlIntl } from '../../lib/matches-view-labels.js';
import { finalRoundOf } from '../../../lib/side-source.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { describeQueuedAction, type QueuedMutation } from '../../lib/offline-queue.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { Label } from '../ui/atoms/label.js';
import { RadioGroup, RadioGroupItem } from '../ui/atoms/radio.js';
import { Select } from '../ui/atoms/select.js';
import { Textarea } from '../ui/atoms/textarea.js';
import { Field } from '../ui/molecules/field.js';
import { FieldSet } from '../ui/molecules/field-set.js';
import { ClockRing } from '../ui/organisms/clock-ring.js';
import { BracketCanvas } from '../BracketCanvas.js';
import type { CanvasMatch } from '../../lib/bracket-canvas.js';
import { EntrantName } from '../../../components/ui/atoms/EntrantName.js';
import { ValueFlash } from '../../../components/ui/atoms/ValueFlash.js';
import { ResponsiveTimestamp } from '../../../components/ui/atoms/ResponsiveTimestamp.js';
import { JerseyGrid } from '../JerseyGrid.js';
import { RosterSelectionStep } from '../RosterSelectionStep.js';
import { MatchConsoleLayout } from '../ui/layouts/match-console-layout.js';
import { ConnectionStatus } from '../ui/organisms/connection-status.js';
import { LinkButton } from '../ui/atoms/link-button.js';
import { EventSyncMark, type EventSyncState } from '../ui/molecules/event-sync-mark.js';
import { messages } from '../../i18n/messages.en.js';
import type { ConsoleStatus } from '../pages/MatchConsolePage.js';
import { eventSyncKey } from '../../lib/match-console.js';
import { useEntryOnce } from '../../../lib/use-entry-once.js';
import { formatEntrant } from '../../lib/presentation-formatting.js';
import { PageHeaderContext } from '../ui/organisms/page-header.js';

/**
 * How many events stay visible with the ledger collapsed. Three is what makes
 * collapsing safe: the operator can confirm what they just recorded — and the
 * one before it, when a substitution and its card land together — without
 * spending the screen the recording controls need during play.
 */
const LEDGER_PEEK_COUNT = 3;

/**
 * Radix's `RadioGroup` treats an empty string value as "nothing selected,"
 * so the "no winner" option needs a real, non-empty sentinel — mapped back
 * to `''` (the actual unset state `finalizeWinner` carries) on change.
 */
const FINALIZE_NO_WINNER_VALUE = '__no-winner__';

export interface RecordEventContext {
  readonly selectedSide: string;
  readonly selectedPersonId: string;
  readonly selectedStaffId: string;
  readonly secondaryActorSelections: Readonly<Record<string, string>>;
  readonly description: string;
  readonly logNote: string;
}

/**
 * Composes the screen from data and callbacks `MatchConsolePage` supplies:
 * every field, filter and disclosure toggle below
 * is this component's own screen state, but nothing here reaches the API
 * client or a realtime subscription — a mutation is always a call to one of
 * the `on*` props, which the page turns into a queued, retried write.
 */
export function MatchConsoleTemplate({
  api,
  bracketMatches,
  finalizing,
  eventSyncStates = {},
  lastSyncedAt,
  matchId,
  onApplyClock,
  onCancelFinalize,
  onDismissMutation,
  onFinalize,
  onIssueClockCommand,
  onRecordEvent,
  onResolveTimer,
  onRosterSaved,
  online,
  organizationAlias,
  pendingMutations,
  projection,
  stale,
  status,
  tournamentAlias,
  tournamentName,
  tournamentNameLoading = false,
}: {
  readonly api: MatchConsoleApiClient;
  /** The match's stage bracket, for the "where this match sits" panel. Absent while loading. */
  readonly bracketMatches?: readonly CanvasMatch[];
  readonly finalizing: boolean;
  readonly eventSyncStates?: Readonly<
    Record<string, { readonly state: EventSyncState; readonly refusalReason?: string }>
  >;
  readonly lastSyncedAt: number | undefined;
  readonly matchId: string;
  readonly onApplyClock: (segmentId: string, elapsedSeconds: number) => void;
  readonly onCancelFinalize: () => void;
  readonly onDismissMutation: (mutationId: string) => void;
  readonly onFinalize: (winnerEntrantId: string) => Promise<boolean>;
  readonly onIssueClockCommand: (command: SegmentClockCommand, segmentId: string) => void;
  readonly onRecordEvent: (
    definition: ConsoleEventDefinition,
    occurredAt: number,
    context: RecordEventContext,
  ) => void;
  readonly onResolveTimer: (timerId: string) => void;
  readonly onRosterSaved: () => void;
  readonly online: boolean;
  readonly organizationAlias: string;
  readonly pendingMutations: readonly QueuedMutation[];
  readonly projection: MatchConsoleResponse;
  readonly stale: boolean;
  readonly status: ConsoleStatus;
  readonly tournamentAlias: string;
  readonly tournamentName?: string | null;
  readonly tournamentNameLoading?: boolean;
}): React.JSX.Element {
  const intl = useIntl();
  const pageHeader = useContext(PageHeaderContext);
  // ControlIntl always resolves `locale` to a real SupportedLanguage, but
  // react-intl's own IntlShape types it as a bare `string` — narrow it here,
  // once, rather than at every resolveLabel call site.
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  // `typeLabel` is discipline-declared — falls back to the raw
  // slug only for a descriptor that hasn't set one, never a hardcoded guess.
  const segmentTypeText = (segment: ConsoleSegment): string =>
    resolveLabel(segment.typeLabel ?? segment.type, language);
  const segmentStateText = (state: ConsoleSegment['state']): string =>
    intl.formatMessage(
      state === 'active'
        ? messages.matchConsoleSegmentStateActive
        : state === 'completed'
          ? messages.matchConsoleSegmentStateCompleted
          : messages.matchConsoleSegmentStatePending,
    );
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [dismissedRosterNotice, setDismissedRosterNotice] = useState(false);
  // Explicit, and separate from selectedSide: selectedSide is JerseyGrid's
  // event-attribution field, reset by every jersey tap for a completely
  // different purpose (who performed the next logged event). Reusing it as
  // the match winner meant the winner silently became whichever entrant a
  // scorer or card recipient last belonged to. This defaults to unset and
  // changes only when the operator picks a winner in the finalize
  // confirmation itself.
  const [finalizeWinner, setFinalizeWinner] = useState('');
  const [rosterStepOpen, setRosterStepOpen] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState('0');
  const [selectedSide, setSelectedSide] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  // Keyed by payload field name (e.g. 'assistedBy') rather than one fixed
  // field, since which fields a definition declares varies by discipline —
  // ambient state applied to whichever button gets clicked next, the same
  // pattern the side/person/staff selectors above already use.
  const [secondaryActorSelections, setSecondaryActorSelections] = useState<Record<string, string>>(
    {},
  );
  // Which field a JerseyGrid tap currently sets — undefined means the
  // primary actor (selectedSide/selectedPersonId), a field name means that
  // secondary field (see JerseyGrid.tsx's own "ambient selection" note).
  const [activeSecondaryField, setActiveSecondaryField] = useState<string | undefined>(undefined);
  const [conditionalEvent, setConditionalEvent] = useState<ConsoleEventDefinition>();
  // Captured when the event-creation button is first pressed, not when a
  // workflow's confirm step (after picking an outcome, typing a note) fires —
  // the moment worth recording is when the operator reacted to what happened,
  // not however long describing it afterward took.
  const [pendingOccurredAt, setPendingOccurredAt] = useState<number>();
  const [description, setDescription] = useState('');
  const [eventCategory, setEventCategory] = useState<'all' | 'positive' | 'negative' | 'neutral'>(
    'all',
  );
  const [logNote, setLogNote] = useState('');
  const [ledgerExpanded, setLedgerExpanded] = useState(false);
  const [bracketExpanded, setBracketExpanded] = useState(false);
  const [bracketZoom, setBracketZoom] = useState(1);

  // A default segment/side/person/staff selection, filled in whenever it is
  // still unset — on first render and again after every reload, the same
  // moment `MatchConsolePage`'s own `reload()` used to fill it in directly,
  // before this state lived here instead. Nested inside a promise chain
  // rather than called directly in the effect body — the same
  // react-hooks/set-state-in-effect workaround `PreferencesPage.tsx`
  // established for several setState calls reachable from one effect.
  useEffect(() => {
    Promise.resolve().then(() => {
      setSelectedSegmentId(
        (current) =>
          current ||
          projection.segments.find((one) => one.state === 'active')?.segmentId ||
          projection.segments[0]?.segmentId ||
          '',
      );
      setSelectedSide((current) => current || projection.entrants[0]?.entrantId || '');
      setSelectedPersonId((current) => current || projection.eligiblePersonIds[0] || '');
      setSelectedStaffId((current) => current || projection.eligibleStaffIds[0] || '');
    });
  }, [projection]);

  const activeSegment = projection.segments.find((segment) => segment.state === 'active');
  const permittedEvents = projection.eventDefinitions.filter((definition) =>
    isEventPermitted(definition, projection, activeSegment),
  );
  // Deduplicated by field name, keeping the first declaration's label: two
  // event definitions may prompt for the same field, and the chip row shows it
  // once.
  const secondaryActorFields = [
    ...new Map(
      permittedEvents
        .flatMap((definition) => definition.secondaryActorFields)
        .map((entry) => [entry.field, entry] as const),
    ).values(),
  ];
  const sentOff = sentOffPersonIds(projection.events);
  // The projection names both sides itself; nothing here reads a name off a
  // roster, which only exists once players have actually been named to it.
  const entrantById = new Map(projection.entrants.map((entrant) => [entrant.entrantId, entrant]));
  const canRecord = projection.capabilities.includes('match.record-event');
  const canSelectRoster = projection.capabilities.includes('match.select-roster');
  const canControlClock = projection.capabilities.includes('match.control-clock');
  const canResolveTimer = projection.capabilities.includes('match.resolve-timer');
  const canFinalize = projection.capabilities.includes('match.finalize');
  const queuedEvents: ConsoleMatchEvent[] = pendingMutations.flatMap((mutation, index) => {
    if (mutation.action.kind !== 'record-event') return [];
    const request = mutation.action.request;
    const event = {
      eventId: `queued-${mutation.id}`,
      definitionCode: request.definitionCode,
      segmentId: request.segmentId,
      sequence: projection.events.length + index + 1,
      occurredAt: new Date(request.occurredAt).toISOString(),
      ...(request.side === undefined ? {} : { side: request.side }),
      ...(request.personId === undefined ? {} : { personId: request.personId }),
      ...(request.notes === undefined ? {} : { notes: request.notes }),
    };
    return projection.events.some((projected) => eventSyncKey(projected) === eventSyncKey(event))
      ? []
      : [event];
  });
  const allEvents = [...projection.events, ...queuedEvents];
  const eventEntryIds = useEntryOnce(allEvents.map(eventSyncKey));
  const displayedEvents = allEvents.filter((event) => {
    if (eventCategory === 'all') return true;
    return (
      projection.eventDefinitions.find((definition) => definition.code === event.definitionCode)
        ?.category === eventCategory
    );
  });
  const newestFirst = [...displayedEvents].sort((left, right) => right.sequence - left.sequence);
  const ledgerEvents = ledgerExpanded ? newestFirst : newestFirst.slice(0, LEDGER_PEEK_COUNT);

  const selectedSegment = projection.segments.find(
    (segment) => segment.segmentId === selectedSegmentId,
  );
  const segmentRunning = selectedSegment?.state === 'active';
  const segmentEnded = selectedSegment?.state === 'completed';
  const clockCommandsLabel = intl.formatMessage(messages.matchConsoleClockCommands);
  // A match that has not kicked off starts; one already in progress resumes.
  // Both are "press Start" to the official holding the whistle — the
  // distinction is the domain's, between beginning a match and restarting a
  // clock, and it belongs here rather than in front of them.
  const clockCommands: readonly {
    readonly command: SegmentClockCommand;
    readonly label: string;
    readonly disabled: boolean;
  }[] = [
    {
      command: projection.status === 'scheduled' ? 'start' : 'resume',
      label: intl.formatMessage(messages.matchConsoleStartClock),
      disabled: segmentRunning || segmentEnded,
    },
    {
      command: 'pause',
      label: intl.formatMessage(messages.matchConsolePauseClock),
      disabled: !segmentRunning,
    },
    {
      command: 'end',
      label: intl.formatMessage(messages.matchConsoleEndSegment),
      disabled: segmentEnded,
    },
  ];

  function record(definition: ConsoleEventDefinition): void {
    if (!activeSegment) return;
    const occurredAt = currentEpochMilliseconds();
    if (definition.workflow) {
      setPendingOccurredAt(occurredAt);
      setConditionalEvent(definition);
      return;
    }
    recordFinal(definition, occurredAt);
  }

  function recordFinal(definition: ConsoleEventDefinition, occurredAt: number): void {
    if (!activeSegment) return;
    onRecordEvent(definition, occurredAt, {
      selectedSide,
      selectedPersonId,
      selectedStaffId,
      secondaryActorSelections,
      description,
      logNote,
    });
    setConditionalEvent(undefined);
    setPendingOccurredAt(undefined);
    setDescription('');
    setLogNote('');
    setSecondaryActorSelections({});
    setActiveSecondaryField(undefined);
  }

  async function handleConfirmFinalize(): Promise<void> {
    const succeeded = await onFinalize(finalizeWinner);
    if (succeeded) {
      setConfirmingFinalize(false);
      setFinalizeWinner('');
    }
  }

  function handleCancelFinalize(): void {
    setConfirmingFinalize(false);
    setFinalizeWinner('');
    onCancelFinalize();
  }

  const breadcrumbs = matchConsoleBreadcrumbsOf({
    organizationAlias,
    projection,
    tournamentAlias,
    tournamentName,
    tournamentNameLoading,
  });
  const loadMatchDataAction = matchConsoleLoadDataAction({
    matchId,
    organizationAlias,
    projection,
    tournamentAlias,
  });

  const titleNode = <FormattedMessage {...messages.matchConsoleTitle} />;

  const statusNode = (
    <StatusSection activeSegment={activeSegment} intl={intl} matchStatus={projection.status} />
  );

  const alertsNode = (
    <AlertsSection
      intl={intl}
      lastSyncedAt={lastSyncedAt}
      onDismissMutation={onDismissMutation}
      pendingMutations={pendingMutations}
      stale={stale}
      status={status}
    />
  );

  const syncStatusNode = (
    <ConnectionStatus
      online={online}
      queuedCount={pendingMutations.filter((mutation) => mutation.status === 'pending').length}
      refusedCount={pendingMutations.filter((mutation) => mutation.status === 'refused').length}
      {...(lastSyncedAt === undefined
        ? {}
        : {
            lastSuccessfulSync: new Intl.DateTimeFormat(intl.locale, {
              timeStyle: 'short',
              ...(pageHeader?.organizationTimeZone === undefined
                ? {}
                : { timeZone: pageHeader.organizationTimeZone }),
            }).format(new Date(lastSyncedAt)),
          })}
      labels={{
        online: intl.formatMessage(messages.interactionOnline),
        offline: intl.formatMessage(messages.interactionOffline),
        queuedCount: (count) => intl.formatMessage(messages.interactionQueuedCount, { count }),
        refusedCount: (count) => intl.formatMessage(messages.interactionRefusedCount, { count }),
        lastSuccessfulSync: (time) => intl.formatMessage(messages.interactionLastSynced, { time }),
        neverSynced: intl.formatMessage(messages.interactionNeverSynced),
      }}
    />
  );

  const scoreboardNode = (
    <section aria-label={intl.formatMessage(messages.matchConsoleCurrentScoreboard)}>
      {projection.liveScores.map((side) => {
        const entrant = entrantById.get(side.entrantId);
        return (
          <div key={side.entrantId} className="cl-match-console-screen__score-side">
            <EntrantName
              className="cl-match-console-screen__score-entrant"
              {...(entrant?.abbreviation === undefined
                ? {}
                : { abbreviation: entrant.abbreviation })}
              fullName={entrant?.name ?? intl.formatMessage(messages.matchConsoleUnnamedEntrant)}
            />
            <strong>
              <ValueFlash className="cl-tabular-nums" value={side.score} />
            </strong>
          </div>
        );
      })}
    </section>
  );

  const primaryNode = (
    <>
      <Card className="cl-chamfer cl-chamfer--control">
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.matchConsoleClockAndPeriod} />
          </h2>
        </header>
        <div className="cl-platform-form-grid">
          <Field id="console-segment" label={intl.formatMessage(messages.matchConsoleSegment)}>
            <Select
              aria-label={intl.formatMessage(messages.matchConsoleActiveSegment)}
              disabled={!canControlClock}
              id="console-segment"
              onValueChange={setSelectedSegmentId}
              options={projection.segments.map((segment) => ({
                value: segment.segmentId,
                label: `${segmentTypeText(segment)} ${segment.number} · ${segmentStateText(segment.state)}`,
              }))}
              value={selectedSegmentId}
            />
          </Field>
          <Field
            id="console-elapsed-seconds"
            label={intl.formatMessage(messages.matchConsoleElapsedSeconds)}
          >
            <Input
              aria-label={intl.formatMessage(messages.matchConsoleElapsedSeconds)}
              disabled={!canControlClock}
              id="console-elapsed-seconds"
              min="0"
              onChange={(event) => setElapsedSeconds(event.target.value)}
              type="number"
              value={elapsedSeconds}
            />
          </Field>
          <Button
            disabled={!canControlClock || selectedSegmentId === ''}
            onClick={() => onApplyClock(selectedSegmentId, Number(elapsedSeconds))}
            type="button"
          >
            <FormattedMessage {...messages.matchConsoleApplyClock} />
          </Button>
        </div>
        <div className="cl-card__content">
          {/* The whistle, not a correction: these record the moment the clock
              actually changed, while "apply clock" above stays the way to fix a
              value that was recorded wrong. Both land in one audit trail. */}
          <div className="cl-clock-commands" role="group" aria-label={clockCommandsLabel}>
            {clockCommands.map(({ command, label, disabled }) => (
              <Button
                disabled={!canControlClock || selectedSegmentId === '' || disabled}
                key={command}
                onClick={() => onIssueClockCommand(command, selectedSegmentId)}
                type="button"
                variant={command === 'end' ? 'secondary' : 'primary'}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

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
                onClick={() => record(definition)}
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
                        recordFinal(
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

      <Card className="cl-chamfer cl-chamfer--control">
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.matchConsoleFinalize} />
          </h2>
        </header>
        <div className="cl-card__content">
          {!confirmingFinalize ? (
            <Button
              disabled={!canFinalize || projection.status !== 'in-progress'}
              onClick={() => setConfirmingFinalize(true)}
              type="button"
              variant="primary"
            >
              <FormattedMessage {...messages.matchConsoleFinalizeMatch} />
            </Button>
          ) : (
            <Alert
              block
              dismissLabel={intl.formatMessage(messages.toastDismiss)}
              onDismiss={handleCancelFinalize}
              tone="warning"
            >
              <strong>
                <FormattedMessage {...messages.matchConsoleFinalizeImmutable} />
              </strong>
              <span>
                <FormattedMessage {...messages.matchConsoleFinalizeCorrections} />
              </span>
              <FieldSet legend={intl.formatMessage(messages.matchConsoleFinalizeWinnerLegend)}>
                <RadioGroup
                  name="finalize-winner"
                  onValueChange={(value) =>
                    setFinalizeWinner(value === FINALIZE_NO_WINNER_VALUE ? '' : value)
                  }
                  value={finalizeWinner || FINALIZE_NO_WINNER_VALUE}
                >
                  {projection.liveScores.map((side) => {
                    const entrant = entrantById.get(side.entrantId);
                    const fieldId = `finalize-winner-${side.entrantId}`;
                    return (
                      <Label
                        className="cl-toggle cl-focusable"
                        htmlFor={fieldId}
                        key={side.entrantId}
                      >
                        <RadioGroupItem id={fieldId} value={side.entrantId} />
                        <EntrantName
                          {...(entrant?.abbreviation === undefined
                            ? {}
                            : { abbreviation: entrant.abbreviation })}
                          fullName={
                            entrant?.name ?? intl.formatMessage(messages.matchConsoleUnnamedEntrant)
                          }
                        />
                        <strong>{side.score}</strong>
                      </Label>
                    );
                  })}
                  <Label className="cl-toggle cl-focusable" htmlFor="finalize-winner-none">
                    <RadioGroupItem id="finalize-winner-none" value={FINALIZE_NO_WINNER_VALUE} />
                    <span>
                      <FormattedMessage {...messages.matchConsoleFinalizeNoWinner} />
                    </span>
                  </Label>
                </RadioGroup>
              </FieldSet>
              <div className="cl-role-user">
                <Button onClick={handleCancelFinalize} type="button" variant="secondary">
                  <FormattedMessage {...messages.matchConsoleCancel} />
                </Button>
                <Button
                  disabled={finalizing}
                  onClick={() => void handleConfirmFinalize()}
                  type="button"
                  variant="primary"
                >
                  <FormattedMessage {...messages.matchConsoleConfirmFinalization} />
                </Button>
              </div>
            </Alert>
          )}
        </div>
      </Card>
    </>
  );

  // A side still waiting on another match leaves nothing to operate: the console says what it is
  // waiting for instead of offering a start, an event or a result the server would refuse.
  const undecided = undecidedSidesOf(projection);
  const sourceLabels = sideSourceLabelsFromControlIntl(intl);
  const finalRound = finalRoundOf(
    (bracketMatches ?? []).map((match) => ({ nodeKey: match.matchId, round: match.round })),
  );
  const awaitingNode = (
    <Card className="cl-chamfer cl-chamfer--control">
      <div className="cl-card__content" role="status">
        {undecided.map(({ side, source }) => (
          <p className="cl-card__description" data-awaiting-side={side} key={side}>
            {awaitingSourceText(source, sourceLabels, finalRound)}
          </p>
        ))}
      </div>
    </Card>
  );

  const railNode = (
    <>
      <Card className="cl-chamfer cl-chamfer--control">
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.matchConsoleActiveTimers} />
          </h2>
        </header>
        <div className="cl-card__content">
          {projection.runningTimers.length === 0 ? (
            <p className="cl-card__description">
              <FormattedMessage {...messages.matchConsoleNoActiveTimers} />
            </p>
          ) : (
            <ul>
              {projection.runningTimers.map((timer) => (
                <li key={timer.timerId} className="cl-role-user">
                  <span>{formatClock(timer.remainingSeconds)}</span>
                  <Button
                    disabled={!canResolveTimer}
                    onClick={() => onResolveTimer(timer.timerId)}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.matchConsoleResolve} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="cl-chamfer cl-chamfer--control">
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.matchConsoleEventLedger} />
          </h2>
          {/* Collapsed is the default because the recording controls above have
              to fit one screen during play; the peek strip is what keeps
              collapsing from hiding the event just recorded from the operator
              who just recorded it. */}
          <Button
            aria-expanded={ledgerExpanded}
            onClick={() => setLedgerExpanded((expanded) => !expanded)}
            type="button"
            variant="secondary"
          >
            <FormattedMessage
              {...(ledgerExpanded
                ? messages.matchConsoleCollapseLedger
                : messages.matchConsoleExpandLedger)}
            />
          </Button>
        </header>
        <div className="cl-card__content">
          <div className="cl-role-user">
            {(['all', 'positive', 'negative', 'neutral'] as const).map((category) => (
              <Button
                aria-pressed={eventCategory === category}
                key={category}
                onClick={() => setEventCategory(category)}
                type="button"
                variant="secondary"
              >
                {intl.formatMessage(
                  category === 'all'
                    ? messages.matchConsoleAll
                    : category === 'positive'
                      ? messages.matchConsoleCategoryPositive
                      : category === 'negative'
                        ? messages.matchConsoleCategoryNegative
                        : messages.matchConsoleCategoryNeutral,
                )}
              </Button>
            ))}
          </div>
          <ol className="cl-platform-update-list">
            {ledgerEvents.map((event) => {
              const key = eventSyncKey(event);
              const queueEntry = pendingMutations.find(
                (mutation) =>
                  mutation.action.kind === 'record-event' &&
                  eventSyncKey({
                    definitionCode: mutation.action.request.definitionCode,
                    segmentId: mutation.action.request.segmentId,
                    occurredAt: new Date(mutation.action.request.occurredAt).toISOString(),
                  }) === key,
              );
              const explicitState = eventSyncStates[key];
              const syncState =
                explicitState ??
                (queueEntry
                  ? {
                      state: queueEntry.status === 'refused' ? 'refused' : 'queued',
                      ...(queueEntry.refusalReason === undefined
                        ? {}
                        : { refusalReason: queueEntry.refusalReason }),
                    }
                  : undefined);
              return (
                <li
                  key={key}
                  className={`cl-role-user${eventEntryIds.has(key) ? ' cl-enter-once' : ''}`}
                >
                  <strong>
                    {event.definitionCode} ·{' '}
                    {segmentLabel(
                      projection,
                      event.segmentId,
                      intl.formatMessage(messages.matchConsoleUnknownSegment),
                      segmentTypeText,
                    )}
                    {event.segmentElapsedSeconds === undefined
                      ? null
                      : ` · ${formatClock(event.segmentElapsedSeconds)}`}
                  </strong>
                  <ResponsiveTimestamp
                    locale={intl.locale}
                    timeZone={pageHeader?.organizationTimeZone}
                    timestamp={event.occurredAt}
                  />
                  {syncState && (
                    <EventSyncMark
                      acknowledged={syncState.state === 'confirmed'}
                      labels={{
                        queued: intl.formatMessage(messages.interactionQueued),
                        sent: intl.formatMessage(messages.interactionSent),
                        confirmed: intl.formatMessage(messages.interactionConfirmed),
                        refused: intl.formatMessage(messages.interactionRefused),
                      }}
                      refusalReason={syncState.refusalReason}
                      state={syncState.state}
                    />
                  )}
                  {event.notes ? <p className="cl-card__description">{event.notes}</p> : null}
                </li>
              );
            })}
          </ol>
          <Field id="console-log-note" label={intl.formatMessage(messages.matchConsoleLogNote)}>
            <Textarea
              aria-label={intl.formatMessage(messages.matchConsoleLogNote)}
              id="console-log-note"
              onChange={(event) => setLogNote(event.target.value)}
              placeholder=""
              value={logNote}
            />
          </Field>
        </div>
      </Card>

      {bracketMatches && bracketMatches.length > 0 && (
        <Card className="cl-chamfer cl-chamfer--control">
          <header className="cl-card__header">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.matchConsoleBracketContext} />
            </h2>
            {/* Collapsed by default — orientation an operator reaches for occasionally,
                not screen space the recording controls need by default. */}
            <Button
              aria-expanded={bracketExpanded}
              onClick={() => setBracketExpanded((expanded) => !expanded)}
              type="button"
              variant="secondary"
            >
              <FormattedMessage
                {...(bracketExpanded
                  ? messages.matchConsoleCollapseBracket
                  : messages.matchConsoleExpandBracket)}
              />
            </Button>
          </header>
          {bracketExpanded && (
            <div className="cl-card__content">
              <BracketCanvas
                focusMatchId={matchId}
                matches={bracketMatches}
                organizationAlias={organizationAlias}
                onZoomChange={setBracketZoom}
                zoom={bracketZoom}
              />
            </div>
          )}
        </Card>
      )}
    </>
  );

  return (
    <MatchConsoleLayout
      actions={loadMatchDataAction}
      alerts={alertsNode}
      breadcrumbs={breadcrumbs}
      primary={undecided.length > 0 ? awaitingNode : primaryNode}
      primaryLabel={intl.formatMessage(messages.matchConsoleControls)}
      rail={railNode}
      railLabel={intl.formatMessage(messages.matchConsoleLedgerAndStatus)}
      scoreboard={scoreboardNode}
      sectionLabel={intl.formatMessage(messages.matchConsoleSectionLabel)}
      status={statusNode}
      syncStatus={syncStatusNode}
      title={titleNode}
    />
  );
}

function matchConsoleBreadcrumbsOf({
  organizationAlias,
  projection,
  tournamentAlias,
  tournamentName,
  tournamentNameLoading,
}: {
  readonly organizationAlias: string;
  readonly projection: MatchConsoleResponse;
  readonly tournamentAlias: string;
  readonly tournamentName?: string | null;
  readonly tournamentNameLoading: boolean;
}) {
  const homeName = projection.entrants.find(
    ({ entrantId }) => entrantId === projection.homeEntrantId,
  )?.name;
  const awayName = projection.entrants.find(
    ({ entrantId }) => entrantId === projection.awayEntrantId,
  )?.name;
  const matchName = homeName && awayName ? `${homeName} vs ${awayName}` : undefined;
  const tournamentBreadcrumb = tournamentName
    ? {
        label: tournamentName,
        href: `/control/${organizationAlias}/tournaments/${tournamentAlias}`,
      }
    : tournamentNameLoading
      ? { label: '', loading: true }
      : undefined;

  return [
    ...(tournamentBreadcrumb ? [tournamentBreadcrumb] : []),
    ...(matchName ? [{ label: matchName, current: true }] : []),
  ];
}

function matchConsoleLoadDataAction({
  matchId,
  organizationAlias,
  projection,
  tournamentAlias,
}: {
  readonly matchId: string;
  readonly organizationAlias: string;
  readonly projection: MatchConsoleResponse;
  readonly tournamentAlias: string;
}): React.JSX.Element | undefined {
  if (
    projection.status !== 'scheduled' ||
    projection.segments.length > 0 ||
    projection.events.length > 0
  ) {
    return undefined;
  }

  const href = `/control/${organizationAlias}/tournaments/${tournamentAlias}/matches/${matchId}/load`;
  return (
    <LinkButton href={href} onClick={controlLinkClick(href)}>
      <FormattedMessage {...messages.matchConsoleLoadMatchData} />
    </LinkButton>
  );
}

/**
 * One component per section `MatchConsoleTemplate` composes into
 * `MatchConsoleLayout`'s slots: each section's own
 * conditionals now count toward its own function, not the template's, and
 * the template keeps only the composition itself. No behavior change — each
 * component's body is the section's prior inline JSX, unmodified.
 */
function AlertsSection({
  intl,
  lastSyncedAt,
  onDismissMutation,
  pendingMutations,
  stale,
  status,
}: {
  readonly intl: IntlShape;
  readonly lastSyncedAt: number | undefined;
  readonly onDismissMutation: (mutationId: string) => void;
  readonly pendingMutations: readonly QueuedMutation[];
  readonly stale: boolean;
  readonly status: ConsoleStatus;
}): React.JSX.Element {
  const staleKey = String(lastSyncedAt ?? 'unknown');
  const [dismissedStaleKey, setDismissedStaleKey] = useState<string>();

  return (
    <>
      {status.kind === 'error' && <Alert tone="destructive">{status.message}</Alert>}
      {stale && dismissedStaleKey !== staleKey && (
        <Alert
          dismissLabel={intl.formatMessage(messages.toastDismiss)}
          onDismiss={() => setDismissedStaleKey(staleKey)}
          tone="warning"
        >
          <FormattedMessage {...messages.matchConsoleAwaitingProjection} />
        </Alert>
      )}
      {pendingMutations.some((mutation) => mutation.status === 'refused') && (
        <ul>
          {pendingMutations
            .filter((mutation) => mutation.status === 'refused')
            .map((mutation) => (
              <li key={mutation.id}>
                <Alert block tone="destructive">
                  <span>
                    {intl.formatMessage(messages.matchConsoleRefusedAction, {
                      kind: mutation.action.kind,
                      reason: mutation.refusalReason ?? '',
                    })}
                  </span>
                  {/* What was actually recorded, kept in front of the operator. A refusal
                    caused by a series decision means this match will never be played, and
                    these contents are the only basis for deciding whether the result
                    belongs elsewhere — as a correction to an earlier game, most often. */}
                  <span className="cl-card__description">
                    {intl.formatMessage(messages.matchConsoleRefusedContents, {
                      contents: describeQueuedAction(mutation.action),
                    })}
                  </span>
                  <Button
                    onClick={() => onDismissMutation(mutation.id)}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.matchConsoleDismiss} />
                  </Button>
                </Alert>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}

function StatusSection({
  activeSegment,
  intl,
  matchStatus,
}: {
  readonly activeSegment: ConsoleSegment | undefined;
  readonly intl: IntlShape;
  readonly matchStatus: MatchConsoleResponse['status'];
}): React.JSX.Element {
  return (
    <>
      <strong>
        {matchStatus === 'in-progress'
          ? intl.formatMessage(messages.matchConsoleLive)
          : matchStatus.toUpperCase()}
      </strong>
      <ClockRing
        durationSeconds={activeSegment?.durationSeconds}
        elapsedSeconds={activeSegment?.elapsedSeconds ?? 0}
      />
    </>
  );
}
