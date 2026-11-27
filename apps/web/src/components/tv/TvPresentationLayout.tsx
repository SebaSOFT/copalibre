import type { SupportedLanguage } from '@copalibre/domain';
import type { TvStatisticsLabels } from '../../lib/tv-statistics.js';
import type { LiveMatch } from '../../lib/live-state.js';
import type { StandingsRowView } from '../../lib/overview.js';
import type { competitionContext } from '../../lib/competition-context.js';
import type { tvMatchProgress } from '../../lib/tv-match-progress.js';
import type { TvMatchEvent } from '../../lib/tv-match-events.js';
import type { StatePresentation } from '../../lib/result-state.js';
import { formatTimestamp } from '../../lib/format-timestamp.js';
import type { BracketZone } from '../../lib/bracket-projection.js';
import type { TvClubItem, TvDashboardLabels } from './tv-types.js';
import { TvTeamSide } from './TvTeamSide.js';
import { TvStandingsTable } from './ui/organisms/TvStandingsTable.js';
import { TvEventTicker } from './ui/organisms/TvEventTicker.js';
import { TvMatchIndicators } from './ui/organisms/TvMatchIndicators.js';
import { TvMatchCounters } from './ui/organisms/TvMatchCounters.js';
import { TvBracketView } from './ui/organisms/TvBracketView.js';
import { TvStartTime } from './ui/atoms/TvStartTime.js';
import { ValueFlash } from '../ui/atoms/ValueFlash.js';
import { LiveMatchClock } from '../ui/atoms/LiveMatchClock.js';

/** The presentation layout's inputs: the focal match, its rail and its next-match strip. */
export interface TvPresentationLayoutProps {
  readonly dashboardLabels: TvDashboardLabels;
  readonly labels: TvStatisticsLabels;
  readonly language: SupportedLanguage;
  readonly clubs: readonly TvClubItem[] | undefined;
  readonly timeZone: string | undefined;
  readonly effectiveNow: number;
  readonly spotlightMatch: LiveMatch | undefined;
  readonly spotlightClock: LiveMatch['clock'];
  readonly clockLabels: { readonly clockStopped: string; readonly clockAriaLabel: string };
  readonly progress: ReturnType<typeof tvMatchProgress>;
  readonly leadingSide: 'home' | 'away' | undefined;
  readonly isMatchDelayed: (match: LiveMatch) => boolean;
  readonly matchBadgeFor: (match: LiveMatch) => StatePresentation;
  readonly matchContextOf: (match: LiveMatch) => ReturnType<typeof competitionContext>;
  readonly venueOf: (match: LiveMatch) => string | undefined;
  readonly eventsForMatch: (matchId: string) => readonly TvMatchEvent[];
  readonly eventIdsForMatch: (matchId: string) => readonly string[];
  readonly visibleBracket:
    { readonly stageNumber: number; readonly zones: readonly BracketZone[] } | undefined;
  readonly bracketFocus:
    { readonly nodeKey: string; readonly zoneName?: string | undefined } | undefined;
  readonly standings: readonly StandingsRowView[] | undefined;
  readonly standingsStageName: string | undefined;
  readonly scopeStandingsHeadings: boolean;
  readonly upcomingMatches: readonly LiveMatch[];
  readonly venueNameByMatchId: Readonly<Record<string, string>> | undefined;
}

