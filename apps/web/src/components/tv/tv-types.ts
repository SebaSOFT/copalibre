import type { ResultStateLabels } from '../../lib/result-state.js';

/**
 * Shared types for the TV/broadcast surface's split-out sub-components —
 * kept separate from `TvDashboard.tsx` so a
 * sub-component doesn't import back into the file that composes it.
 */
export interface TvClubItem {
  readonly name: string;
  /** Same-origin URL of the club's emblem route; absent when the club has none. */
  readonly emblemUrl?: string;
}

export interface TvDashboardLabels {
  readonly resultState: ResultStateLabels;
  readonly noMatchesScheduled: string;
  readonly standingsUnavailable: string;
  readonly clubColumn: string;
  readonly playedColumn: string;
  readonly noTopPerformers: string;
  readonly focalPanelLabel: string;
  readonly matchEventsLabel: string;
  readonly statsAndTablesLabel: string;
  readonly sidebarSectionsLabel: string;
  readonly standingsTab: string;
  readonly performersTab: string;
  readonly statisticsTab: string;
  readonly bracketTab: string;
  readonly fixturesTab: string;
  readonly bracketRound: string;
  readonly bracketMatch: string;
  readonly possession: string;
  readonly penalty: string;
  /** Names the wall clock the header shows for a tournament still being played. */
  readonly clockLabel: string;
  /** Raw `{date}` template: the header of a finished tournament, naming the day it ended. */
  readonly finishedOn: string;
  /** Said by a pinned route whose match does not exist. */
  readonly matchNotFound: string;
  /** Raw `{page}`/`{total}` template for the match list's pager. */
  readonly pageOf: string;
  /** Raw `{home}`/`{away}`/`{game}`/`{span}` template naming where a series stands. */
  readonly seriesState: string;
  /** Names the strip of sets already played and the one being played. */
  readonly setsLabel: string;
  /** What an overlay says when it was given no match. */
  readonly overlayNoMatch: string;
  /** What an overlay following a court says when that court has no live match. */
  readonly overlayNoCourtMatch: string;
}

/** One zone of the last stage and the club or clubs that won it (several when the title is shared). */
export interface TvWinnerZone {
  readonly zoneName?: string;
  readonly champions: readonly {
    readonly name: string;
    readonly abbreviation?: string;
    readonly emblemUrl?: string;
  }[];
}
