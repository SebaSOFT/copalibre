import { useMemo, type RefObject } from 'react';
import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { SupportedLanguage } from '@copalibre/domain';
import type { LiveMatch } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import { groupStandingsByZone } from '../../lib/overview.js';
import { findPinnedMatch, type PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import {
  chunkTvRows,
  orderTvMatches,
  overlayTvEntries,
  pageTvMatches,
  TV_MATCHES_PER_ROW,
  TV_MATCH_ROWS_PER_PAGE,
  type TvMatchEntry,
} from '../../lib/tv-match-list.js';
import { useFrameWidth } from './use-tv-frame-width.js';
import { useTablePaging } from './ui/use-table-paging.js';
import type { StandingsColumn } from './ui/organisms/TvStandingsTable.js';
import {
  pinnedStandingsOf,
  standingsColumnsFitting,
  standingsColumnsOf,
  viewportVmin,
  type RailTab,
} from './tv-dashboard-model.js';
import type { TvDashboardLabels } from './tv-types.js';
import type { TvMatchList as TvMatchListHolder } from './ui/organisms/TvMatchList.js';
import type { TvLayoutVariant } from './tv-dashboard-types.js';

/**
 * The paging of every list the dashboard shows: the fixtures (by line), the dashboard's standings panel,
 * the rail's standings tab and the fixtures tab. The hooks run in the order the component always ran
 * them: the fixtures, the frame width, the dashboard's standings, then the rail.
 */
export function useTvPaging({
  matches,
  scheduledMatches,
  resultState,
  layoutVariant,
  activeTab,
  railPage,
  standings,
  standingsProjection,
  standingsStageNumber,
  language,
  initialView,
  pinnedRef,
  standingsPanelRef,
  railStandingsRef,
}: {
  readonly matches: readonly LiveMatch[];
  readonly scheduledMatches: readonly TvMatchEntry[];
  readonly resultState: TvDashboardLabels['resultState'];
  readonly layoutVariant: TvLayoutVariant;
  readonly activeTab: RailTab;
  readonly railPage: number;
  readonly standings: readonly StandingsRowView[] | undefined;
  readonly standingsProjection: TableProjectionResponse | undefined;
  readonly standingsStageNumber: number | undefined;
  readonly language: SupportedLanguage;
  readonly initialView: 'standings' | 'matches' | undefined;
  readonly pinnedRef: PinnedMatchRef | undefined;
  readonly standingsPanelRef: RefObject<HTMLElement | null>;
  readonly railStandingsRef: RefObject<HTMLDivElement | null>;
}): {
  readonly matchPages: React.ComponentProps<typeof TvMatchListHolder>['pages'];
  readonly standingsPageCount: number;
  readonly activeStandingsPage: number;
  readonly dashboardStandings: readonly StandingsRowView[];
  readonly railPaging: {
    readonly pageRows: readonly StandingsRowView[];
    readonly pageCount: number;
    readonly pageIndex: number;
  };
  readonly fullFrameColumns: readonly StandingsColumn[] | undefined;
} {
  const listEntries = useMemo(
    () => overlayTvEntries(scheduledMatches, matches, resultState),
    [scheduledMatches, matches, resultState],
  );
  const listRows = useMemo(
    () =>
      pageTvMatches(
        orderTvMatches(listEntries, resultState),
        Number.MAX_SAFE_INTEGER,
        TV_MATCHES_PER_ROW,
      )[0] ?? [],
    [listEntries, resultState],
  );
  // The fixtures page as many whole rows as the rail holds; before its first measurement it holds a
  // page of the usual size.
  const fixturesPaging = useTablePaging(listRows, {
    panelRef: railStandingsRef,
    enabled: activeTab === 'fixtures' && layoutVariant !== 'dashboard',
    rotate: false,
    page: activeTab === 'fixtures' ? railPage : 0,
    rowSelector: '.tv-match-list__entry, .tv-match-list__heading',
    pagerSelector: '.tv-match-list__pager',
    // The fixtures page by lines: two entries side by side are one row of the list.
    countBy: 'line',
    initialSize: TV_MATCH_ROWS_PER_PAGE,
  });
  const matchPages = useMemo(
    () => chunkTvRows(listRows, fixturesPaging.pageSize),
    [listRows, fixturesPaging.pageSize],
  );

  const declaredStandingsColumns = standingsColumnsOf(standingsProjection, language);
  const frameWidth = useFrameWidth(railStandingsRef, initialView === 'standings');
  // The frame's width is only known once the page has mounted in the browser; until then every declared
  // column is drawn, the same on the server and in the first client render.
  const fullFrameColumns =
    initialView === 'standings' && declaredStandingsColumns.length > 0
      ? frameWidth === undefined
        ? declaredStandingsColumns
        : standingsColumnsFitting(declaredStandingsColumns, frameWidth, viewportVmin())
      : undefined;
  // Standings pages break at group boundaries: a group that fits a page is never split.
  const standingBlocks = useMemo(() => groupStandingsByZone(standings ?? []), [standings]);
  const orderedStandings = useMemo(
    () => standingBlocks.flatMap((block) => block.rows),
    [standingBlocks],
  );
  const standingSegments = useMemo(
    () => standingBlocks.map((block) => block.rows.length),
    [standingBlocks],
  );
  // The dashboard's standings panel pages to the rows its frame holds and rotates between pages.
  const dashboardPaging = useTablePaging(orderedStandings, {
    panelRef: standingsPanelRef,
    enabled: layoutVariant === 'dashboard',
    segments: standingSegments,
  });
  const standingsPageCount = dashboardPaging.pageCount;
  const activeStandingsPage = dashboardPaging.pageIndex;
  const dashboardStandings = dashboardPaging.pageRows;
  // The rail's standings tab pages the same way on a full frame, with its own panel.
  const railStandingRows = useMemo(
    () =>
      pinnedRef === undefined
        ? (standings ?? [])
        : pinnedStandingsOf(standings, findPinnedMatch(matches, pinnedRef), standingsStageNumber),
    [pinnedRef, standings, matches, standingsStageNumber],
  );
  const railBlocks = useMemo(() => groupStandingsByZone(railStandingRows), [railStandingRows]);
  const railOrdered = useMemo(() => railBlocks.flatMap((block) => block.rows), [railBlocks]);
  const railSegments = useMemo(() => railBlocks.map((block) => block.rows.length), [railBlocks]);
  const railPaging = useTablePaging(railOrdered, {
    panelRef: railStandingsRef,
    enabled: layoutVariant !== 'dashboard' && activeTab === 'standings',
    rotate: false,
    segments: railSegments,
    // The rail turns its standings pages itself, in step with its tabs.
    page: activeTab === 'standings' ? railPage : 0,
  });

  return {
    matchPages,
    standingsPageCount,
    activeStandingsPage,
    dashboardStandings,
    railPaging,
    fullFrameColumns,
  };
}
