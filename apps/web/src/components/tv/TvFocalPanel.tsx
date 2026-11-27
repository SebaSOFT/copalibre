import type { SupportedLanguage } from '@copalibre/domain';
import type { TvStatisticsLabels, ChampionInfo } from '../../lib/tv-statistics.js';
import type { LiveMatch } from '../../lib/live-state.js';
import type { competitionContext } from '../../lib/competition-context.js';
import type { tvMatchProgress } from '../../lib/tv-match-progress.js';
import type { TvMatchEvent } from '../../lib/tv-match-events.js';
import type { StatePresentation } from '../../lib/result-state.js';
import { tvStateColor } from '../../lib/tv-branding.js';
import type { TvClubItem, TvDashboardLabels, TvWinnerZone } from './tv-types.js';
import { TvTeamSide } from './TvTeamSide.js';
import { TvChampions } from './ui/organisms/TvChampions.js';
import { TvEventTicker } from './ui/organisms/TvEventTicker.js';
import { TvMatchCounters } from './ui/organisms/TvMatchCounters.js';
import { TvSeriesAndSets } from './ui/organisms/TvSeriesAndSets.js';
import { TvStartTime } from './ui/atoms/TvStartTime.js';
import { EntrantEmblem } from '../ui/molecules/EntrantEmblem.js';
import { LiveMatchClock } from '../ui/atoms/LiveMatchClock.js';
import { ValueFlash } from '../ui/atoms/ValueFlash.js';

/** The kiosk's focal panel: the recap, a champion, the spotlight match, or the state the pinned route shows. */
export interface TvFocalPanelProps {
  readonly dashboardLabels: TvDashboardLabels;
  readonly labels: TvStatisticsLabels;
  readonly language: SupportedLanguage;
  readonly clubs: readonly TvClubItem[] | undefined;
  readonly timeZone: string | undefined;
  readonly effectiveNow: number;
  readonly tournamentName: string | undefined;
  readonly showRecap: boolean;
  readonly isRotatingDashboard: boolean;
  readonly showZoneChampions: boolean;
  readonly allFinal: boolean;
  readonly champion: ChampionInfo | undefined;
  readonly winnerZones: readonly TvWinnerZone[];
  readonly spotlightMatch: LiveMatch | undefined;
  readonly spotlightClock: LiveMatch['clock'];
  readonly clockLabels: { readonly clockStopped: string; readonly clockAriaLabel: string };
  readonly progress: ReturnType<typeof tvMatchProgress>;
  readonly liveMatchEvents: readonly TvMatchEvent[];
  readonly initialMatchEventIds: readonly string[];
  readonly isOverlayPresentation: boolean;
  readonly pinnedMissing: boolean;
  readonly pinnedStageLabel: string;
  readonly noMatchMessage: string;
  readonly matchContextOf: (match: LiveMatch) => ReturnType<typeof competitionContext>;
  readonly isMatchDelayed: (match: LiveMatch) => boolean;
  readonly matchBadgeFor: (match: LiveMatch) => StatePresentation;
  readonly venueOf: (match: LiveMatch) => string | undefined;
}

