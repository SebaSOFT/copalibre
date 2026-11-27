import { useContext, useState } from 'react';
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { isSupportedLanguage, resolveLabel } from '@copalibre/domain';
import type {
  ConsoleEventDefinition,
  ConsoleSegment,
  MatchConsoleApiClient,
  MatchConsoleResponse,
  SegmentClockCommand,
} from '../../lib/api-client.js';
import {
  addSegmentOptionsOf,
  awaitingSourceText,
  clockActionsOf,
  clockOpenOf,
  type ClockAction,
  commandOfClockAction,
  currentEpochMilliseconds,
  eventSyncKey,
  formatClock,
  isEventPermitted,
  reopenReasonValidOf,
  segmentPhaseOf,
  type SegmentPhase,
  sentOffPersonIds,
  undecidedSidesOf,
} from '../../lib/match-console.js';
import { sideSourceLabelsFromControlIntl } from '../../lib/matches-view-labels.js';
import { finalRoundOf } from '../../../lib/side-source.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import type { QueuedMutation } from '../../lib/offline-queue.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Select } from '../ui/atoms/select.js';
import { Field } from '../ui/molecules/field.js';
import { BracketCanvas } from '../BracketCanvas.js';
import type { CanvasMatch } from '../../lib/bracket-canvas.js';
import { EntrantName } from '../../../components/ui/atoms/EntrantName.js';
import { ValueFlash } from '../../../components/ui/atoms/ValueFlash.js';
import { MatchConsoleLayout } from '../ui/layouts/match-console-layout.js';
import { ConnectionStatus } from '../ui/organisms/connection-status.js';
import { LinkButton } from '../ui/atoms/link-button.js';
import type { EventSyncState } from '../ui/molecules/event-sync-mark.js';
import { messages } from '../../i18n/messages.en.js';
import type { ConsoleStatus } from '../pages/MatchConsolePage.js';
import { useEntryOnce } from '../../../lib/use-entry-once.js';
import { PageHeaderContext } from '../ui/organisms/page-header.js';
import {
  AddSegmentField,
  ClockCommands,
  ClockCorrectionForm,
  NoSegmentsLine,
  ReopenSegmentConfirmation,
  RunningSegmentLine,
} from './MatchConsoleClockControls.js';
import { AlertsSection, StatusSection } from './MatchConsoleStatusSections.js';
import { MatchConsoleFinalizeSection } from './MatchConsoleFinalizeSection.js';
import { MatchConsoleLedgerSection, type EventCategory } from './MatchConsoleLedgerSection.js';
import { MatchConsoleRecordSection } from './MatchConsoleRecordSection.js';
import {
  matchConsoleBreadcrumbsOf,
  matchConsoleLoadDataHrefOf,
  queuedEventsOf,
  secondaryActorFieldsOf,
} from './match-console-model.js';
import { useMatchConsoleSelection } from './use-match-console-selection.js';
import { useSegmentClockDraft } from './use-segment-clock-draft.js';

/**
 * How many events stay visible with the ledger collapsed. Three is what makes
 * collapsing safe: the operator can confirm what they just recorded — and the
 * one before it, when a substitution and its card land together — without
 * spending the screen the recording controls need during play.
 */
