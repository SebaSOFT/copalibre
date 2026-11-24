import type { PreviousPlacement } from './reschedule.js';
import { publicPath, publicStreamPath, type RouteInput } from '@copalibre/routing';
import { IMPLICIT_SEASON_NAME } from '@copalibre/domain';
import { isDelayed } from './match-state.js';
import { calendarDayKey } from './format-timestamp.js';
import { formatDayHeading } from './match-days.js';

/**
 * The public overview's view model.
 *
 * Separated from the `.astro` file so what the page *says* is testable without
 * a browser or a build. The template stays a template.
 */

export type MatchState = 'live' | 'upcoming' | 'final' | 'disputed';

export interface OverviewMatch {
  readonly scheduleVersion?: number;
  readonly venueName?: string;
  readonly rescheduledFrom?: PreviousPlacement | null;
  /** Absent in synthetic fixtures that have not yet been persisted as matches. */
  readonly matchId?: string;
  /** Absent while a generated fixture has not become a persisted match. */
  readonly matchNumber?: number;
  /** The match's 1-based position in its stage, which the public and TV match routes address it by. */
  readonly stageOrdinal?: number;
  readonly stageNumber: number;
  readonly stageName?: string;
  /** The fixture's structural key (`SE-R2-M1`, `placement-3`), which names knockout rounds. */
  readonly nodeKey?: string;
  readonly round?: number;
  /** The organizer's zone and group names; absent when implicit. */
  readonly zoneName?: string;
  readonly groupName?: string;
  readonly home: SideView;
  readonly away: SideView;
  readonly state: MatchState;
  readonly startsAt: string;
}

export interface SideView {
  readonly name: string;
  /** The short label; absent when nobody chose one. */
  readonly abbreviation?: string;
  readonly clubId?: string;
  readonly clubAlias?: string;
  readonly emblemObjectId?: string;
  readonly score?: number;
  /** Absent for a synthetic fixture with no persisted entrant yet; needed to correlate live events. */
  readonly entrantId?: string;
}

export interface StandingsRowView {
  readonly position: number;
  readonly entrantId?: string;
  readonly name: string;
  readonly hiddenAtRequest?: boolean;
  readonly publicProfileAvailable?: boolean;
  readonly abbreviation?: string;
  readonly clubId?: string;
  readonly clubAlias?: string;
  readonly emblemObjectId?: string;
  readonly played: number;
  readonly points: number;
  /** The zone this row is ranked in; set only when the stage mixes formats and ranks each zone on its own. */
  readonly zoneName?: string;
  /** The group this row is ranked in; present when the stage defines named groups. */
  readonly groupName?: string;
}

export interface StandingsBlockView {
  readonly zoneName?: string;
  readonly groupName?: string;
  readonly rows: readonly StandingsRowView[];
}

/**
 * Splits standings rows into one block per group within each zone, in segment order, so rows of
 * different groups or zones are never read as one ranking. Rows that name neither zone nor group
 * stay together as one block without a name.
 */
export function groupStandingsByZone(
  rows: readonly StandingsRowView[],
): readonly StandingsBlockView[] {
  const blocks: { zoneName?: string; groupName?: string; rows: StandingsRowView[] }[] = [];
  for (const row of rows) {
    const block = blocks.find(
      (candidate) => candidate.zoneName === row.zoneName && candidate.groupName === row.groupName,
    );
    if (block) block.rows.push(row);
    else
      blocks.push({
        ...(row.zoneName === undefined ? {} : { zoneName: row.zoneName }),
        ...(row.groupName === undefined ? {} : { groupName: row.groupName }),
        rows: [row],
      });
  }
  return blocks;
}

export interface ClubView {
  readonly clubId: string;
  readonly name: string;
  readonly abbreviation?: string;
  readonly alias?: string;
  readonly emblemObjectId?: string;
}

/** A ruleset field's effective value, its declared dot-path, and its resolved display label. */
export interface RulesetFieldView {
  readonly dotPath: string;
  readonly label: string;
  readonly value: string;
}

import type {
  PublicOverviewStageResponse,
  PublicTournamentWinnerZoneResponse,
} from '@copalibre/api/src/dto/public-tournament.dto.js';

/** A venue holding a published match: only its public fields. */
export interface OverviewVenue {
  readonly alias: string;
  readonly name: string;
  readonly address?: string;
  readonly courtCount: number;
}

