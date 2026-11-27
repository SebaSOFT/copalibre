import type { RefObject } from 'react';
import type { SupportedLanguage } from '@copalibre/domain';
import type { TvStatisticsLabels } from '../../../../lib/tv-statistics.js';
import type { LiveMatch } from '../../../../lib/live-state.js';
import type { competitionContext } from '../../../../lib/competition-context.js';
import type { TvMatchEvent } from '../../../../lib/tv-match-events.js';
import type { StandingsRowView } from '../../../../lib/overview.js';
import { presentState } from '../../../../lib/result-state.js';
import { activeSegmentLabel } from '../../../../lib/segment-label.js';
import { applyTemplate } from '../../../../lib/matches-view.js';
import { formatTimestamp } from '../../../../lib/format-timestamp.js';
import { clockForMatch } from '../../tv-dashboard-model.js';
import type { TvClubItem, TvDashboardLabels } from '../../tv-types.js';
import { TvStandingsTable } from './TvStandingsTable.js';
import { TvEventTicker } from './TvEventTicker.js';
import { TvMatchIndicators } from './TvMatchIndicators.js';
import { ValueFlash } from '../../../ui/atoms/ValueFlash.js';
import { LiveMatchClock } from '../../../ui/atoms/LiveMatchClock.js';

/** The rotating dashboard's multi-match layout: the live matches, the next strip and the standings page. */
export interface TvMultiMatchDashboardProps {
  readonly dashboardLabels: TvDashboardLabels;
  readonly labels: TvStatisticsLabels;
  readonly language: SupportedLanguage;
  readonly clubs: readonly TvClubItem[] | undefined;
  readonly timeZone: string | undefined;
  readonly effectiveNow: number;
  readonly liveMatches: readonly LiveMatch[];
  readonly upcomingMatches: readonly LiveMatch[];
  readonly matchContextOf: (match: LiveMatch) => ReturnType<typeof competitionContext>;
  readonly eventsForMatch: (matchId: string) => readonly TvMatchEvent[];
  readonly eventIdsForMatch: (matchId: string) => readonly string[];
  readonly clockLabels: { readonly clockStopped: string; readonly clockAriaLabel: string };
  readonly venueNameByMatchId: Readonly<Record<string, string>> | undefined;
  readonly standingsPanelRef: RefObject<HTMLElement | null>;
  readonly standingsPageCount: number;
  readonly activeStandingsPage: number;
  readonly scopeStandingsHeadings: boolean;
  readonly standingsStageName: string | undefined;
  readonly dashboardStandings: readonly StandingsRowView[];
}

