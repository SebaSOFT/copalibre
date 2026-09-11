import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from './ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { isSupportedLanguage, resolveLabel } from '@copalibre/domain';
import { RealtimeClient } from '@copalibre/realtime';
import {
  ControlApiError,
  createControlApiClient,
  type ConsoleEventDefinition,
  type ConsoleSegment,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
  type SegmentClockCommand,
} from '../lib/api-client.js';
import {
  currentEpochMilliseconds,
  descriptionFor,
  formatClock,
  isEventPermitted,
  newIdempotencyKey,
  segmentLabel,
  sentOffPersonIds,
} from '../lib/match-console.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import {
  describeQueuedAction,
  drainQueue,
  enqueue,
  listPending,
  markRefused,
  markSent,
  remove,
  type QueuedAction,
  type QueuedMutation,
} from '../lib/offline-queue.js';
import { Button } from './ui/atoms/button.js';
import { Card } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { Label } from './ui/atoms/label.js';
import { RadioGroup, RadioGroupItem } from './ui/atoms/radio.js';
import { Select } from './ui/atoms/select.js';
import { Textarea } from './ui/atoms/textarea.js';
import { Field } from './ui/molecules/field.js';
import { FieldSet } from './ui/molecules/field-set.js';
import { ClockRing } from './ui/organisms/clock-ring.js';
import { EntrantName } from '../../components/ui/atoms/EntrantName.js';
import { JerseyGrid } from './JerseyGrid.js';
import { RosterSelectionStep } from './RosterSelectionStep.js';
import { MatchConsoleLayout } from './ui/layouts/match-console-layout.js';
import { messages } from '../i18n/messages.en.js';

const RECONCILIATION_TIMEOUT_MS = 8_000;

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

const SEGMENT_STATE_AFTER: Readonly<Record<SegmentClockCommand, ConsoleSegment['state']>> = {
  start: 'active',
  resume: 'active',
  pause: 'pending',
  end: 'completed',
};

type ConsoleStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