/** The presentation layout: the focal match with its bracket and standings beside it, and the next-match strip. */
export function TvPresentationLayout(props: TvPresentationLayoutProps): React.JSX.Element {
  const {
    dashboardLabels,
    labels,
    language,
    clubs,
    timeZone,
    effectiveNow,
    spotlightMatch,
    spotlightClock,
    clockLabels,
    progress,
    leadingSide,
    isMatchDelayed,
    matchBadgeFor,
    matchContextOf,
    venueOf,
    eventsForMatch,
    eventIdsForMatch,
    visibleBracket,
    bracketFocus,
    standings,
    standingsStageName,
    scopeStandingsHeadings,
    upcomingMatches,
    venueNameByMatchId,
  } = props;
  return (
    <main className="tv-presentation-layout" data-testid="tv-presentation-layout">
      <section className="tv-presentation-hero cl-chamfer">
        <header className="tv-layout-panel-heading">
          <h2>{dashboardLabels.focalPanelTitle}</h2>
          {spotlightMatch && (
            <span
              className={`tv-scorebug__badge tv-scorebug__badge--${isMatchDelayed(spotlightMatch) ? 'delayed' : spotlightMatch.state}`}
            >
              {matchBadgeFor(spotlightMatch).label}
            </span>
          )}
        </header>
        {spotlightMatch ? (
          <div className="tv-presentation-match">
            <p className="tv-match-spotlight__stage">
              {(() => {
                const ctx = matchContextOf(spotlightMatch);
                return (
                  <>
                    <span>{ctx.line}</span>
                    {ctx.matchLabel && (
                      <span className="tv-match-spotlight__match-number">{ctx.matchLabel}</span>
                    )}
                  </>
                );
              })()}
            </p>
            <div className="tv-presentation-match__sides">
              <TvTeamSide
                clubs={clubs}
                leading={leadingSide === 'home'}
                leadingLabel={dashboardLabels.leading}
                name={spotlightMatch.sides[0]?.name ?? dashboardLabels.homeSide}
                abbreviation={spotlightMatch.sides[0]?.abbreviation}
                clubId={spotlightMatch.sides[0]?.clubId}
                roleLabel={labels.homeSide}
              >
                <TvMatchCounters
                  density="full"
                  language={language}
                  match={spotlightMatch}
                  side="home"
                  sideLabel={false}
                  texts={dashboardLabels.counters}
                />
              </TvTeamSide>
              <div className="tv-score-center">
                {spotlightMatch.state === 'upcoming' && spotlightMatch.scheduledAt ? (
                  <TvStartTime
                    className="tv-score-center__digits"
                    court={venueOf(spotlightMatch)}
                    locale={language}
                    referenceDate={effectiveNow}
                    scheduledAt={spotlightMatch.scheduledAt}
                    {...(timeZone === undefined ? {} : { timeZone })}
                  />
                ) : (
                  <div
                    className="tv-score-center__digits"
                    aria-label={
                      spotlightMatch.state === 'upcoming'
                        ? dashboardLabels.resultState.upcoming
                        : `${spotlightMatch.sides[0]?.score ?? 0} : ${spotlightMatch.sides[1]?.score ?? 0}`
                    }
                  >
                    {spotlightMatch.state === 'upcoming' ? (
                      '–'
                    ) : (
                      <>
                        <ValueFlash value={spotlightMatch.sides[0]?.score ?? 0} /> :{' '}
                        <ValueFlash value={spotlightMatch.sides[1]?.score ?? 0} />
                      </>
                    )}
                  </div>
                )}
                {(spotlightClock || progress.segmentLabel) && (
                  <LiveMatchClock
                    className="tv-presentation-match__clock"
                    clock={spotlightClock}
                    labels={clockLabels}
                    segmentLabel={progress.segmentLabel}
                    variant="tv"
                  />
                )}
              </div>
              <TvTeamSide
                clubs={clubs}
                leading={leadingSide === 'away'}
                leadingLabel={dashboardLabels.leading}
                name={spotlightMatch.sides[1]?.name ?? dashboardLabels.awaySide}
                abbreviation={spotlightMatch.sides[1]?.abbreviation}
                clubId={spotlightMatch.sides[1]?.clubId}
                roleLabel={labels.awaySide}
              >
                <TvMatchCounters
                  density="full"
                  language={language}
                  match={spotlightMatch}
                  side="away"
                  sideLabel={false}
                  texts={dashboardLabels.counters}
                />
              </TvTeamSide>
            </div>
            <TvMatchIndicators
              match={spotlightMatch}
              possessionLabel={dashboardLabels.possession}
              penaltyLabel={dashboardLabels.penalty}
            />
            {eventsForMatch(spotlightMatch.matchId).length > 0 && (
              <TvEventTicker
                ariaLabel={dashboardLabels.matchEventsLabel}
                awayLabel={labels.awaySide}
                events={eventsForMatch(spotlightMatch.matchId)}
                homeLabel={labels.homeSide}
                initialEventIds={eventIdsForMatch(spotlightMatch.matchId)}
                language={language}
                referenceDate={effectiveNow}
                timeZone={timeZone}
              />
            )}
          </div>
        ) : (
          <p className="tv-layout-empty">{dashboardLabels.noMatchesScheduled}</p>
        )}
      </section>
      <aside className="tv-presentation-rail">
        <section className="tv-layout-panel cl-chamfer">
          <h2>{dashboardLabels.bracketTab}</h2>
          {visibleBracket?.zones.length ? (
            <TvBracketView
              clubs={clubs}
              labels={dashboardLabels}
              zones={visibleBracket.zones}
              {...(bracketFocus === undefined ? {} : { focus: bracketFocus })}
            />
          ) : (
            <p className="tv-layout-empty">{dashboardLabels.noMatchesScheduled}</p>
          )}
        </section>
        <section className="tv-layout-panel tv-presentation-standings cl-chamfer">
          <h2>{dashboardLabels.standingsTab}</h2>
          <TvStandingsTable
            clubs={clubs}
            dashboardLabels={dashboardLabels}
            pointsShortLabel={labels.pointsShort}
            scopesHeadings={scopeStandingsHeadings}
            stageName={standingsStageName}
            standings={standings}
          />
        </section>
      </aside>
      <section className="tv-next-match-crawl cl-chamfer" aria-label={dashboardLabels.nextMatch}>
        <h2>{dashboardLabels.nextMatch}</h2>
        {upcomingMatches.length > 0 ? (
          <ol>
            {upcomingMatches.map((match) => (
              <li data-testid="tv-next-match" key={match.matchId}>
                <span>{match.sides[0]?.name ?? dashboardLabels.homeSide}</span>
                <span>–</span>
                <span>{match.sides[1]?.name ?? dashboardLabels.awaySide}</span>
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
    </main>
  );
}
