import { publicPath, publicStreamPath, type RouteInput } from '@copalibre/routing';

/**
 * The public overview's view model (0020).
 *
 * Separated from the `.astro` file so what the page *says* is testable without
 * a browser or a build. The template stays a template.
 */

export type MatchState = 'live' | 'upcoming' | 'final' | 'disputed';

export interface OverviewMatch {
  readonly matchNumber: number;
  readonly stageNumber: number;
  readonly home: SideView;
  readonly away: SideView;
  readonly state: MatchState;
  readonly startsAt: string;
}

export interface SideView {
  readonly name: string;
  /** The short label from 0037; absent when nobody chose one. */
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

export interface OverviewModel {
  readonly organizationName: string;
  readonly tournamentName: string;
  readonly seasonName?: string;
  readonly matches: readonly OverviewMatch[];
  readonly standings: readonly StandingsRowView[];
  readonly ruleset: readonly { readonly label: string; readonly value: string }[];
  readonly canonicalPath: string;
  readonly streamPath: string;
  readonly liveCount: number;
}

export interface OverviewInput extends RouteInput {
  readonly organizationName: string;
  readonly tournamentName: string;
  readonly seasonName?: string;
  readonly matches: readonly OverviewMatch[];
  readonly standings: readonly StandingsRowView[];
  readonly ruleset: readonly { readonly label: string; readonly value: string }[];
}

export function buildOverview(input: OverviewInput): OverviewModel {
  return {
    organizationName: input.organizationName,
    tournamentName: input.tournamentName,
    ...(input.seasonName === undefined ? {} : { seasonName: input.seasonName }),
    matches: input.matches,
    standings: input.standings,
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
 * one, otherwise the name. Never a truncation invented here (0037).
 */
export function shortLabel(side: SideView | StandingsRowView): string {
  return side.abbreviation ?? side.name;
}

/** The competition's display name, composed rather than stored (0015). */
export function displayName(model: OverviewModel): string {
  return model.seasonName === undefined
    ? model.tournamentName
    : `${model.tournamentName} ${model.seasonName}`;
}