/** The rotating dashboard's multi-match layout. */
export function TvMultiMatchDashboard(props: TvMultiMatchDashboardProps): React.JSX.Element {
  const {
    dashboardLabels,
    labels,
    language,
    clubs,
    timeZone,
    effectiveNow,
    liveMatches,
    upcomingMatches,
    matchContextOf,
    eventsForMatch,
    eventIdsForMatch,
    clockLabels,
    venueNameByMatchId,
    standingsPanelRef,
    standingsPageCount,
    activeStandingsPage,
    scopeStandingsHeadings,
    standingsStageName,
    dashboardStandings,
  } = props;
  return (
    <main className="tv-multi-match-dashboard" data-testid="tv-multi-match-dashboard">
      <section className="tv-dashboard-live-panel cl-chamfer">
        <header className="tv-layout-panel-heading">
          <h2>{dashboardLabels.focalPanelTitle}</h2>
          <span>{liveMatches.length}</span>
        </header>
        <div className="tv-dashboard-live-grid">
          {liveMatches.slice(0, 2).map((match) => (
            <article
              className="tv-dashboard-match cl-chamfer"
              data-testid="tv-dashboard-match"
              key={match.matchId}
            >
              <header>
                <span>
                  {(() => {
                    const ctx = matchContextOf(match);
                    return ctx.matchLabel ? `${ctx.line} · ${ctx.matchLabel}` : ctx.line;
                  })()}
                </span>
                <span className={`tv-scorebug__badge tv-scorebug__badge--${match.state}`}>
                  {presentState(match.state, dashboardLabels.resultState).label}
                </span>
              </header>
              <div className="tv-dashboard-match__scoreline">
                <span title={match.sides[0]?.name}>
                  {match.sides[0]?.name ?? dashboardLabels.homeSide}
                </span>
                <strong
                  aria-label={`${match.sides[0]?.score ?? 0} : ${match.sides[1]?.score ?? 0}`}
                >
                  <ValueFlash value={match.sides[0]?.score ?? 0} /> :{' '}
                  <ValueFlash value={match.sides[1]?.score ?? 0} />
                </strong>
                <span title={match.sides[1]?.name}>
                  {match.sides[1]?.name ?? dashboardLabels.awaySide}
                </span>
              </div>
              {(clockForMatch(match) ||
                activeSegmentLabel(match.segments, match.clock, language)) && (
                <LiveMatchClock
                  className="tv-dashboard-match__clock"
                  clock={clockForMatch(match)}
                  labels={clockLabels}
                  segmentLabel={activeSegmentLabel(match.segments, match.clock, language)}
                  variant="tv"
                />
              )}
              <TvMatchIndicators
                match={match}
                possessionLabel={dashboardLabels.possession}
                penaltyLabel={dashboardLabels.penalty}
              />
              {eventsForMatch(match.matchId).length > 0 && (
                <TvEventTicker
                  ariaLabel={dashboardLabels.matchEventsLabel}
                  awayLabel={labels.awaySide}
                  events={eventsForMatch(match.matchId)}
                  homeLabel={labels.homeSide}
                  initialEventIds={eventIdsForMatch(match.matchId)}
                  language={language}
                  referenceDate={effectiveNow}
                  timeZone={timeZone}
                />
              )}
            </article>
          ))}
          {liveMatches.length === 0 && (
            <p className="tv-layout-empty">{dashboardLabels.noMatchesScheduled}</p>
          )}
        </div>
      </section>
      <section className="tv-dashboard-upcoming-panel cl-chamfer">
        <h2>{dashboardLabels.nextMatch}</h2>
        {upcomingMatches.length > 0 ? (
          <ol className="tv-dashboard-upcoming-grid">
            {upcomingMatches.map((match) => (
              <li data-testid="tv-upcoming-match" key={match.matchId}>
                <span title={match.sides[0]?.name}>
                  {match.sides[0]?.name ?? dashboardLabels.homeSide}
                </span>
                <strong aria-label={dashboardLabels.resultState.upcoming}>–</strong>
                <span title={match.sides[1]?.name}>
                  {match.sides[1]?.name ?? dashboardLabels.awaySide}
                </span>
                {match.scheduledAt && (
                  <small>
                    {formatTimestamp(match.scheduledAt, {
                      locale: language,
                      referenceDate: effectiveNow,
                      timeZone,
                    })}
                  </small>
                )}
                {venueNameByMatchId?.[match.matchId] && (
                  <small>{venueNameByMatchId[match.matchId]}</small>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="tv-layout-empty">{dashboardLabels.noMatchesScheduled}</p>
        )}
      </section>
      <section
        className="tv-dashboard-standings cl-chamfer"
        data-page-count={standingsPageCount}
        data-page-index={activeStandingsPage}
        data-testid="tv-dashboard-standings"
        ref={standingsPanelRef}
      >
        <header className="tv-layout-panel-heading">
          <h2>{dashboardLabels.standingsTab}</h2>
          {standingsPageCount > 1 && (
            <span aria-hidden="true" className="tv-dashboard-standings__page">
              {activeStandingsPage + 1} / {standingsPageCount}
            </span>
          )}
        </header>
        <TvStandingsTable
          clubs={clubs}
          dashboardLabels={dashboardLabels}
          pointsShortLabel={labels.pointsShort}
          scopesHeadings={scopeStandingsHeadings}
          showAllRows
          stageName={standingsStageName}
          standings={dashboardStandings}
        />
        {/* Always rendered, so the measured page leaves room for it; blank while there is one page. */}
        <p className="tv-standings-pager">
          {standingsPageCount > 1
            ? applyTemplate(dashboardLabels.pageOf, {
                page: activeStandingsPage + 1,
                total: standingsPageCount,
              })
            : '\u00a0'}
        </p>
      </section>
    </main>
  );
}
