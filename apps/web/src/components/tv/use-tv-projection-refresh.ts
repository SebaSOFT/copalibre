import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { PublicMatchesViewResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { API_PATH_PREFIX } from '../../lib/api-path.ts';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import { overlayLive, settleLeftLive, type SnapshotScore } from '../../lib/tv-dashboard-source.js';
import { tvMatchEntriesOf, type TvMatchEntry } from '../../lib/tv-match-list.js';
import type { PublicSeriesState } from '../../lib/series.js';
import type { TvDashboardLabels } from './tv-types.js';

/**
 * The projection refresh: fetches the live state and the schedule, and polls them every `pollIntervalMs`.
 * Returns the refresh itself, which the realtime stream also calls per event. It resolves to the freshly
 * fetched live matches, which the alert banner diffs against.
 */
export function useTvProjectionRefresh({
  organizationAlias,
  tournamentAlias,
  dashboardLabels,
  pollIntervalMs,
  scheduleVersions,
  setDashboard,
  setProjectionStale,
  setScheduledMatches,
}: {
  readonly organizationAlias: string | undefined;
  readonly tournamentAlias: string | undefined;
  readonly dashboardLabels: TvDashboardLabels;
  readonly pollIntervalMs: number;
  readonly scheduleVersions: { readonly current: Map<string, number> };
  readonly setDashboard: Dispatch<SetStateAction<LiveDashboard>>;
  readonly setProjectionStale: Dispatch<SetStateAction<boolean>>;
  readonly setScheduledMatches: Dispatch<SetStateAction<readonly TvMatchEntry[]>>;
}): () => Promise<readonly LiveMatch[] | undefined> {
  // 2. Polling Refresh Handler (Fallback when tokenless or projection out of sync)
  // Returns the freshly-fetched matches (the alert banner diffs
  // scores against this return value directly, rather than racing React's
  // own state-update timing) — every existing caller already discards it.
  const refreshProjection = useCallback(async (): Promise<readonly LiveMatch[] | undefined> => {
    if (!organizationAlias || !tournamentAlias) return undefined;
    try {
      const base = `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}`;
      const [res, scheduleResponse] = await Promise.all(
        ['live', 'matches-view'].map((path) => fetch(`${base}/${path}`)),
      );
      let scheduleRefreshed = false;
      const snapshotScores = new Map<string, SnapshotScore>();
      if (scheduleResponse?.ok) {
        const snapshot = (await scheduleResponse.json()) as PublicMatchesViewResponse;
        if (
          Array.isArray(snapshot.matches) &&
          snapshot.matches.every((match) => typeof match.status === 'string')
        ) {
          scheduleRefreshed = true;
          for (const match of snapshot.matches) {
            snapshotScores.set(match.matchId, {
              state: match.status,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
            });
          }
          const entries = tvMatchEntriesOf(
            snapshot.matches.map((match) => ({
              ...match,
              state: match.status,
              series: match.series as PublicSeriesState | undefined,
            })),
            {
              state: dashboardLabels.resultState,
              delayed: dashboardLabels.delayed,
              round: dashboardLabels.bracketRound,
              sideSource: dashboardLabels.sideSource,
              zonePrefix: dashboardLabels.zonePrefix,
            },
            Date.now(),
          );
          setScheduledMatches((current) =>
            entries.flatMap((entry) => {
              const version = scheduleVersions.current.get(entry.key) ?? 0;
              if ((entry.scheduleVersion ?? 0) < version) {
                const held = current.find((match) => match.key === entry.key);
                return held ? [held] : [];
              }
              scheduleVersions.current.set(entry.key, entry.scheduleVersion ?? 0);
              return [entry];
            }),
          );
        }
      }
      if (res?.ok) {
        const liveData = await res.json();
        if (liveData && Array.isArray(liveData.matches)) {
          const liveMatches = liveData.matches as readonly LiveMatch[];
          const liveIds = new Set(liveMatches.map((match) => match.matchId));
          setProjectionStale(!scheduleRefreshed);
          setDashboard((current) => ({
            ...current,
            matches: settleLeftLive(
              overlayLive(current, { ...current, matches: liveMatches }).matches,
              liveIds,
              snapshotScores,
            ),
          }));
          return liveMatches;
        }
      }
      setProjectionStale(true);
    } catch {
      // Keep the server-rendered projection and identify it as last known.
      setProjectionStale(true);
    }
    return undefined;
  }, [
    organizationAlias,
    tournamentAlias,
    dashboardLabels.resultState,
    dashboardLabels.delayed,
    dashboardLabels.bracketRound,
    dashboardLabels.sideSource,
    dashboardLabels.zonePrefix,
    scheduleVersions,
    setDashboard,
    setProjectionStale,
    setScheduledMatches,
  ]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const pollTimer = window.setInterval(() => void refreshProjection(), pollIntervalMs);
    return () => window.clearInterval(pollTimer);
  }, [pollIntervalMs, refreshProjection]);

  return refreshProjection;
}
