import type { EventEnvelope } from '@copalibre/realtime';
import { API_PATH_PREFIX } from './api-path.js';
import { createCounterRefreshGate } from './counter-refresh.js';
import { subscribeLiveScoreboardEvents } from './live-scoreboard-store.js';
import type { LiveMatchCounter } from './live-state.js';

export interface PublicMatchCountersSnapshot {
  readonly counters: readonly LiveMatchCounter[];
  readonly activePenalties: readonly {
    readonly timerId: string;
    readonly entrantId: string;
    readonly remainingSeconds: number;
  }[];
}

/** The reconcile interval while a match is live. The public stream has no timer event, so this covers it. */
export const PUBLIC_COUNTERS_RECONCILE_MS = 15_000;

/**
 * The public events that change what a match page shows: a recorded event (a counted one, or a timed
 * penalty), a clock change (a segment starts or ends), the match's end, and a superseded result.
 */
const REFRESH_EVENTS: ReadonlySet<string> = new Set([
  'match.event-recorded',
  'match.clock-changed',
  'match.finalized',
  'result.superseded',
]);

/**
 * Keeps a live match's counters and active penalties current on its public page. Refreshes come from the
 * raw event stream (not the version-guarded patch), at most once a second, and a 15 s reconcile runs
 * while the subscription lives. The server's projection replaces the shown values, and the page never
 * increments a counter itself.
 */
export function subscribePublicMatchCounters(
  options: {
    readonly matchId: string;
    readonly organizationAlias: string;
    readonly tournamentAlias: string;
  },
  onUpdate: (snapshot: PublicMatchCountersSnapshot) => void,
): () => void {
  const base = `${API_PATH_PREFIX}/organizations/${encodeURIComponent(options.organizationAlias)}/tournaments/${encodeURIComponent(options.tournamentAlias)}`;
  let active = true;

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch(`${base}/live`);
      if (!response.ok || !active) return;
      const data = (await response.json()) as {
        matches?: readonly {
          matchId: string;
          counters?: readonly LiveMatchCounter[];
          activePenalties?: PublicMatchCountersSnapshot['activePenalties'];
        }[];
      };
      const match = data.matches?.find((candidate) => candidate.matchId === options.matchId);
      if (match && active) {
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
  const unsubscribe = subscribeLiveScoreboardEvents(options.matchId, (event: EventEnvelope) => {
    if (REFRESH_EVENTS.has(event.eventType)) gate.request();
  });
  const reconcile = window.setInterval(() => void refresh(), PUBLIC_COUNTERS_RECONCILE_MS);
  return () => {
    active = false;
    unsubscribe();
    window.clearInterval(reconcile);
    gate.dispose();
  };
}