/** The kiosk's focal panel. */
export function TvFocalPanel(props: TvFocalPanelProps): React.JSX.Element {
  const {
    dashboardLabels,
    labels,
    language,
    clubs,
    timeZone,
    effectiveNow,
    tournamentName,
    showRecap,
    isRotatingDashboard,
    showZoneChampions,
    allFinal,
    champion,
    winnerZones,
    spotlightMatch,
    spotlightClock,
    clockLabels,
    progress,
    liveMatchEvents,
    initialMatchEventIds,
    isOverlayPresentation,
    pinnedMissing,
    pinnedStageLabel,
    noMatchMessage,
    matchContextOf,
    isMatchDelayed,
    matchBadgeFor,
    venueOf,
  } = props;
  return (
    <section aria-labelledby="tv-focal-panel-heading" className="tv-focal-panel cl-chamfer">
      <h2 className="cl-visually-hidden" id="tv-focal-panel-heading">
        {showRecap ? dashboardLabels.recapTitle : dashboardLabels.focalPanelTitle}
      </h2>
      <div className="tv-focal-panel__header">
        <span className="tv-focal-panel__label">
          {showRecap ? dashboardLabels.recapTitle : dashboardLabels.focalPanelTitle}
        </span>
      </div>

      {isRotatingDashboard && showZoneChampions ? (
        /* The champions of every zone of the last stage */
        <TvChampions zones={winnerZones} />
      ) : isRotatingDashboard && allFinal && champion ? (
        /* Champion Spotlight Presentation */
        <div className="tv-champion" data-testid="tv-champion-panel">
          <div className="tv-champion__glow" />
          <div className="tv-champion__badge cl-chamfer">
            <span>★ {champion.title} ★</span>
          </div>
          <div className="tv-champion__emblem-wrap">
            <EntrantEmblem
              alt={champion.name}
              className="tv-champion__emblem"
              abbreviation={champion.abbreviation}
              decorative
              eager
              size="18vmin"
              src={champion.emblemUrl}
            />
          </div>
          <h3 className="tv-champion__name">{champion.name}</h3>
          {champion.record && <p className="tv-champion__record">{champion.record}</p>}
        </div>
      ) : spotlightMatch ? (
        /* Spotlight Match Presentation */
        <div className="tv-match-spotlight" data-testid="tv-match-spotlight">
          <div className="tv-match-spotlight__stage">
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
          </div>
          <div className="tv-match-spotlight__vs-grid">
            {/* Home side */}
            <TvTeamSide
              clubs={clubs}
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

            {/* Score Center */}
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
                <div className="tv-score-center__digits">
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
              <div
                className="cl-chamfer"
                style={{
                  padding: '0.4vmin 1.4vmin',
                  background: 'var(--tv-bg-elevated)',
                  border: `1px solid ${isMatchDelayed(spotlightMatch) ? 'var(--cl-state-warning)' : tvStateColor(spotlightMatch.state)}`,
                  fontFamily: 'var(--cl-font-mono)',
                  fontSize: 'clamp(var(--cl-font-size-xs), 1.4vmin, var(--cl-font-size-base))',
                  color: isMatchDelayed(spotlightMatch)
                    ? 'var(--cl-state-warning)'
                    : tvStateColor(spotlightMatch.state),
                  textTransform: 'uppercase',
                }}
              >
                {matchBadgeFor(spotlightMatch).label}
              </div>
              {spotlightClock !== undefined && (
                <LiveMatchClock
                  className="tv-match-spotlight__clock"
                  clock={spotlightClock}
                  labels={clockLabels}
                  segmentLabel={progress.segmentLabel}
                  variant="tv"
                />
              )}
            </div>

            {/* Away Side */}
            <TvTeamSide
              clubs={clubs}
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

          <TvSeriesAndSets
            labels={dashboardLabels}
            progress={spotlightClock ? { ...progress, segmentLabel: undefined } : progress}
          />

          {liveMatchEvents.length > 0 ? (
            <TvEventTicker
              ariaLabel={dashboardLabels.matchEventsLabel}
              awayLabel={labels.awaySide}
              events={liveMatchEvents}
              homeLabel={labels.homeSide}
              initialEventIds={initialMatchEventIds}
              language={language}
              referenceDate={effectiveNow}
              timeZone={timeZone}
            />
          ) : null}
        </div>
      ) : isOverlayPresentation && !pinnedMissing ? (
        <div className="tv-champion" data-testid="tv-overlay-no-match">
          <h3 className="tv-champion__name">{noMatchMessage}</h3>
        </div>
      ) : pinnedMissing ? (
        <div className="tv-champion" data-testid="tv-match-not-found">
          <h3 className="tv-champion__name">{dashboardLabels.matchNotFound}</h3>
          <p className="tv-champion__record">
            {tournamentName} · {pinnedStageLabel}
          </p>
        </div>
      ) : (
        <div className="tv-champion">
          <h3 className="tv-champion__name">{tournamentName}</h3>
          <p className="tv-champion__record">{dashboardLabels.noMatchesScheduled}</p>
        </div>
      )}
    </section>
  );
}
