import { RealtimeClient, type EventEnvelope } from '@copalibre/realtime';
import {
  publishLiveScoreboardEvent,
  seedLiveScoreboardMatch,
  setLiveStreamStatus,
  type LiveScoreboardMatchPatch,
} from './live-scoreboard-store.js';

function seedMatchesFromRoot(root: ParentNode): string | undefined {
  let latestInitialAt: string | undefined;
  for (const el of root.querySelectorAll<HTMLElement>('[data-live-match-seed]')) {
    const raw = el.dataset.liveMatchSeed;
    if (!raw) continue;
    try {
      const seed = JSON.parse(raw) as LiveScoreboardMatchPatch;
      if (!seed.matchId) continue;
      seedLiveScoreboardMatch(seed);
      if (seed.clock?.asOf && (!latestInitialAt || seed.clock.asOf > latestInitialAt)) {
        latestInitialAt = seed.clock.asOf;
      }
    } catch {
      // Ignore malformed seed JSON.
    }
  }
  return latestInitialAt;
}

function patchDomMatchScores(root: ParentNode, event: EventEnvelope): void {
  const matchId = typeof event.payload.matchId === 'string' ? event.payload.matchId : undefined;
  const rawScores = event.payload.scores;
  if (!matchId || typeof rawScores !== 'object' || rawScores === null) return;
  const scores = rawScores as Record<string, unknown>;
  for (const el of root.querySelectorAll<HTMLElement>('[data-live-score-match]')) {
    if (el.dataset.liveScoreMatch !== matchId) continue;
    const entrantId = el.dataset.liveScoreEntrant;
    if (entrantId && typeof scores[entrantId] === 'number') {
      el.textContent = String(scores[entrantId]);
    }
  }
}

/**
 * Page-tier live scoreboard subscriber.
 *
 * Connects to the tournament's public SSE stream and routes `match.clock-changed`,
 * `match.event-recorded`, `match.started`, and `match.finalized` into the shared
 * scoreboard store so hydrated `LiveMatchScoreboard` / `MatchCard` islands stay
 * synchronized without placing `RealtimeClient` below the page tier.
 */
export function mountPublicLiveScoreboards(root: ParentNode = document): () => void {
  const streamEl = root.querySelector<HTMLElement>('[data-live-stream]');
  const streamPath = streamEl?.dataset.liveStream;
  if (!streamPath) return () => undefined;

  let lastUpdatedAt = seedMatchesFromRoot(root) ?? new Date().toISOString();
  const client = new RealtimeClient({ url: streamPath });
  void client.connect({
    onOpen: () => {
      setLiveStreamStatus({ usingLastKnown: false, lastUpdatedAt });
    },
    onFailure: () => {
      setLiveStreamStatus({ usingLastKnown: true, lastUpdatedAt });
    },
    onEvent: (event) => {
      const timestamp =
        typeof event.payload.changedAt === 'string' ? event.payload.changedAt : event.createdAt;
      if (timestamp) lastUpdatedAt = timestamp;
      publishLiveScoreboardEvent(event);
      patchDomMatchScores(root, event);
    },
    onProjectionRequired: () => globalThis.location?.reload(),
  });

  const close = (): void => client.close();
  window.addEventListener('pagehide', close, { once: true });
  return close;
}
