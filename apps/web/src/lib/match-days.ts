import type { MatchCardData } from './matches-view.js';

/** One calendar day of a schedule in the organization's time zone; `key` is absent for undated matches. */
export interface MatchDay {
  /** `yyyy-mm-dd` in the organization's time zone. */
  readonly key?: string;
  /** Any kickoff on the day, for formatting its label. */
  readonly instant?: string;
  readonly matches: readonly MatchCardData[];
  readonly hasLive: boolean;
}

function kickoffOf(match: MatchCardData): number | undefined {
  if (match.scheduledAt === undefined) return undefined;
  const time = Date.parse(match.scheduledAt);
  return Number.isNaN(time) ? undefined : time;
}

/** The `yyyy-mm-dd` calendar day an instant falls on in `timeZone`. */
export function calendarDayKey(instant: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(instant));
}

const byKickoff = (left: MatchCardData, right: MatchCardData): number =>
  (kickoffOf(left) ?? 0) - (kickoffOf(right) ?? 0) ||
  left.stageNumber - right.stageNumber ||
  left.matchNumber - right.matchNumber;

/**
 * A schedule's matches by calendar day in the organization's time zone, days in date order and each
 * day's matches in kickoff order. Matches with no kickoff form one last, undated day.
 */
export function matchDays(
  matches: readonly MatchCardData[],
  timeZone: string | undefined,
): readonly MatchDay[] {
  const dated = new Map<string, MatchCardData[]>();
  const undated: MatchCardData[] = [];
  for (const match of matches) {
    const kickoff = kickoffOf(match);
    if (kickoff === undefined) {
      undated.push(match);
      continue;
    }
    const key = calendarDayKey(kickoff, timeZone);
    const day = dated.get(key);
    if (day) day.push(match);
    else dated.set(key, [match]);
  }
  const days: MatchDay[] = [...dated.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, dayMatches]) => {
      const sorted = [...dayMatches].sort(byKickoff);
      return {
        key,
        instant: sorted[0]?.scheduledAt,
        matches: sorted,
        hasLive: sorted.some((match) => match.state === 'live'),
      };
    });
  if (undated.length > 0) {
    days.push({
      matches: [...undated].sort(byKickoff),
      hasLive: undated.some((match) => match.state === 'live'),
    });
  }
  return days;
}

/**
 * The day a phone opens: the earliest live match's, else the earliest upcoming match's, else the last
 * dated day (the tournament is over or nothing is scheduled ahead).
 */
export function openMatchDay(days: readonly MatchDay[]): MatchDay | undefined {
  const earliest = (state: MatchCardData['state']): MatchDay | undefined => {
    let best: { day: MatchDay; kickoff: number } | undefined;
    for (const day of days) {
      for (const match of day.matches) {
        if (match.state !== state) continue;
        const kickoff = kickoffOf(match) ?? Number.POSITIVE_INFINITY;
        if (best === undefined || kickoff < best.kickoff) best = { day, kickoff };
      }
    }
    return best?.day;
  };
  return (
    earliest('live') ??
    earliest('upcoming') ??
    [...days].reverse().find((day) => day.key !== undefined) ??
    days[0]
  );
}
