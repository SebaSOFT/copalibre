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
  /** Absent while a generated fixture has not become a persisted match. */
  readonly matchNumber?: number;
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
  readonly score?: number;
}

export interface StandingsRowView {
  readonly position: number;
  readonly name: string;
  readonly abbreviation?: string;
  readonly played: number;
  readonly points: number;
}

export interface ClubView {
  readonly clubId: string;
  readonly name: string;
  readonly alias?: string;
  readonly emblemObjectId?: string;
}

import type { PublicTournamentWinnerZoneResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

export interface OverviewModel {
  readonly organizationName: string;
  readonly tournamentName: string;
  readonly seasonName?: string;
  readonly status?: 'upcoming' | 'live' | 'finished';
  readonly winners?: readonly PublicTournamentWinnerZoneResponse[];
  readonly matches: readonly OverviewMatch[];
  readonly standings: readonly StandingsRowView[];
  /** Absent when the previewed stage declares no series at all. */
  readonly standingsGrain?: 'series' | 'match';
  readonly clubs?: readonly ClubView[];
  readonly ruleset: readonly { readonly label: string; readonly value: string }[];
  readonly canonicalPath: string;
  readonly streamPath: string;
  readonly liveCount: number;
}

export interface OverviewInput extends RouteInput {
  readonly organizationName: string;
  readonly tournamentName: string;
  readonly seasonName?: string;
  readonly status?: 'upcoming' | 'live' | 'finished';
  readonly winners?: readonly PublicTournamentWinnerZoneResponse[];
  readonly matches: readonly OverviewMatch[];
  readonly standings: readonly StandingsRowView[];
  readonly standingsGrain?: 'series' | 'match';
  readonly clubs?: readonly ClubView[];
  readonly ruleset: readonly { readonly label: string; readonly value: string }[];
}

export function buildOverview(input: OverviewInput): OverviewModel {
  return {
    organizationName: input.organizationName,
    tournamentName: input.tournamentName,
    ...(input.seasonName === undefined ? {} : { seasonName: input.seasonName }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.winners === undefined ? {} : { winners: input.winners }),
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
