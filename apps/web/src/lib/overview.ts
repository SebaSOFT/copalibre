import type { PreviousPlacement } from './reschedule.js';
import { publicPath, publicStreamPath, type RouteInput } from '@copalibre/routing';
import { IMPLICIT_SEASON_NAME } from '@copalibre/domain';

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
  readonly emblemObjectId?: string;
  readonly played: number;
  readonly points: number;
  /** The zone this row is ranked in; set only when the stage mixes formats and ranks each zone on its own. */
  readonly zoneName?: string;
}

/**
 * Splits standings rows into one block per zone, in the order the zones first appear, so rows of
 * different zones are never read as one ranking. Rows that name no zone — a stage with a single
 * table — stay together as one block without a name.
 */
export function groupStandingsByZone(
  rows: readonly StandingsRowView[],
): readonly { readonly zoneName?: string; readonly rows: readonly StandingsRowView[] }[] {
  const blocks: { zoneName?: string; rows: StandingsRowView[] }[] = [];
  for (const row of rows) {
    const block = blocks.find((candidate) => candidate.zoneName === row.zoneName);
    if (block) block.rows.push(row);
    else
      blocks.push({
        ...(row.zoneName === undefined ? {} : { zoneName: row.zoneName }),
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

import type { PublicTournamentWinnerZoneResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

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
  readonly standings: readonly StandingsRowView[];
  /** Absent when the previewed stage declares no series at all. */
  readonly standingsGrain?: 'series' | 'match';
  readonly clubs?: readonly ClubView[];
  readonly ruleset: readonly RulesetFieldView[];
  readonly canonicalPath: string;
  readonly streamPath: string;
  readonly liveCount: number;
  readonly emblemObjectId?: string;
}

export interface OverviewInput extends RouteInput {
  readonly organizationName: string;
  readonly organizationTimeZone?: string;
  readonly tournamentName: string;
  readonly seasonName?: string;
  readonly status?: 'upcoming' | 'live' | 'finished';
  readonly winners?: readonly PublicTournamentWinnerZoneResponse[];
  readonly matches: readonly OverviewMatch[];
  readonly standings: readonly StandingsRowView[];
  readonly standingsGrain?: 'series' | 'match';
  readonly clubs?: readonly ClubView[];
  readonly ruleset: readonly RulesetFieldView[];
  readonly emblemObjectId?: string;
}

export interface OverviewMatchSummary {
  readonly live: readonly OverviewMatch[];
  readonly upcoming: readonly OverviewMatch[];
  readonly latestResults: readonly OverviewMatch[];
}

/** Keeps the landing page's fixture summary bounded and ordered by kickoff, not fixture number. */
export function summarizeOverviewMatches(
  matches: readonly OverviewMatch[],
  limit = 4,
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
    upcoming: matches
      .filter((match) => match.state === 'upcoming')
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
    matches: input.matches,
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

/** Only promote a venue to a tournament fact when every match names that same venue. */
export function sharedOverviewVenue(matches: readonly OverviewMatch[]): string | undefined {
  if (matches.length === 0) return undefined;

  const venues = matches.map((match) => match.venueName?.trim());
  const firstVenue = venues[0];
  if (!firstVenue || venues.some((venue) => venue !== firstVenue)) return undefined;
  return firstVenue;
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