export interface OverviewModel {
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly organizationName: string;
  /** The IANA zone the organization's schedule is read in. */
  readonly organizationTimeZone?: string;
  readonly tournamentName: string;
  readonly seasonName?: string;
  readonly status?: 'upcoming' | 'live' | 'finished';
  readonly winners?: readonly PublicTournamentWinnerZoneResponse[];
  readonly matches: readonly OverviewMatch[];
  readonly stages?: readonly PublicOverviewStageResponse[];
  readonly standingsStageNumber?: number;
  readonly standingsSource?: 'table-projection' | 'engine';
  readonly standings: readonly StandingsRowView[];
  /** Absent when the previewed stage declares no series at all. */
  readonly standingsGrain?: 'series' | 'match';
  readonly clubs?: readonly ClubView[];
  readonly ruleset: readonly RulesetFieldView[];
  readonly canonicalPath: string;
  readonly streamPath: string;
  readonly liveCount: number;
  readonly emblemObjectId?: string;
  /** The discipline's name in the page language. */
  readonly disciplineName?: string;
  readonly venues?: readonly OverviewVenue[];
}

export interface OverviewInput extends RouteInput {
  readonly organizationName: string;
  readonly organizationTimeZone?: string;
  readonly tournamentName: string;
  readonly seasonName?: string;
  readonly status?: 'upcoming' | 'live' | 'finished';
  readonly winners?: readonly PublicTournamentWinnerZoneResponse[];
  readonly matches: readonly OverviewMatch[];
  readonly stages?: readonly PublicOverviewStageResponse[];
  readonly standingsStageNumber?: number;
  readonly standingsSource?: 'table-projection' | 'engine';
  readonly standings: readonly StandingsRowView[];
  readonly standingsGrain?: 'series' | 'match';
  readonly clubs?: readonly ClubView[];
  readonly ruleset: readonly RulesetFieldView[];
  readonly emblemObjectId?: string;
  /** The discipline's name in the page language. */
  readonly disciplineName?: string;
  readonly venues?: readonly OverviewVenue[];
}

export interface OverviewMatchSummary {
  readonly live: readonly OverviewMatch[];
  readonly delayed: readonly OverviewMatch[];
  readonly upcoming: readonly OverviewMatch[];
  readonly latestResults: readonly OverviewMatch[];
}

/** Keeps the landing page's fixture summary bounded and ordered by kickoff, not fixture number. */
export function summarizeOverviewMatches(
  matches: readonly OverviewMatch[],
  limit = 4,
  now: Date | number = Date.now(),
): OverviewMatchSummary {
  const kickoffOf = (match: OverviewMatch): number => {
    const kickoff = Date.parse(match.startsAt);
    return Number.isFinite(kickoff) ? kickoff : Number.POSITIVE_INFINITY;
  };
  const compareKickoff = (left: OverviewMatch, right: OverviewMatch): number =>
    kickoffOf(left) - kickoffOf(right) ||
    left.stageNumber - right.stageNumber ||
    (left.matchNumber ?? left.stageOrdinal ?? 0) - (right.matchNumber ?? right.stageOrdinal ?? 0);
  const count = Math.max(0, Math.trunc(limit));

  return {
    live: matches
      .filter((match) => match.state === 'live')
      .sort(compareKickoff)
      .slice(0, count),
    delayed: matches
      .filter((match) => isDelayed(match, now))
      .sort(compareKickoff)
      .slice(0, count),
    upcoming: matches
      .filter((match) => match.state === 'upcoming' && !isDelayed(match, now))
      .sort(compareKickoff)
      .slice(0, count),
    latestResults: matches
      .filter(
        (match) =>
          match.state === 'final' &&
          match.home.score !== undefined &&
          match.away.score !== undefined,
      )
      .sort((left, right) => compareKickoff(right, left))
      .slice(0, count),
  };
}

/**
 * Selects up to `limit` matches for the overview's "Now" strip:
 * 1. live matches,
 * 2. delayed matches,
 * 3. the next upcoming match only when nothing is live.
 * Never includes finished matches.
 */
export function selectNowStripMatches(
  summary: OverviewMatchSummary,
  limit = 3,
): readonly OverviewMatch[] {
  const max = Math.max(0, Math.trunc(limit));
  if (max === 0) return [];
  const selected: OverviewMatch[] = [...summary.live.slice(0, max)];
  for (const match of summary.delayed) {
    if (selected.length >= max) break;
    selected.push(match);
  }
  if (summary.live.length === 0 && selected.length < max && summary.upcoming[0] !== undefined) {
    selected.push(summary.upcoming[0]);
  }
  return selected;
}

