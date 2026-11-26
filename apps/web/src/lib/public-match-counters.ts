import { API_PATH_PREFIX } from './api-path.js';
import { createCounterRefreshGate } from './counter-refresh.js';
import { getLiveScoreboardPatch, subscribeLiveScoreboardMatch } from './live-scoreboard-store.js';
import type { LiveMatchCounter } from './live-state.js';

export interface PublicMatchCountersSnapshot {
  readonly counters: readonly LiveMatchCounter[];
  readonly activePenalties: readonly {
    readonly timerId: string;
    readonly entrantId: string;
    readonly remainingSeconds: number;
  }[];
}

/**
 * Keeps a live match's counters current on its public page. A recorded event that one of the counters
 * tallies asks the server for the match's projection again, at most once a second, and the server's
 * tally replaces the shown one. The page never increments a counter itself.
 */
export function subscribePublicMatchCounters(
  options: {
    readonly matchId: string;
    readonly organizationAlias: string;
    readonly tournamentAlias: string;
    readonly counters: readonly LiveMatchCounter[];
  },
  onUpdate: (snapshot: PublicMatchCountersSnapshot) => void,
): () => void {
  const base = `${API_PATH_PREFIX}/organizations/${encodeURIComponent(options.organizationAlias)}/tournaments/${encodeURIComponent(options.tournamentAlias)}`;
  const counted = new Set(options.counters.flatMap((counter) => counter.events));
  let seenVersion = 0;

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch(`${base}/live`);
      if (!response.ok) return;
      const data = (await response.json()) as {
        matches?: readonly {
          matchId: string;
          counters?: readonly LiveMatchCounter[];
          activePenalties?: PublicMatchCountersSnapshot['activePenalties'];
        }[];
      };
      const match = data.matches?.find((candidate) => candidate.matchId === options.matchId);
      if (match) {
        onUpdate({
          counters: match.counters ?? [],
          activePenalties: match.activePenalties ?? [],
        });
      }
    } catch {
      // The page keeps the last tally it showed.
    }
  };

  const gate = createCounterRefreshGate(() => void refresh());
  const unsubscribe = subscribeLiveScoreboardMatch(options.matchId, () => {
    const patch = getLiveScoreboardPatch(options.matchId);
    const version = patch?.recordedEventVersion ?? 0;
    if (version <= seenVersion) return;
    seenVersion = version;
    if (patch?.recordedEventCode !== undefined && counted.has(patch.recordedEventCode)) {
      gate.request(options.matchId);
    }
  });
  return () => {
    unsubscribe();
    gate.dispose();
  };
}
