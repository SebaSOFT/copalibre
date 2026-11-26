import type { EventEnvelope } from '@copalibre/realtime';
import { readScores, type LiveMatchClock, type LiveSegment } from './live-state.js';
import type { ResultState } from './result-state.js';

/**
 * Client-side in-memory store bridging page-tier SSE subscriptions to hydrated
 * scoreboard islands (`LiveMatchScoreboard`, `MatchCard`). Keeps `RealtimeClient`
 * strictly at the page tier while allowing live clocks and scores to react to
 * `match.clock-changed`, `match.event-recorded`, and `match.finalized`.
 */

export interface LiveScoreboardMatchPatch {
  readonly matchId: string;
  readonly projectionVersion: number;
  readonly state?: ResultState;
  readonly clock?: LiveMatchClock;
  readonly clockReceivedAt?: number;
  readonly segments?: readonly LiveSegment[];
  readonly homeScore?: number;
  readonly awayScore?: number;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  /** The definition code and projection version of the latest recorded event, so a listener can tell a new one. */
  readonly recordedEventCode?: string;
  readonly recordedEventVersion?: number;
}

export interface LiveStreamStatus {
  readonly usingLastKnown: boolean;
  readonly lastUpdatedAt?: string;
}

const matchPatches = new Map<string, LiveScoreboardMatchPatch>();
const matchListeners = new Map<string, Set<() => void>>();
const statusListeners = new Set<() => void>();
let streamStatus: LiveStreamStatus = { usingLastKnown: false };

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function notifyMatch(matchId: string): void {
  const listeners = matchListeners.get(matchId);
  if (!listeners) return;
  for (const fn of listeners) fn();
}

function notifyStatus(): void {
  for (const fn of statusListeners) fn();
}

export function setLiveStreamStatus(next: LiveStreamStatus): void {
  if (
    streamStatus.usingLastKnown === next.usingLastKnown &&
    streamStatus.lastUpdatedAt === next.lastUpdatedAt
  ) {
    return;
  }
  streamStatus = next;
  notifyStatus();
}

export function seedLiveScoreboardMatch(patch: LiveScoreboardMatchPatch): void {
  const existing = matchPatches.get(patch.matchId);
  if (existing && existing.projectionVersion >= patch.projectionVersion) return;
  matchPatches.set(patch.matchId, patch);
  notifyMatch(patch.matchId);
}

function applyClockChangedPatch(
  matchId: string,
  current: LiveScoreboardMatchPatch | undefined,
  event: EventEnvelope,
): void {
  const { segmentNumber, elapsedSeconds, running, changedAt } = event.payload;
  if (
    typeof segmentNumber !== 'number' ||
    typeof elapsedSeconds !== 'number' ||
    typeof running !== 'boolean'
  ) {
    return;
  }
  const asOf = typeof changedAt === 'string' ? changedAt : event.createdAt;
  matchPatches.set(matchId, {
    ...current,
    matchId,
    projectionVersion: event.projectionVersion,
    clock: { segmentNumber, elapsedSeconds, running, asOf },
    clockReceivedAt: nowMs(),
  });
  streamStatus = { ...streamStatus, lastUpdatedAt: asOf };
  notifyMatch(matchId);
  notifyStatus();
}

function nextMatchState(
  current: ResultState | undefined,
  eventType: string,
): ResultState | undefined {
  if (eventType === 'match.started') return 'live';
  if (eventType === 'match.finalized') return 'final';
  if (eventType === 'result.superseded') return 'disputed';
  return current;
}

function applyMatchUpdatePatch(
  matchId: string,
  current: LiveScoreboardMatchPatch | undefined,
  event: EventEnvelope,
): void {
  const scores = readScores(event.payload);
  const nextState = nextMatchState(current?.state, event.eventType);
  const homeScore =
    scores && current?.homeEntrantId
      ? (scores[current.homeEntrantId] ?? current.homeScore)
      : current?.homeScore;
  const awayScore =
    scores && current?.awayEntrantId
      ? (scores[current.awayEntrantId] ?? current.awayScore)
      : current?.awayScore;
  const clearedClock = nextState !== undefined && nextState !== 'live';
  matchPatches.set(matchId, {
    ...current,
    matchId,
    projectionVersion: event.projectionVersion,
    ...(nextState === undefined ? {} : { state: nextState }),
    ...(homeScore === undefined ? {} : { homeScore }),
    ...(awayScore === undefined ? {} : { awayScore }),
    ...(clearedClock ? { clock: undefined, clockReceivedAt: undefined } : {}),
    ...(event.eventType === 'match.event-recorded' &&
    typeof event.payload.definitionCode === 'string'
      ? {
          recordedEventCode: event.payload.definitionCode,
          recordedEventVersion: event.projectionVersion,
        }
      : {}),
  });
  streamStatus = { ...streamStatus, lastUpdatedAt: event.createdAt };
  notifyMatch(matchId);
  notifyStatus();
}

const MATCH_UPDATE_EVENTS = new Set([
  'match.event-recorded',
  'match.started',
  'match.finalized',
  'result.superseded',
]);

export function publishLiveScoreboardEvent(event: EventEnvelope): void {
  const matchId = typeof event.payload.matchId === 'string' ? event.payload.matchId : undefined;
  if (!matchId) return;
  const current = matchPatches.get(matchId);
  if (event.projectionVersion <= (current?.projectionVersion ?? 0)) return;

  if (event.eventType === 'match.clock-changed') {
    applyClockChangedPatch(matchId, current, event);
    return;
  }
  if (MATCH_UPDATE_EVENTS.has(event.eventType)) {
    applyMatchUpdatePatch(matchId, current, event);
  }
}

export function resetLiveScoreboardStore(): void {
  matchPatches.clear();
  streamStatus = { usingLastKnown: false };
  for (const matchId of matchListeners.keys()) notifyMatch(matchId);
  notifyStatus();
}

export function getLiveScoreboardPatch(
  matchId: string | undefined,
): LiveScoreboardMatchPatch | undefined {
  return matchId ? matchPatches.get(matchId) : undefined;
}

export function getLiveStreamStatus(): LiveStreamStatus {
  return streamStatus;
}

export function subscribeLiveScoreboardMatch(
  matchId: string | undefined,
  onStoreChange: () => void,
): () => void {
  if (!matchId) return () => undefined;
  let set = matchListeners.get(matchId);
  if (!set) {
    set = new Set();
    matchListeners.set(matchId, set);
  }
  const listeners = set;
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) matchListeners.delete(matchId);
  };
}

export function subscribeLiveStreamStatus(onStoreChange: () => void): () => void {
  statusListeners.add(onStoreChange);
  return () => statusListeners.delete(onStoreChange);
}