export interface OverviewMatchDayGroup<T extends OverviewMatch = OverviewMatch> {
  readonly key: string;
  readonly heading: string;
  readonly matches: readonly T[];
}

/**
 * Groups an already-ordered overview match list into calendar-day buckets in `timeZone`
 * while preserving the caller's day and match order.
 */
export function groupOverviewMatchesByDay<T extends OverviewMatch>(
  matches: readonly T[],
  options: {
    readonly locale: string;
    readonly timeZone?: string;
    readonly referenceDate?: Date | number;
    readonly dayHeadingTemplate?: string;
    readonly tbdLabel: string;
  },
): readonly OverviewMatchDayGroup<T>[] {
  const groups: { key: string; heading: string; matches: T[] }[] = [];
  const byKey = new Map<string, { key: string; heading: string; matches: T[] }>();
  for (const match of matches) {
    const kickoffMs = match.startsAt === '' ? Number.NaN : Date.parse(match.startsAt);
    const hasInstant = Number.isFinite(kickoffMs);
    const key = hasInstant ? calendarDayKey(kickoffMs, options.timeZone) : '__undated__';
    let group = byKey.get(key);
    if (!group) {
      const heading = hasInstant
        ? formatDayHeading({
            instant: match.startsAt,
            locale: options.locale,
            ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
            ...(options.referenceDate === undefined
              ? {}
              : { referenceDate: options.referenceDate }),
            ...(options.dayHeadingTemplate === undefined
              ? {}
              : { template: options.dayHeadingTemplate }),
          })
        : options.tbdLabel;
      group = { key, heading, matches: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.matches.push(match);
  }
  return groups;
}

export function buildOverview(input: OverviewInput): OverviewModel {
  return {
    organizationAlias: input.organizationAlias,
    tournamentAlias: input.tournamentAlias,
    organizationName: input.organizationName,
    ...(input.organizationTimeZone === undefined
      ? {}
      : { organizationTimeZone: input.organizationTimeZone }),
    tournamentName: input.tournamentName,
    ...(input.seasonName === undefined ? {} : { seasonName: input.seasonName }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.winners === undefined ? {} : { winners: input.winners }),
    ...(input.emblemObjectId === undefined ? {} : { emblemObjectId: input.emblemObjectId }),
    ...(input.disciplineName === undefined ? {} : { disciplineName: input.disciplineName }),
    ...(input.venues === undefined ? {} : { venues: input.venues }),
    matches: input.matches,
    ...(input.stages === undefined ? {} : { stages: input.stages }),
    ...(input.standingsStageNumber === undefined
      ? {}
      : { standingsStageNumber: input.standingsStageNumber }),
    ...(input.standingsSource === undefined ? {} : { standingsSource: input.standingsSource }),
    standings: input.standings,
    ...(input.standingsGrain === undefined ? {} : { standingsGrain: input.standingsGrain }),
    ...(input.clubs === undefined ? {} : { clubs: input.clubs }),
    ruleset: input.ruleset,
    canonicalPath: publicPath(input),
    // Derived from the same input as the page's own path, so a page cannot
    // subscribe to a stream for something else.
    streamPath: publicStreamPath(input),
    liveCount: input.matches.filter((match) => match.state === 'live').length,
  };
}

export type OverviewLead = 'honour-board' | 'now-strip' | 'schedule-preview';

export function overviewLeadFor(status: OverviewModel['status']): OverviewLead {
  if (status === 'finished') return 'honour-board';
  if (status === 'live') return 'now-strip';
  return 'schedule-preview';
}

/** A resolved multi-zone finish has enough independent outcomes to warrant a podium section. */
export function shouldShowChampionPodium(
  model: Pick<OverviewModel, 'status' | 'winners'>,
): boolean {
  return model.status === 'finished' && (model.winners?.length ?? 0) > 1;
}

/**
 * What a side is called when space is short: the abbreviation if somebody chose
 * one, otherwise the name. Never a truncation invented here.
 */
export function shortLabel(side: SideView | StandingsRowView): string {
  return side.abbreviation ?? side.name;
}

/** The competition's display name, composed rather than stored. */
export function displayName(model: OverviewModel): string {
  if (!model.seasonName || model.seasonName === IMPLICIT_SEASON_NAME) {
    return model.tournamentName;
  }
  if (model.tournamentName.endsWith(model.seasonName)) {
    return model.tournamentName;
  }
  return `${model.tournamentName} ${model.seasonName}`;
}
