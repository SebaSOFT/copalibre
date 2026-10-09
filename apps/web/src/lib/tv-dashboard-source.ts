import type { LiveDashboard, LiveMatch } from './live-state.js';
import type { OverviewMatch } from './overview.js';
import type { ResultState } from './result-state.js';

/**
 * The kiosk's dashboard when the live projection has nothing to say (a tournament with no match in
 * progress, a finished one): every match of the overview, in the shape the live reducer works on.
 * A match keeps its real id when it has one, so a live event that arrives later still finds it.
 */
export function dashboardFromOverview(matches: readonly OverviewMatch[]): LiveDashboard {
  return {
    standingsVersion: 0,
    usingLastKnown: true,
    matches: matches.map((m, idx) => ({
      matchId:
        m.matchId ?? `overview-${m.stageNumber}-${m.stageOrdinal ?? m.matchNumber ?? idx + 1}`,
      stageNumber: m.stageNumber,
      matchNumber: m.matchNumber ?? idx + 1,
      ...(m.stageOrdinal === undefined ? {} : { stageOrdinal: m.stageOrdinal }),
      state: m.state as ResultState,
      projectionVersion: 0,
      sides: [
        {
          entrantId: `home-${idx}`,
          name: m.home.name,
          abbreviation: m.home.abbreviation,
          score: m.home.score ?? 0,
          state: m.state as ResultState,
        },
        {
          entrantId: `away-${idx}`,
          name: m.away.name,
          abbreviation: m.away.abbreviation,
          score: m.away.score ?? 0,
          state: m.state as ResultState,
        },
      ],
    })),
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
      ...base.matches.map((match) => liveById.get(match.matchId) ?? match),
      ...live.matches.filter((match) => !known.has(match.matchId)),
    ],
  };
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
