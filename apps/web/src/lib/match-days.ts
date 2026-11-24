import { calendarDayKey, relativeDayWord, toDate } from './format-timestamp.js';
import type { MatchCardData } from './matches-view.js';

export { calendarDayKey };

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

/** Distinct dated match days in ascending chronological order, for filter pills. */
export function availableMatchDays(
  matches: readonly MatchCardData[],
  timeZone: string | undefined,
): readonly { readonly key: string; readonly instant: string }[] {
  return matchDays(matches, timeZone).flatMap((day) =>
    day.key !== undefined && day.instant !== undefined
      ? [{ key: day.key, instant: day.instant }]
      : [],
  );
}

/**
 * Formats a day heading such as `"Mañana · mar 24 nov"` within ±1 calendar day of `referenceDate`
 * or `"mar 24 nov"` otherwise.
 */
export function formatDayHeading(input: {
  readonly instant: string | number | Date;
  readonly locale: string;
  readonly timeZone?: string;
  readonly referenceDate?: Date | number;
  readonly template?: string;
}): string {
  const date = toDate(input.instant);
  if (Number.isNaN(date.getTime())) return String(input.instant);
  const formattedDate = new Intl.DateTimeFormat(input.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
  }).format(date);
  const reference = input.referenceDate ?? Date.now();
  const relative = relativeDayWord(date, reference, input.locale, input.timeZone);
  if (relative === undefined) return formattedDate;
  const template = input.template ?? '{relative} · {date}';
  return template.replace('{relative}', relative).replace('{date}', formattedDate);
}
