import type { RefObject } from 'react';
import type { SupportedLanguage } from '@copalibre/domain';
import type { TvStatisticsLabels, TopPerformer, TournamentFact } from '../../lib/tv-statistics.js';
import type { LiveMatch } from '../../lib/live-state.js';
import type { PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import type { StandingsRowView } from '../../lib/overview.js';
import { latestFinishedOf } from '../../lib/tv-match-list.js';
import { applyTemplate } from '../../lib/matches-view.js';
import type { BracketZone } from '../../lib/bracket-projection.js';
import type { RailTab } from './tv-dashboard-model.js';
import type { TvClubItem, TvDashboardLabels } from './tv-types.js';
import { TvPerformersView } from './TvPerformersView.js';
import { TvFactsView } from './TvFactsView.js';
import { TvRailTab } from './ui/atoms/TvRailTab.js';
import { TvStandingsTable, type StandingsColumn } from './ui/organisms/TvStandingsTable.js';
import { TvRecentResults } from './ui/organisms/TvRecentResults.js';
import { TvBracketView } from './ui/organisms/TvBracketView.js';
import { TvMatchList } from './ui/organisms/TvMatchList.js';

/** The kiosk's rail: the tab strip and the section the active tab shows, paged in step with the tabs. */
export interface TvRailPanelProps {
  readonly dashboardLabels: TvDashboardLabels;
  readonly labels: TvStatisticsLabels;
  readonly language: SupportedLanguage;
  readonly clubs: readonly TvClubItem[] | undefined;
  readonly timeZone: string | undefined;
  readonly effectiveNow: number;
  readonly fixedView: boolean;
  readonly railTabs: readonly RailTab[];
  readonly activeTab: RailTab;
  readonly setActiveTab: (tab: RailTab) => void;
  readonly performersTabLabel: string;
  readonly pinnedRef: PinnedMatchRef | undefined;
  readonly pinnedMatch: LiveMatch | undefined;
  readonly matches: readonly LiveMatch[];
  readonly railPaging: {
    readonly pageRows: readonly StandingsRowView[];
    readonly pageCount: number;
    readonly pageIndex: number;
  };
  readonly railPage: number;
  readonly railStandingsRef: RefObject<HTMLDivElement | null>;
  readonly fullFrameColumns: readonly StandingsColumn[] | undefined;
  readonly scopeStandingsHeadings: boolean;
  readonly standingsStageName: string | undefined;
  readonly performers: readonly TopPerformer[];
  readonly facts: readonly TournamentFact[];
  readonly visibleBracket:
    { readonly stageNumber: number; readonly zones: readonly BracketZone[] } | undefined;
  readonly railBracketZones: readonly BracketZone[];
  readonly bracketFocus:
    { readonly nodeKey: string; readonly zoneName?: string | undefined } | undefined;
  readonly matchPages: React.ComponentProps<typeof TvMatchList>['pages'];
}

/** The kiosk's secondary rail. */
export function TvRailPanel(props: TvRailPanelProps): React.JSX.Element {
  const {
    dashboardLabels,
    labels,
    language,
    clubs,
    timeZone,
    effectiveNow,
    fixedView,
    railTabs,
    activeTab,
    setActiveTab,
    performersTabLabel,
    pinnedRef,
    pinnedMatch,
    matches,
    railPaging,
    railPage,
    railStandingsRef,
    fullFrameColumns,
    scopeStandingsHeadings,
    standingsStageName,
    performers,
    facts,
    visibleBracket,
    railBracketZones,
    bracketFocus,
    matchPages,
  } = props;
  return (
    <aside aria-labelledby="tv-rail-panel-heading" className="tv-rail-panel cl-chamfer">
      <h2 className="cl-visually-hidden" id="tv-rail-panel-heading">
        {dashboardLabels.statsAndTablesLabel}
      </h2>
      {/* Navigation Tabs: a fixed view is that one section, so there is nothing to choose between. */}
      {!fixedView && (
        <nav aria-label={dashboardLabels.sidebarSectionsLabel} className="tv-rail-nav">
          {railTabs.includes('standings') && (
            <TvRailTab
              active={activeTab === 'standings'}
              label={dashboardLabels.standingsTab}
              onClick={() => setActiveTab('standings')}
            />
          )}
          {railTabs.includes('bracket') && (
            <TvRailTab
              active={activeTab === 'bracket'}
              label={dashboardLabels.bracketTab}
              onClick={() => setActiveTab('bracket')}
            />
          )}
          <TvRailTab
            active={activeTab === 'performers'}
            label={performersTabLabel}
            onClick={() => setActiveTab('performers')}
          />
          {pinnedRef === undefined && (
            <TvRailTab
              active={activeTab === 'facts'}
              label={dashboardLabels.statisticsTab}
              onClick={() => setActiveTab('facts')}
            />
          )}
          {pinnedRef !== undefined && (
            <TvRailTab
              active={activeTab === 'recent'}
              label={dashboardLabels.recentFormTab}
              onClick={() => setActiveTab('recent')}
            />
          )}
          {railTabs.includes('fixtures') && (
            <TvRailTab
              active={activeTab === 'fixtures'}
              label={dashboardLabels.fixturesTab}
              onClick={() => setActiveTab('fixtures')}
            />
          )}
        </nav>
      )}

      {/* Tab Content */}
      <div
        className={
          activeTab === 'standings' || activeTab === 'fixtures'
            ? 'tv-rail-content tv-rail-content--paged'
            : 'tv-rail-content'
        }
        data-testid="tv-rail-content"
        ref={railStandingsRef}
      >
        {activeTab === 'standings' && (
          <div className="tv-rail-standings">
            <TvStandingsTable
              clubs={clubs}
              columns={fullFrameColumns}
              dashboardLabels={dashboardLabels}
              pointsShortLabel={labels.pointsShort}
              scopesHeadings={scopeStandingsHeadings}
              showAllRows
              stageName={standingsStageName}
              standings={railPaging.pageRows}
            />
            <p className="tv-standings-pager">
              {railPaging.pageCount > 1
                ? applyTemplate(dashboardLabels.pageOf, {
                    page: railPaging.pageIndex + 1,
                    total: railPaging.pageCount,
                  })
                : '\u00a0'}
            </p>
          </div>
        )}

        {activeTab === 'performers' && (
          <TvPerformersView
            noTopPerformersLabel={dashboardLabels.noTopPerformers}
            performers={performers}
          />
        )}

        {activeTab === 'facts' && <TvFactsView facts={facts} />}

        {activeTab === 'recent' && pinnedMatch !== undefined && (
          <TvRecentResults
            emptyLabel={dashboardLabels.noMatchesScheduled}
            groups={pinnedMatch.sides.map((side) => ({
              name: side.name,
              matches: latestFinishedOf(matches, side.entrantId, 3),
            }))}
            locale={language}
            {...(timeZone === undefined ? {} : { timeZone })}
          />
        )}
        {activeTab === 'bracket' && visibleBracket && (
          <TvBracketView
            clubs={clubs}
            labels={dashboardLabels}
            zones={railBracketZones}
            {...(bracketFocus === undefined ? {} : { focus: bracketFocus })}
          />
        )}
        {activeTab === 'fixtures' && matchPages.length > 0 && (
          <TvMatchList
            locale={language}
            labels={dashboardLabels}
            page={railPage}
            pages={matchPages}
            referenceDate={effectiveNow}
            timeZone={timeZone}
          />
        )}
      </div>
    </aside>
  );
}
