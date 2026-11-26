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

/** The public events that change what a match page shows while it is not yet over. */
const REFRESH_EVENTS: ReadonlySet<string> = new Set([
  'match.started',
  'match.event-recorded',
  'match.clock-changed',
  'result.superseded',
]);

export interface PublicMatchCountersWatch {
  /** Turns the 15 s reconcile on while the match is live, and off otherwise. */
  setLive(live: boolean): void;
  /**
   * The match has ended: cancels a pending refresh and any refresh in flight, fetches the match report
   * once for its final match-scope counters, and stops. Idempotent.
   */
  finish(): void;
  dispose(): void;
}

/**
 * Follows a match's counters and active penalties on its public page, from the raw public event stream
 * (not the version-guarded patch). It refreshes from the live projection at most once a second while the
 * match is not over, and reconciles every 15 s while `setLive(true)`. When the match ends, `finish()` takes
 * the final counters from the match report, so a tally that a pending refresh would have carried is never
 * left one short. The page never increments a counter itself.
 */
export function watchPublicMatchCounters(
  options: {
    readonly matchId: string;
    readonly organizationAlias: string;
    readonly tournamentAlias: string;
    readonly stageNumber: number;
    readonly matchOrdinal: number;
  },
  handlers: {
    readonly onUpdate: (snapshot: PublicMatchCountersSnapshot) => void;
    readonly onFinal: (counters: readonly LiveMatchCounter[]) => void;
  },
): PublicMatchCountersWatch {
  const base = `${API_PATH_PREFIX}/organizations/${encodeURIComponent(options.organizationAlias)}/tournaments/${encodeURIComponent(options.tournamentAlias)}`;
  let over = false;
  let disposed = false;
  let reconcile: number | undefined;

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch(`${base}/live`);
      if (!response.ok || over) return;
      const data = (await response.json()) as {
        matches?: readonly {
          matchId: string;
          counters?: readonly LiveMatchCounter[];
          activePenalties?: PublicMatchCountersSnapshot['activePenalties'];
        }[];
      };
      const match = data.matches?.find((candidate) => candidate.matchId === options.matchId);
      if (match && !over) {
        handlers.onUpdate({
          counters: match.counters ?? [],
          activePenalties: match.activePenalties ?? [],
        });
      }
    } catch {
      // The page keeps the last tally it showed.
    }
  };

  const gate = createCounterRefreshGate(() => void refresh());

  const finish = (): void => {
    if (over) return;
    over = true;
    gate.dispose();
    stopReconcile();
    unsubscribe();
    void (async () => {
      try {
        const response = await fetch(
          `${base}/stages/${options.stageNumber}/matches/${options.matchOrdinal}`,
        );
        if (!response.ok) return;
        const report = (await response.json()) as { counters?: readonly LiveMatchCounter[] };
        if (!disposed) handlers.onFinal(report.counters ?? []);
      } catch {
        // The page keeps the last tally it showed.
      }
    })();
  };

  const stopReconcile = (): void => {
    if (reconcile !== undefined) window.clearInterval(reconcile);
    reconcile = undefined;
  };

  const unsubscribe = subscribeLiveScoreboardEvents(options.matchId, (event: EventEnvelope) => {
    if (over) return;
    if (event.eventType === 'match.finalized') {
      finish();
    } else if (REFRESH_EVENTS.has(event.eventType)) {
      gate.request();
    }
  });

  return {
    setLive(live) {
      if (over) return;
      if (live && reconcile === undefined) {
        reconcile = window.setInterval(() => void refresh(), PUBLIC_COUNTERS_RECONCILE_MS);
      } else if (!live) {
        stopReconcile();
      }
    },
    finish,
    dispose() {
      over = true;
      disposed = true;
      gate.dispose();
      stopReconcile();
      unsubscribe();
    },
  };
}
