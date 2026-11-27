import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { RealtimeClient } from '@copalibre/realtime';
import {
  acceptEntrantResolution,
  applyEvent,
  markConnected,
  type LiveDashboard,
  type LiveMatch,
} from '../../lib/live-state.js';
import { measureSchedule, animateSchedule } from '../../lib/schedule-travel.js';
import type { PreviousPlacement } from '../../lib/reschedule.js';
import { resolveLiveTvMatchEvent } from '../../lib/tv-match-events.js';
import { findPinnedMatch, type PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import type { TvMatchEntry } from '../../lib/tv-match-list.js';
import type { TvMatchEvent } from '../../lib/tv-match-events.js';
import type { BroadcastAlertItem } from './ui/organisms/BroadcastAlertBanner.js';
import type { TvPresentation } from './tv-dashboard-types.js';

/** The realtime stream's inputs: what the dashboard shows, and the setters and refs its events write. */
export interface TvRealtimeInput {
  readonly streamPath: string;
  readonly presentation: TvPresentation;
  readonly refreshProjection: () => Promise<readonly LiveMatch[] | undefined>;
  readonly pinnedRef: PinnedMatchRef | undefined;
  readonly showBroadcastAlerts: boolean;
  readonly matchList: readonly TvMatchEntry[] | undefined;
  readonly rosterActors: Readonly<Record<string, string>> | undefined;
  readonly rosterActorsByMatchId:
    Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
  readonly eventLabelsByCode: Readonly<Record<string, string>>;
  readonly entrantVersions: { current: Map<string, number> };
  readonly scheduleVersions: { current: Map<string, number> };
  readonly dashboardRef: { current: LiveDashboard };
  readonly setDashboard: Dispatch<SetStateAction<LiveDashboard>>;
  readonly setScheduledMatches: Dispatch<SetStateAction<readonly TvMatchEntry[]>>;
  readonly setProjectionStale: Dispatch<SetStateAction<boolean>>;
  readonly setLiveMatchEventsById: Dispatch<
    SetStateAction<Readonly<Record<string, readonly TvMatchEvent[]>>>
  >;
  readonly setLiveMatchEvents: Dispatch<SetStateAction<readonly TvMatchEvent[]>>;
  readonly setAlertQueue: Dispatch<SetStateAction<readonly BroadcastAlertItem[]>>;
}

/**
 * The realtime stream. Every event refreshes the projection on its own; a scoring event classifies as an
 * alert on the pinned match, and a recorded event joins the ticker. Without a token it does nothing, and
 * the polling refresh alone keeps the dashboard current.
 */
export function useTvRealtime({
  streamPath,
  presentation,
  refreshProjection,
  pinnedRef,
  showBroadcastAlerts,
  matchList,
  rosterActors,
  rosterActorsByMatchId,
  eventLabelsByCode,
  entrantVersions,
  scheduleVersions,
  dashboardRef,
  setDashboard,
  setScheduledMatches,
  setProjectionStale,
  setLiveMatchEventsById,
  setLiveMatchEvents,
  setAlertQueue,
}: TvRealtimeInput): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = new URLSearchParams(window.location.search).get('token');

    // Case A: No token present in URL. Run polling fallback only, NEVER call RealtimeClient to avoid 401 loop
    if (!token) {
      return;
    }

    // Case B: Token is present. Layer SSE client on top
    const streamUrl = new URL(streamPath, window.location.origin);
    streamUrl.searchParams.set('surface', presentation === 'kiosk' ? 'kiosk' : 'overlay');
    const client = new RealtimeClient({
      url: streamUrl.pathname + streamUrl.search,
      accessToken: () => token,
      heartbeatTimeoutMs: 30_000,
    });

    void client.connect({
      onOpen: () => {
        setProjectionStale(false);
        setDashboard((current) => markConnected(current));
      },
      onEvent: (event) => {
        if (event.eventType === 'fixture.entrant-resolved') {
          if (acceptEntrantResolution(entrantVersions.current, event)) void refreshProjection();
          return;
        }
        if (event.eventType === 'match.rescheduled' || event.eventType === 'match.anulled') {
          const matchId = event.payload.matchId;
          if (
            typeof matchId !== 'string' ||
            event.projectionVersion <= (scheduleVersions.current.get(matchId) ?? 0)
          )
            return;
          scheduleVersions.current.set(matchId, event.projectionVersion);
          const positions = measureSchedule();
          setScheduledMatches((entries) => {
            if (event.eventType === 'match.anulled' || event.payload.withdrawn === true)
              return entries.filter((entry) => entry.key !== matchId);
            const source = entries.some((entry) => entry.key === matchId)
              ? entries
              : [...entries, ...(matchList?.filter((entry) => entry.key === matchId) ?? [])];
            return source
              .map((entry) =>
                entry.key !== matchId
                  ? entry
                  : {
                      ...entry,
                      scheduleVersion: event.projectionVersion,
                      scheduledAt:
                        typeof event.payload.startsAt === 'number'
                          ? new Date(event.payload.startsAt).toISOString()
                          : undefined,
                      venueName: (event.payload.venue as PreviousPlacement['venue'])?.name,
                      rescheduledFrom: (event.payload.previous as PreviousPlacement | null) ?? null,
                    },
              )
              .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
          });
          requestAnimationFrame(() => animateSchedule(positions));
          setDashboard((current) => applyEvent(current, event));
          return;
        }
        if (event.eventType === 'match.started') {
          setScheduledMatches((entries) =>
            entries.map((entry) =>
              entry.key === event.payload.matchId ? { ...entry, rescheduledFrom: null } : entry,
            ),
          );
        }
        setDashboard((current) => applyEvent(current, event));
        const eventMatchId =
          event.eventType === 'match.event-recorded' && typeof event.payload.matchId === 'string'
            ? event.payload.matchId
            : undefined;
        const before =
          eventMatchId === undefined
            ? undefined
            : dashboardRef.current.matches.find((match) => match.matchId === eventMatchId);
        void refreshProjection().then((updated) => {
          if (event.eventType !== 'match.event-recorded' || !before || !updated || !eventMatchId) {
            return;
          }
          const after = updated.find((m) => m.matchId === eventMatchId);
          if (!after) return;
          const resolved = resolveLiveTvMatchEvent(
            { eventId: event.eventId, payload: event.payload },
            {
              homeEntrantId: after.sides[0]?.entrantId,
              awayEntrantId: after.sides[1]?.entrantId,
              actors: rosterActorsByMatchId?.[eventMatchId] ?? rosterActors ?? {},
              labelsByCode: eventLabelsByCode,
            },
          );
          if (!resolved) return;
          setLiveMatchEventsById((current) => {
            const events = current[eventMatchId] ?? [];
            return events.some((item) => item.eventId === resolved.eventId)
              ? current
              : { ...current, [eventMatchId]: [...events, resolved] };
          });
          if (pinnedRef !== undefined && findPinnedMatch([after], pinnedRef)) {
            setLiveMatchEvents((current) =>
              current.some((item) => item.eventId === resolved.eventId)
                ? current
                : [...current, resolved],
            );
          }
          if (
            !showBroadcastAlerts ||
            pinnedRef === undefined ||
            !findPinnedMatch([after], pinnedRef)
          )
            return;
          const scoring = after.sides.some(
            (side, index) => side.score !== before.sides[index]?.score,
          );
          setAlertQueue((current) => [
            ...current,
            { event: resolved, kind: scoring ? 'scoring' : 'notable' },
          ]);
        });
      },
      // DO NOT RELOAD PAGE ON PROJECTION REQUIRED. Refresh in-memory projection instead
      onProjectionRequired: () => {
        void refreshProjection();
      },
      onFailure: () => {
        setProjectionStale(true);
        void refreshProjection();
      },
    });

    return () => client.close();
    // Deliberately narrow deps: reconnecting SSE on every render of a prop that changes is worse than a stale closure here: pinnedRef/rosterActors/showBroadcastAlerts are server-supplied once at mount (same treatment matchEvents itself already gets), and eventLabelsByCode only grows from the same static matchEvents.
  }, [streamPath, refreshProjection, presentation]);
}
