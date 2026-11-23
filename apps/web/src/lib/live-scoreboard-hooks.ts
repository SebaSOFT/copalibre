import { useSyncExternalStore } from 'react';
import {
  getLiveScoreboardPatch,
  getLiveStreamStatus,
  subscribeLiveScoreboardMatch,
  subscribeLiveStreamStatus,
  type LiveScoreboardMatchPatch,
  type LiveStreamStatus,
} from './live-scoreboard-store.js';

const serverPatch = (): undefined => undefined;
const SERVER_STATUS: LiveStreamStatus = { usingLastKnown: false };
const serverStatus = (): LiveStreamStatus => SERVER_STATUS;

/**
 * React hook subscribing to live scoreboard patches for a single match.
 */
export function useLiveScoreboardPatch(
  matchId: string | undefined,
): LiveScoreboardMatchPatch | undefined {
  return useSyncExternalStore(
    (cb) => subscribeLiveScoreboardMatch(matchId, cb),
    () => getLiveScoreboardPatch(matchId),
    serverPatch,
  );
}

/**
 * React hook subscribing to the live public SSE stream connection status.
 */
export function useLiveStreamStatus(): LiveStreamStatus {
  return useSyncExternalStore(subscribeLiveStreamStatus, getLiveStreamStatus, serverStatus);
}
