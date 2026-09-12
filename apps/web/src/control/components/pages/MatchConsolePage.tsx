import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Alert } from '../ui/atoms/alert.js';
import { RealtimeClient } from '@copalibre/realtime';
import {
  ControlApiError,
  createControlApiClient,
  type ConsoleEventDefinition,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
  type SegmentClockCommand,
} from '../../lib/api-client.js';
import {
  currentEpochMilliseconds,
  descriptionFor,
  newIdempotencyKey,
} from '../../lib/match-console.js';
import { controlTokenStore } from '../../session/token-store.js';
import {
  drainQueue,
  enqueue,
  listPending,
  markRefused,
  markSent,
  remove,
  type QueuedAction,
  type QueuedMutation,
} from '../../lib/offline-queue.js';
import { MatchConsoleTemplate, type RecordEventContext } from '../screens/MatchConsoleTemplate.js';
import { messages } from '../../i18n/messages.en.js';

const RECONCILIATION_TIMEOUT_MS = 8_000;

const SEGMENT_STATE_AFTER: Readonly<
  Record<SegmentClockCommand, 'active' | 'pending' | 'completed'>
> = {
  start: 'active',
  resume: 'active',
  pause: 'pending',
  end: 'completed',
};

export type ConsoleStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Fetches, subscribes, and queues (openspec 0225 task 6.1): every effect and
 * every function that reaches the API client or the durable offline queue
 * lives here. `MatchConsoleTemplate` composes the screen from the data and
 * callbacks this passes down, and holds none of its own — the split the
 * fetch-and-compose route drift left undone.
 */
export function MatchConsolePage({
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
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeIdempotencyKey, setFinalizeIdempotencyKey] = useState<string>();
  const [pendingMutations, setPendingMutations] = useState<readonly QueuedMutation[]>([]);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number>();
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
  // react-hooks/set-state-in-effect workaround `PreferencesPage.tsx`
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
  async function issueClockCommand(command: SegmentClockCommand, segmentId: string): Promise<void> {
    const resulting = SEGMENT_STATE_AFTER[command];
    await mutate(
      { kind: 'clock-command', organizationAlias, tournamentAlias, matchId, command, segmentId },
      () =>
        setProjection((current) =>
          current
            ? {
                ...current,
                segments: current.segments.map((segment) =>
                  segment.segmentId === segmentId
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

  async function applyClock(segmentId: string, elapsedSeconds: number): Promise<void> {
    await mutate(
      {
        kind: 'clock-adjust',
        organizationAlias,
        tournamentAlias,
        matchId,
        request: { segmentId, elapsedSeconds, activate: true },
      },
      () =>
        setProjection((current) =>
          current
            ? {
                ...current,
                segments: current.segments.map((segment) => ({
                  ...segment,
                  state:
                    segment.segmentId === segmentId
                      ? 'active'
                      : segment.state === 'active'
                        ? 'pending'
                        : segment.state,
                  ...(segment.segmentId === segmentId ? { elapsedSeconds } : {}),
                })),
              }
            : current,
        ),
    );
  }

  function recordEvent(
    definition: ConsoleEventDefinition,
    occurredAt: number,
    context: RecordEventContext,
  ): void {
    const activeSegment = projection?.segments.find((segment) => segment.state === 'active');
    if (!activeSegment) return;
    const {
      selectedSide,
      selectedPersonId,
      selectedStaffId,
      secondaryActorSelections,
      description,
      logNote,
    } = context;
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
  }

  function resolveTimer(timerId: string): void {
    void mutate(
      { kind: 'timer-resolve', organizationAlias, tournamentAlias, matchId, timerId },
      () =>
        setProjection((current) =>
          current
            ? {
                ...current,
                runningTimers: current.runningTimers.filter(
                  (candidate) => candidate.timerId !== timerId,
                ),
              }
            : current,
        ),
    );
  }

  function dismissMutation(mutationId: string): void {
    void remove(mutationId).then(() => void refreshPendingMutations());
  }

  function cancelFinalize(): void {
    setFinalizeIdempotencyKey(undefined);
  }

  async function finalize(winnerEntrantId: string): Promise<boolean> {
    if (!projection || finalizationInFlight.current) return false;
    finalizationInFlight.current = true;
    const current = projection;
    const idempotencyKey = finalizeIdempotencyKey ?? newIdempotencyKey();
    setFinalizeIdempotencyKey(idempotencyKey);
    setFinalizing(true);
    const request = {
      sides: current.entrants.map(({ entrantId }) => ({ entrantId, statistics: {} })),
      ...(winnerEntrantId ? { winnerEntrantId } : {}),
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
    let succeeded = false;
    try {
      await api.finalizeMatch(organizationAlias, tournamentAlias, matchId, request, idempotencyKey);
      await markSent(idempotencyKey);
      await reload();
      setFinalizeIdempotencyKey(undefined);
      succeeded = true;
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
    return succeeded;
  }

  if (!projection) {
    return (
      <Alert tone="destructive">
        {status.kind === 'error'
          ? status.message
          : intl.formatMessage(messages.matchConsoleLoading)}
      </Alert>
    );
  }

  return (
    <MatchConsoleTemplate
      api={api}
      finalizing={finalizing}
      lastSyncedAt={lastSyncedAt}
      matchId={matchId}
      onApplyClock={applyClock}
      onCancelFinalize={cancelFinalize}
      onDismissMutation={dismissMutation}
      onFinalize={finalize}
      onIssueClockCommand={issueClockCommand}
      onRecordEvent={recordEvent}
      onResolveTimer={resolveTimer}
      onRosterSaved={() => void reload()}
      online={online}
      organizationAlias={organizationAlias}
      pendingMutations={pendingMutations}
      projection={projection}
      stale={stale}
      status={status}
      tournamentAlias={tournamentAlias}
    />
  );
}