export function MatchConsoleRoute({
  organizationAlias,
  tournamentAlias,
  matchId,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly matchId: string;
  readonly client?: MatchConsoleApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  // ControlIntl always resolves `locale` to a real SupportedLanguage, but
  // react-intl's own IntlShape types it as a bare `string` — narrow it here,
  // once, rather than at every resolveLabel call site.
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const [projection, setProjection] = useState<MatchConsoleResponse>();
  const [status, setStatus] = useState<ConsoleStatus>({ kind: 'loading' });
  const [stale, setStale] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeIdempotencyKey, setFinalizeIdempotencyKey] = useState<string>();
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
  const [pendingMutations, setPendingMutations] = useState<readonly QueuedMutation[]>([]);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number>();
  const [syncDetailShown, setSyncDetailShown] = useState(false);
  const [ledgerExpanded, setLedgerExpanded] = useState(false);
  const projectionVersion = useRef(0);
  const finalizationInFlight = useRef(false);
  const drainingRef = useRef(false);
  const redriveRequestedRef = useRef(false);

  const reload = useCallback(
    (): Promise<void> =>
      api
        .fetchMatchConsole(organizationAlias, tournamentAlias, matchId)
        .then((loaded) => {
          setProjection(loaded);
          projectionVersion.current = loaded.projectionVersion;
          setSelectedSegmentId(
            (current) =>
              current ||
              loaded.segments.find((one) => one.state === 'active')?.segmentId ||
              loaded.segments[0]?.segmentId ||
              '',
          );
          setSelectedSide((current) => current || loaded.entrants[0]?.entrantId || '');
          setSelectedPersonId((current) => current || loaded.eligiblePersonIds[0] || '');
          setSelectedStaffId((current) => current || loaded.eligibleStaffIds[0] || '');
          setStatus({ kind: 'ready' });
          setStale(false);
        })
        .catch(() =>
          setStatus({
            kind: 'error',
            message: intl.formatMessage(messages.matchConsoleLoadFailed),
          }),
        ),
    [api, matchId, organizationAlias, tournamentAlias, intl],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const refreshPendingMutations = useCallback(async (): Promise<void> => {
    setPendingMutations(await listPending(matchId));
  }, [matchId]);

  // The durable-queue counterpart to `reload()` above: drains every queued
  // action for this match, sequentially, in original order (design.md's
  // "Queue replay order" decision) — a refusal surfaces against that one
  // item and the drain continues; a network-level failure just pauses it
  // for the next trigger (`online`, an SSE reconnect, or the periodic
  // fallback below), without treating "still offline" as an error.
  const drain = useCallback(async (): Promise<void> => {
    // A call arriving while a drain is already running doesn't just no-op —
    // it asks the in-flight drain to run one more pass once it's done, so
    // an item enqueued mid-drain (two actions fired in quick succession)
    // still gets picked up instead of waiting for the next external trigger.
    if (drainingRef.current) {
      redriveRequestedRef.current = true;
      return;
    }
    drainingRef.current = true;
    try {
      do {
        redriveRequestedRef.current = false;
        const outcomes = await drainQueue(api, matchId);
        await refreshPendingMutations();
        if (outcomes.some((outcome) => outcome.kind === 'sent')) {
          setLastSyncedAt(currentEpochMilliseconds());
          await reload();
        }
        const refused = outcomes.find((outcome) => outcome.kind === 'refused');
        if (refused && refused.kind === 'refused') {
          setStatus({ kind: 'error', message: refused.reason });
        }
      } while (redriveRequestedRef.current);
    } finally {
      drainingRef.current = false;
    }
  }, [api, matchId, reload, refreshPendingMutations]);

  // Refresh-survivability (design.md): reopening the console for this match
  // reloads whatever was already queued and resumes draining it. Nested
  // inside a promise chain rather than called directly — the same
  // react-hooks/set-state-in-effect workaround `PreferencesRoute.tsx`
  // already established for a mount-time call into a setState-ing
  // async function.
  useEffect(() => {
    Promise.resolve()
      .then(() => refreshPendingMutations())
      .then(() => drain());
  }, [refreshPendingMutations, drain]);

  // `navigator.onLine` is a hint, not the source of truth (design.md's
  // "Reachability" decision) — it triggers a drain attempt promptly, but a
  // drain that then fails with a network error just re-pauses rather than
  // trusting the browser's own online/offline signal.
  useEffect(() => {
    function handleOnline(): void {
      setOnline(true);
      void drain();
    }
    function handleOffline(): void {
      setOnline(false);
    }
    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);
    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
    };
  }, [drain]);

  // Periodic fallback for the queue, mirroring the `stale`-projection retry
  // below — the queue does not depend on catching every `online` event or
  // SSE reconnect correctly.
  useEffect(() => {
    if (pendingMutations.length === 0) return undefined;
    const timeout = globalThis.setTimeout(() => void drain(), RECONCILIATION_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timeout);
  }, [pendingMutations.length, drain]);

  useEffect(() => {
    const stream = api.matchConsoleStream?.(organizationAlias);
    if (!stream) return undefined;

    const realtime = new RealtimeClient({
      url: stream.url,
      accessToken: stream.accessToken,
      heartbeatTimeoutMs: RECONCILIATION_TIMEOUT_MS,
    });
    void realtime.connect({
      onEvent: (event) => {
        if (
          event.eventType === 'match.console-projection' &&
          event.entityId === matchId &&
          event.projectionVersion > projectionVersion.current
        ) {
          void reload();
        }
      },
      onProjectionRequired: () => void reload(),
      onFailure: () => setStale(true),
      // A successful (re)connection is one of the queue's drain triggers
      // (design.md task 3.3) — it fires on the very first connect too, which
      // is exactly the "reopening the console resumes draining" moment.
      onOpen: () => void drain(),
    });
    return () => realtime.close();
  }, [api, matchId, organizationAlias, reload, drain]);

  useEffect(() => {
    if (!stale) return undefined;
    const timeout = globalThis.setTimeout(() => void reload(), RECONCILIATION_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timeout);
  }, [reload, stale]);

  if (!projection) {
    return (
      <Alert tone="destructive">
        {status.kind === 'error'
          ? status.message
          : intl.formatMessage(messages.matchConsoleLoading)}
      </Alert>
    );
  }

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
  const displayedEvents = projection.events.filter((event) => {
    if (eventCategory === 'all') return true;
    return (
      projection.eventDefinitions.find((definition) => definition.code === event.definitionCode)
        ?.category === eventCategory
    );
  });
  const newestFirst = [...displayedEvents].reverse();
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

  // Write-ahead (design.md's own decision, by name): persisted to the
  // durable queue *before* any send is attempted, so a dropped connection —
  // whether detected up front or discovered only when the send itself fails
  // — never loses the action. `drain()` performs (and reports) the actual
  // attempt; this only ever queues, applies the optimistic patch, and then
  // asks for a drain.
  async function mutate(action: QueuedAction, optimistic?: () => void): Promise<void> {
    setStale(true);
    optimistic?.();
    await enqueue(action, newIdempotencyKey(), currentEpochMilliseconds());
    await refreshPendingMutations();
    await drain();
  }

  /**
   * Queued like every other mutating command (0123's requirement covers these
   * too), so a whistle blown in a dead zone is replayed rather than lost. The
   * optimistic patch mirrors what the server does: only one segment runs, so
   * starting one stops whichever was running.
   */
  async function issueClockCommand(command: SegmentClockCommand): Promise<void> {
    const resulting = SEGMENT_STATE_AFTER[command];
    await mutate(
      {
        kind: 'clock-command',
        organizationAlias,
        tournamentAlias,
        matchId,
        command,
        segmentId: selectedSegmentId,
      },
      () =>
        setProjection((current) =>
          current
            ? {
                ...current,
                segments: current.segments.map((segment) =>
                  segment.segmentId === selectedSegmentId
                    ? { ...segment, state: resulting }
                    : resulting === 'active' && segment.state === 'active'
                      ? { ...segment, state: 'pending' }
                      : segment,
                ),
              }
            : current,
        ),
    );
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
    const payloadDescription = descriptionFor(definition, description);
    const secondaryActorPayload = Object.fromEntries(
      definition.secondaryActorFields
        .map(({ field }) => [field, secondaryActorSelections[field]] as const)
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    const payload = {
      ...secondaryActorPayload,
      ...(payloadDescription === undefined ? {} : { description: payloadDescription }),
    };
    void mutate(
      {
        kind: 'record-event',
        organizationAlias,
        tournamentAlias,
        matchId,
        request: {
          definitionCode: definition.code,
          segmentId: activeSegment.segmentId,
          occurredAt,
          ...(definition.actorRequirement === 'none' ? {} : { side: selectedSide }),
          ...(definition.actorRequirement === 'person' ||
          definition.actorRequirement === 'person-or-staff'
            ? { personId: selectedPersonId || selectedStaffId }
            : {}),
          ...(Object.keys(payload).length === 0 ? {} : { payload }),
          ...(logNote.trim() === '' ? {} : { notes: logNote.trim() }),
        },
      },
      () =>
        setProjection((current) =>
          current
            ? {
                ...current,
                events: [
                  ...current.events,
                  {
                    eventId: `pending-${occurredAt}`,
                    definitionCode: definition.code,
                    segmentId: activeSegment.segmentId,
                    sequence: current.events.length + 1,
                    occurredAt: new Date(occurredAt).toISOString(),
                    ...(definition.actorRequirement === 'none' ? {} : { side: selectedSide }),
                    ...(definition.actorRequirement === 'person' ||
                    definition.actorRequirement === 'person-or-staff'
                      ? { personId: selectedPersonId || selectedStaffId }
                      : {}),
                    ...(logNote.trim() === '' ? {} : { notes: logNote.trim() }),
                  },
                ],
              }
            : current,
        ),
    );
    setConditionalEvent(undefined);
    setPendingOccurredAt(undefined);
    setDescription('');
    setLogNote('');
    setSecondaryActorSelections({});
    setActiveSecondaryField(undefined);
  }

  async function finalize(): Promise<void> {
    if (!projection || finalizationInFlight.current) return;
    finalizationInFlight.current = true;
    const current = projection;
    const idempotencyKey = finalizeIdempotencyKey ?? newIdempotencyKey();
    setFinalizeIdempotencyKey(idempotencyKey);
    setFinalizing(true);
    const request = {
      sides: current.entrants.map(({ entrantId }) => ({ entrantId, statistics: {} })),
      ...(finalizeWinner ? { winnerEntrantId: finalizeWinner } : {}),
    };
    // Write-ahead here too (design.md: "a queued finalize... is refused and
    // surfaced for the operator to resolve explicitly", not excluded from
    // the durable queue) — but finalize keeps its own direct send rather
    // than the generic `drain()`, so its existing explicit-confirm UX and
    // idempotency-key-reuse-across-retries behavior stay exactly as they
    // are; only the "never silently lost" guarantee is new.
    await enqueue(
      { kind: 'finalize', organizationAlias, tournamentAlias, matchId, request },
      idempotencyKey,
      currentEpochMilliseconds(),
    );
    await refreshPendingMutations();
    try {
      await api.finalizeMatch(organizationAlias, tournamentAlias, matchId, request, idempotencyKey);
      await markSent(idempotencyKey);
      await reload();
      setConfirmingFinalize(false);
      setFinalizeIdempotencyKey(undefined);
      setFinalizeWinner('');
    } catch (error) {
      if (error instanceof ControlApiError) {
        await markRefused(idempotencyKey, error.message);
        await refreshPendingMutations();
        setStatus({ kind: 'error', message: error.message });
      }
      // A network-level failure leaves it queued, silently — the sync-status
      // area communicates that, not an error banner (matching every other
      // queued mutation's behavior).
    } finally {
      await refreshPendingMutations();
      finalizationInFlight.current = false;
      setFinalizing(false);
    }
  }

  const breadcrumbNode = (
    <>
      {intl.formatMessage(messages.matchConsoleBreadcrumb, {
        tournamentAlias,
        matchId: matchId.slice(-8),
      })}
      {projection.status === 'scheduled' &&
        projection.segments.length === 0 &&
        projection.events.length === 0 && (
          <>
            {' · '}
            <a
              className="cl-focusable"
              href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/matches/${matchId}/load`}
              onClick={controlLinkClick(
                `/control/${organizationAlias}/tournaments/${tournamentAlias}/matches/${matchId}/load`,
              )}
            >
              <FormattedMessage {...messages.matchConsoleLoadMatchData} />
            </a>
          </>
        )}
    </>
  );

  const titleNode = <FormattedMessage {...messages.matchConsoleTitle} />;

  const statusNode = (
    <>
      <strong>
        {projection.status === 'in-progress'
          ? intl.formatMessage(messages.matchConsoleLive)
          : projection.status.toUpperCase()}
      </strong>
      <ClockRing
        durationSeconds={activeSegment?.durationSeconds}
        elapsedSeconds={activeSegment?.elapsedSeconds ?? 0}
      />
    </>
  );

  const alertsNode = (
    <>
      {status.kind === 'error' && <Alert tone="destructive">{status.message}</Alert>}
      {stale && (
        <Alert tone="info">
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
                    onClick={() =>
                      void remove(mutation.id).then(() => void refreshPendingMutations())
                    }
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

  // One glanceable icon, because "can I reach the server" is the only
  // connectivity question this screen's operator asks mid-match. The queued
  // count and last-synced time still matter — but as the answer to a question
  // asked deliberately, so they are disclosed on hover or focus rather than
  // permanently spending the space the console needs for its controls.
  // `role="status"` names itself from `aria-label` rather than its content, so
  // the same sentence serves twice: as the icon's accessible name, and as the
  // live-region text a screen reader announces the moment the state flips.
  const syncStateLabel = intl.formatMessage(messages.matchConsoleSyncState, {
    state: online
      ? intl.formatMessage(messages.matchConsoleOnline)
      : intl.formatMessage(messages.matchConsoleOffline),
  });
  const syncStatusNode = (
    <div
      className="cl-sync-indicator"
      onBlur={() => setSyncDetailShown(false)}
      onFocus={() => setSyncDetailShown(true)}
      onMouseEnter={() => setSyncDetailShown(true)}
      onMouseLeave={() => setSyncDetailShown(false)}
    >
      <span
        aria-label={syncStateLabel}
        className={`cl-sync-indicator__icon cl-sync-indicator__icon--${online ? 'online' : 'offline'} cl-focusable`}
        role="status"
        tabIndex={0}
      >
        <span aria-hidden="true" className="cl-sync-indicator__dot" />
        <span className="cl-visually-hidden">{syncStateLabel}</span>
      </span>
      {syncDetailShown && (
        <div className="cl-sync-indicator__detail">
          <span>
            {intl.formatMessage(messages.matchConsoleQueuedCount, {
              count: pendingMutations.filter((mutation) => mutation.status === 'pending').length,
            })}
          </span>
          <span>
            {lastSyncedAt === undefined
              ? intl.formatMessage(messages.matchConsoleNeverSynced)
              : intl.formatMessage(messages.matchConsoleLastSynced, {
                  time: new Date(lastSyncedAt).toLocaleTimeString(intl.locale),
                })}
          </span>
        </div>
      )}
    </div>
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
            <strong>{side.score}</strong>
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
                label: `${segment.type} ${segment.number} · ${segment.state}`,
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
            onClick={() =>
              void mutate(
                {
                  kind: 'clock-adjust',
                  organizationAlias,
                  tournamentAlias,
                  matchId,
                  request: {
                    segmentId: selectedSegmentId,
                    elapsedSeconds: Number(elapsedSeconds),
                    activate: true,
                  },
                },
                () =>
                  setProjection((current) =>
                    current
                      ? {
                          ...current,
                          segments: current.segments.map((segment) => ({
                            ...segment,
                            state:
                              segment.segmentId === selectedSegmentId
                                ? 'active'
                                : segment.state === 'active'
                                  ? 'pending'
                                  : segment.state,
                            ...(segment.segmentId === selectedSegmentId
                              ? { elapsedSeconds: Number(elapsedSeconds) }
                              : {}),
                          })),
                        }
                      : current,
                  ),
              )
            }
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
                onClick={() => void issueClockCommand(command)}
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
              onSaved={() => void reload()}
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
              <Alert tone="info">
                <FormattedMessage {...messages.matchConsoleNoRosterSelected} />
                {canSelectRoster && (
                  <>
                    {' '}
                    <Button
                      onClick={() => setRosterStepOpen(true)}
                      type="button"
                      variant="secondary"
                    >
                      <FormattedMessage {...messages.matchConsoleSelectRoster} />
                    </Button>
                  </>
                )}
              </Alert>
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
                    label: personId.slice(-8),
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
            <Alert block tone="info">
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
                <Button
                  onClick={() => {
                    setConfirmingFinalize(false);
                    setFinalizeIdempotencyKey(undefined);
                    setFinalizeWinner('');
                  }}
                  type="button"
                  variant="secondary"
                >
                  <FormattedMessage {...messages.matchConsoleCancel} />
                </Button>
                <Button
                  disabled={finalizing}
                  onClick={() => void finalize()}
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
                    onClick={() =>
                      void mutate(
                        {
                          kind: 'timer-resolve',
                          organizationAlias,
                          tournamentAlias,
                          matchId,
                          timerId: timer.timerId,
                        },
                        () =>
                          setProjection((current) =>
                            current
                              ? {
                                  ...current,
                                  runningTimers: current.runningTimers.filter(
                                    (candidate) => candidate.timerId !== timer.timerId,
                                  ),
                                }
                              : current,
                          ),
                      )
                    }
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
                {category === 'all' ? intl.formatMessage(messages.matchConsoleAll) : category}
              </Button>
            ))}
          </div>
          <ol className="cl-platform-update-list">
            {ledgerEvents.map((event) => (
              <li key={event.eventId} className="cl-role-user">
                <strong>
                  {event.definitionCode} ·{' '}
                  {segmentLabel(
                    projection,
                    event.segmentId,
                    intl.formatMessage(messages.matchConsoleUnknownSegment),
                  )}
                  {event.segmentElapsedSeconds === undefined
                    ? null
                    : ` · ${formatClock(event.segmentElapsedSeconds)}`}
                </strong>
                <span>{new Date(event.occurredAt).toLocaleTimeString(intl.locale)}</span>
                {event.notes ? <p className="cl-card__description">{event.notes}</p> : null}
              </li>
            ))}
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
    </>
  );

  return (
    <MatchConsoleLayout
      alerts={alertsNode}
      breadcrumb={breadcrumbNode}
      primary={primaryNode}
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
