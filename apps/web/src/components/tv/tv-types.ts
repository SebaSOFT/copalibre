/**
 * Shared types for the TV/broadcast surface's split-out sub-components
 * (openspec 0225 task 7.1) — kept separate from `TvDashboard.tsx` so a
 * sub-component doesn't import back into the file that composes it.
 */
export interface TvClubItem {
  readonly name: string;
  readonly emblemObjectId?: string;
}

export interface TvDashboardLabels {
  readonly noMatchesScheduled: string;
  readonly standingsUnavailable: string;
  readonly clubColumn: string;
  readonly playedColumn: string;
  readonly noTopPerformers: string;
  readonly focalPanelLabel: string;
  readonly statsAndTablesLabel: string;
  readonly sidebarSectionsLabel: string;
  readonly standingsTab: string;
  readonly performersTab: string;
  readonly statisticsTab: string;
}
