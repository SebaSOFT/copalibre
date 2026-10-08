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
}