const LEDGER_PEEK_COUNT = 3;

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
  onCancelFinalize,
  onCorrectClock,
  onDismissMutation,
  onFinalize,
  onAddSegment,
  onIssueClockCommand,
  onRecordEvent,
  onReopenSegment,
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
  readonly onAddSegment: (type: string) => Promise<void> | void;
  readonly onCancelFinalize: () => void;
  readonly onCorrectClock: (segmentId: string, elapsedSeconds: number) => void;
  readonly onDismissMutation: (mutationId: string) => void;
  readonly onFinalize: (winnerEntrantId: string) => Promise<boolean>;
  readonly onIssueClockCommand: (command: SegmentClockCommand, segmentId: string) => void;
  readonly onRecordEvent: (
    definition: ConsoleEventDefinition,
    occurredAt: number,
    context: RecordEventContext,
  ) => void;
  readonly onReopenSegment: (segmentId: string, reason: string) => void;
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
  const segmentTextOf = (segment: ConsoleSegment): string =>
    `${segmentTypeText(segment)} ${segment.number}`;
  const segmentPhaseMessages: Readonly<Record<SegmentPhase, MessageDescriptor>> = {
    'not-started': messages.matchConsoleSegmentStatePending,
    paused: messages.matchConsoleSegmentStatePaused,
    running: messages.matchConsoleSegmentStateActive,
    ended: messages.matchConsoleSegmentStateCompleted,
  };
  const segmentPhaseText = (segment: ConsoleSegment): string =>
    intl.formatMessage(segmentPhaseMessages[segmentPhaseOf(segment)]);
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
  const selection = useMatchConsoleSelection(projection);
  const {
    secondaryActorSelections,
    selectedPersonId,
    selectedSide,
    selectedStaffId,
    setActiveSecondaryField,
    setSecondaryActorSelections,
  } = selection;
  const [conditionalEvent, setConditionalEvent] = useState<ConsoleEventDefinition>();
  // Captured when the event-creation button is first pressed, not when a
  // workflow's confirm step (after picking an outcome, typing a note) fires —
  // the moment worth recording is when the operator reacted to what happened,
  // not however long describing it afterward took.
  const [pendingOccurredAt, setPendingOccurredAt] = useState<number>();
  const [description, setDescription] = useState('');
  const [eventCategory, setEventCategory] = useState<EventCategory>('all');
  const [logNote, setLogNote] = useState('');
  const [ledgerExpanded, setLedgerExpanded] = useState(false);
  const [bracketExpanded, setBracketExpanded] = useState(false);
  const [bracketZoom, setBracketZoom] = useState(1);

  const {
    clockTimeInput,
    correctedSeconds,
    reopenReason,
    reopenTarget,
    selectedSegment,
    selectedSegmentId,
    setClockDraft,
    setPickedSegmentId,
    setReopenOpenedFor,
    setReopenReason,
  } = useSegmentClockDraft(projection);

  const activeSegment = projection.segments.find((segment) => segment.state === 'active');
  const permittedEvents = projection.eventDefinitions.filter((definition) =>
    isEventPermitted(definition, projection, activeSegment),
  );
  const secondaryActorFields = secondaryActorFieldsOf(permittedEvents);
  const sentOff = sentOffPersonIds(projection.events);
  // The projection names both sides itself; nothing here reads a name off a
  // roster, which only exists once players have actually been named to it.
  const entrantById = new Map(projection.entrants.map((entrant) => [entrant.entrantId, entrant]));
  const canRecord = projection.capabilities.includes('match.record-event');
  const canSelectRoster = projection.capabilities.includes('match.select-roster');
  const canControlClock = projection.capabilities.includes('match.control-clock');
  const canResolveTimer = projection.capabilities.includes('match.resolve-timer');
  const canFinalize = projection.capabilities.includes('match.finalize');
  const queuedEvents = queuedEventsOf(projection, pendingMutations);
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

  const clockCommandsLabel = intl.formatMessage(messages.matchConsoleClockCommands);
  // Only what the match state and the segment's phase allow is offered, one primary action at a
  // time. The distinction between starting a fresh segment and resuming a stopped one belongs to
  // the domain, so each gets its own label rather than one shared "Start".
  const clockActions = clockActionsOf(
    projection.status,
    projection.segments,
    selectedSegment,
    projection.segmentPlan.regulation,
  );
  const clockActionLabels: Readonly<Record<ClockAction, string>> = {
    'start-match': intl.formatMessage(messages.matchConsoleStartMatch),
    'start-segment': intl.formatMessage(messages.matchConsoleStartSegment),
    resume: intl.formatMessage(messages.matchConsoleResume),
    pause: intl.formatMessage(messages.matchConsolePauseClock),
    'end-segment': intl.formatMessage(messages.matchConsoleEndSegment),
    'reopen-segment': intl.formatMessage(messages.matchConsoleReopenSegment),
  };
  // Adding a segment is offered once the match is in progress: a scheduled match gets its
  // regulation from Start, and a finished one takes no more segments.
  const addSegmentNode = (
    <AddSegmentField
      disabled={!canControlClock}
      labels={{
        button: <FormattedMessage {...messages.matchConsoleAddSegment} />,
        field: intl.formatMessage(messages.matchConsoleAddSegmentLabel),
        placeholder: intl.formatMessage(messages.selectPlaceholder),
      }}
      onAdd={onAddSegment}
      options={addSegmentOptionsOf(
        projection,
        language,
        intl.formatMessage(messages.matchConsoleOutsidePlan),
      )}
      visible={projection.status === 'in-progress'}
    />
  );
  function issueClockAction(action: Exclude<ClockAction, 'reopen-segment'>): void {
    onIssueClockCommand(commandOfClockAction(action), selectedSegmentId);
    setPickedSegmentId('');
    closeReopen();
  }

  function openReopen(): void {
    setReopenReason('');
    setReopenOpenedFor(selectedSegmentId);
  }

  function closeReopen(): void {
    setReopenOpenedFor(undefined);
    setReopenReason('');
  }

  function correctClock(): void {
    if (correctedSeconds === undefined) return;
    onCorrectClock(selectedSegmentId, correctedSeconds);
    setClockDraft(undefined);
    setPickedSegmentId('');
    closeReopen();
  }

  function confirmReopen(): void {
    if (reopenTarget === undefined || !reopenReasonValidOf(reopenReason)) return;
    onReopenSegment(reopenTarget.segmentId, reopenReason.trim());
    closeReopen();
  }

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
  const loadMatchDataHref = matchConsoleLoadDataHrefOf({
    matchId,
    organizationAlias,
    projection,
    tournamentAlias,
  });
  const loadMatchDataAction =
    loadMatchDataHref === undefined ? undefined : (
      <LinkButton href={loadMatchDataHref} onClick={controlLinkClick(loadMatchDataHref)}>
        <FormattedMessage {...messages.matchConsoleLoadMatchData} />
      </LinkButton>
    );

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
        <div className="cl-card__content">
          {projection.segments.length === 0 ? (
            <>
              <p className="cl-card__description">
                <NoSegmentsLine language={language} projection={projection} />
              </p>
              <ClockCommands
                actions={clockActions.actions}
                disabled={!canControlClock}
                labels={clockActionLabels}
                label={clockCommandsLabel}
                onAction={(action) =>
                  action === 'reopen-segment' ? openReopen() : issueClockAction(action)
                }
              />
              {addSegmentNode}
            </>
          ) : (
            <>
              <div className="cl-platform-form-grid">
                <Field
                  id="console-segment"
                  label={intl.formatMessage(messages.matchConsoleSegment)}
                >
                  <Select
                    aria-label={intl.formatMessage(messages.matchConsoleActiveSegment)}
                    disabled={!canControlClock}
                    id="console-segment"
                    onValueChange={(segmentId) => {
                      setPickedSegmentId(segmentId);
                      setClockDraft(undefined);
                      closeReopen();
                    }}
                    options={projection.segments.map((segment) => ({
                      value: segment.segmentId,
                      label: `${segmentTypeText(segment)} ${segment.number} · ${segmentPhaseText(segment)}`,
                    }))}
                    placeholder={intl.formatMessage(messages.selectPlaceholder)}
                    value={selectedSegmentId}
                  />
                </Field>
              </div>
              <RunningSegmentLine
                segmentText={segmentTextOf}
                segment={clockActions.runningSegment}
              />
              {/* The whistle, not a correction: these record the moment the clock actually changed. */}
              <ClockCommands
                actions={clockActions.actions}
                disabled={!canControlClock}
                labels={clockActionLabels}
                label={clockCommandsLabel}
                onAction={(action) =>
                  action === 'reopen-segment' ? openReopen() : issueClockAction(action)
                }
              />
              <ReopenSegmentConfirmation
                labels={{
                  cancel: intl.formatMessage(messages.matchConsoleCancel),
                  confirm: intl.formatMessage(messages.matchConsoleReopenConfirmButton),
                  dismiss: intl.formatMessage(messages.toastDismiss),
                  reason: intl.formatMessage(messages.matchConsoleReopenReason),
                  question: (segment) =>
                    intl.formatMessage(messages.matchConsoleReopenConfirm, { segment }),
                }}
                onCancel={closeReopen}
                onConfirm={confirmReopen}
                onReason={setReopenReason}
                segmentText={segmentTextOf}
                reason={reopenReason}
                segment={reopenTarget}
                visible={reopenTarget !== undefined}
              />
              <ClockCorrectionForm
                canCorrect={correctedSeconds !== undefined}
                disabled={!canControlClock}
                labels={{
                  button: <FormattedMessage {...messages.matchConsoleCorrectTime} />,
                  field: intl.formatMessage(messages.matchConsoleCorrectTimeLabel),
                }}
                onChange={(value) => setClockDraft({ segmentId: selectedSegmentId, value })}
                onCorrect={correctClock}
                value={clockTimeInput}
                visible={clockOpenOf(projection.status)}
              />
              {addSegmentNode}
            </>
          )}
        </div>
      </Card>

      <MatchConsoleRecordSection
        api={api}
        canRecord={canRecord}
        canSelectRoster={canSelectRoster}
        conditionalEvent={conditionalEvent}
        description={description}
        dismissedRosterNotice={dismissedRosterNotice}
        language={language}
        matchId={matchId}
        onRecord={record}
        onRecordFinal={recordFinal}
        onRosterSaved={onRosterSaved}
        organizationAlias={organizationAlias}
        pendingOccurredAt={pendingOccurredAt}
        permittedEvents={permittedEvents}
        projection={projection}
        rosterStepOpen={rosterStepOpen}
        secondaryActorFields={secondaryActorFields}
        selection={selection}
        sentOff={sentOff}
        setDescription={setDescription}
        setDismissedRosterNotice={setDismissedRosterNotice}
        setRosterStepOpen={setRosterStepOpen}
        tournamentAlias={tournamentAlias}
      />

      <MatchConsoleFinalizeSection
        canFinalize={canFinalize}
        confirmingFinalize={confirmingFinalize}
        entrantById={entrantById}
        finalizePrimary={clockActions.finalizePrimary}
        finalizeWinner={finalizeWinner}
        finalizing={finalizing}
        handleCancelFinalize={handleCancelFinalize}
        handleConfirmFinalize={handleConfirmFinalize}
        projection={projection}
        setConfirmingFinalize={setConfirmingFinalize}
        setFinalizeWinner={setFinalizeWinner}
      />
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

      <MatchConsoleLedgerSection
        eventCategory={eventCategory}
        eventEntryIds={eventEntryIds}
        eventSyncStates={eventSyncStates}
        ledgerEvents={ledgerEvents}
        ledgerExpanded={ledgerExpanded}
        logNote={logNote}
        pendingMutations={pendingMutations}
        projection={projection}
        segmentTypeText={segmentTypeText}
        setEventCategory={setEventCategory}
        setLedgerExpanded={setLedgerExpanded}
        setLogNote={setLogNote}
      />

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
