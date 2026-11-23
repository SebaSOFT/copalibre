import type { LiveDashboard, LiveMatch } from './live-state.js';
import type { OverviewMatch } from './overview.js';
import type { ResultState } from './result-state.js';

const CONTEXT_KEYS = [
  'stageName',
  'zoneName',
  'groupName',
  'round',
  'nodeKey',
  'sourceFinalRound',
  'zoneNodeKeys',
] as const;

function overviewSide(
  side: OverviewMatch['home'],
  entrantId: string,
  state: ResultState,
): LiveMatch['sides'][number] {
  return {
    entrantId,
    name: side.name,
    abbreviation: side.abbreviation,
    clubId: side.clubId,
    emblemObjectId: side.emblemObjectId,
    score: side.score ?? 0,
    state,
  };
}

function toOverviewLiveMatch(
  m: OverviewMatch,
  idx: number,
  scope: string,
  depths: ReadonlyMap<string, number>,
  keysByScope: ReadonlyMap<string, readonly (string | undefined)[]>,
): LiveMatch {
  const sourceFinalRound = depths.get(scope);
  const zoneKeys = keysByScope.get(scope);
  const hasPlacementKeys = zoneKeys?.some((k) => /^PL\d+-/.test(k ?? '')) === true;
  const state = m.state as ResultState;
  const base: Record<string, unknown> = {
    matchId: m.matchId ?? `overview-${m.stageNumber}-${m.stageOrdinal ?? m.matchNumber ?? idx + 1}`,
    scheduleVersion: m.scheduleVersion,
    scheduledAt: m.startsAt || undefined,
    venueName: m.venueName,
    rescheduledFrom: m.rescheduledFrom,
    stageNumber: m.stageNumber,
    matchNumber: m.matchNumber ?? idx + 1,
    state,
    projectionVersion: 0,
    sides: [overviewSide(m.home, `home-${idx}`, state), overviewSide(m.away, `away-${idx}`, state)],
  };
  for (const key of [
    'stageName',
    'zoneName',
    'groupName',
    'round',
    'nodeKey',
    'stageOrdinal',
  ] as const) {
    if (m[key] !== undefined) base[key] = m[key];
  }
  if (sourceFinalRound !== undefined) base.sourceFinalRound = sourceFinalRound;
  if (hasPlacementKeys && zoneKeys !== undefined) base.zoneNodeKeys = zoneKeys;
  return base as unknown as LiveMatch;
}

function mergeMatchContext(base: LiveMatch, live: LiveMatch): LiveMatch {
  const merged: Record<string, unknown> = { ...live };
  for (const key of CONTEXT_KEYS) {
    const value = live[key] ?? base[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged as unknown as LiveMatch;
}

/**
 * The kiosk's dashboard when the live projection has nothing to say (a tournament with no match in
 * progress, a finished one): every match of the overview, in the shape the live reducer works on.
 * A match keeps its real id when it has one, so a live event that arrives later still finds it.
 */
export function dashboardFromOverview(matches: readonly OverviewMatch[]): LiveDashboard {
  const depths = new Map<string, number>();
  const keysByScope = new Map<string, (string | undefined)[]>();
  const scopeOf = (m: OverviewMatch): string => JSON.stringify([m.stageNumber, m.zoneName]);
  for (const m of matches) {
    const scope = scopeOf(m);
    const list = keysByScope.get(scope);
    if (list) list.push(m.nodeKey);
    else keysByScope.set(scope, [m.nodeKey]);
    if (m.nodeKey?.startsWith('SE-') && m.round !== undefined) {
      depths.set(scope, Math.max(depths.get(scope) ?? 0, m.round));
    }
  }
  return {
    standingsVersion: 0,
    usingLastKnown: true,
    matches: matches.map((m, idx) => toOverviewLiveMatch(m, idx, scopeOf(m), depths, keysByScope)),
  };
}

/**
 * The live projection laid over the overview's matches: a pinned match that is not in progress is
 * still a match of the tournament, and the live projection alone only lists those that are.
 */
export function overlayLive(base: LiveDashboard, live: LiveDashboard): LiveDashboard {
  const liveById = new Map(live.matches.map((match) => [match.matchId, match]));
  const known = new Set(base.matches.map((match) => match.matchId));
  return {
    ...live,
    matches: [
      ...base.matches.map((match) => {
        const liveMatch = liveById.get(match.matchId);
        return liveMatch ? mergeMatchContext(match, liveMatch) : match;
      }),
      ...live.matches.filter((match) => !known.has(match.matchId)),
    ],
  };
}

/** The state and score a matches-view snapshot reports for one match. */
export interface SnapshotScore {
  readonly state: ResultState;
  readonly homeScore?: number;
  readonly awayScore?: number;
}

/**
 * A match that was live and is no longer in the live projection (it finished, or the projection
 * dropped it) takes its state and score from the matches view. A match the live projection still
 * lists, or one with no snapshot entry, is returned as it is.
 */
export function settleLeftLive(
  matches: readonly LiveMatch[],
  liveIds: ReadonlySet<string>,
  snapshot: ReadonlyMap<string, SnapshotScore>,
): readonly LiveMatch[] {
  return matches.map((match) => {
    if (match.state !== 'live' || liveIds.has(match.matchId)) return match;
    const settled = snapshot.get(match.matchId);
    if (settled === undefined) return match;
    const updated: { -readonly [K in keyof LiveMatch]: LiveMatch[K] } = {
      ...match,
      state: settled.state,
      sides: match.sides.map((side, index) => ({
        ...side,
        state: settled.state,
        score: (index === 0 ? settled.homeScore : settled.awayScore) ?? side.score,
      })),
    };
    if (settled.state !== 'live') {
      delete updated.clock;
      delete updated.clockReceivedAt;
      delete updated.clockSeconds;
      delete updated.possessionEntrantId;
      delete updated.activePenalties;
    }
    return updated;
  });
}

/** A match addressed the way the public match route addresses it: by stage and ordinal within it. */
export interface PinnedMatchRef {
  readonly stageNumber: number;
  readonly ordinal: number;
}

export function findPinnedMatch(
  matches: readonly LiveMatch[],
  pinned: PinnedMatchRef,
): LiveMatch | undefined {
  return matches.find(
    (match) => match.stageNumber === pinned.stageNumber && match.stageOrdinal === pinned.ordinal,
  );
}

/**
 * The date of the last match of the tournament: what a finished tournament's header shows as the
 * day it ended, the finish time itself not being recorded. Absent when no match has a date.
 */
export function lastMatchAt(
  matches: readonly Pick<OverviewMatch, 'startsAt'>[],
): string | undefined {
  let latest: { readonly at: string; readonly time: number } | undefined;
  for (const match of matches) {
    const time = Date.parse(match.startsAt);
    if (!Number.isNaN(time) && (latest === undefined || time > latest.time)) {
      latest = { at: match.startsAt, time };
    }
  }
  return latest?.at;
}
