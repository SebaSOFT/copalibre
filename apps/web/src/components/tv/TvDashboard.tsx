import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { SupportedLanguage } from '@copalibre/domain';
import { RealtimeClient } from '@copalibre/realtime';
import {
  applyEvent,
  markConnected,
  type LiveDashboard,
  type LiveMatch,
} from '../../lib/live-state.js';
import {
  BroadcastAlertBanner,
  type BroadcastAlertItem,
} from './ui/organisms/BroadcastAlertBanner.js';
import { resolveLiveTvMatchEvent } from '../../lib/tv-match-events.js';
import { presentState } from '../../lib/result-state.js';
import { applyTemplate, formatClock } from '../../lib/matches-view.js';
import { formatTimestamp } from '../../lib/format-timestamp.js';
import { findPinnedMatch, type PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import { pageTvMatches, type TvMatchEntry } from '../../lib/tv-match-list.js';
import { resolveTvBranding, tvStateColor, type TvBranding } from '../../lib/tv-branding.js';
import type { StandingsRowView } from '../../lib/overview.js';
import {
  deriveTopPerformers,
  deriveTournamentFacts,
  resolveChampion,
  type TopPerformer,
  type TournamentFact,
  type ChampionInfo,
  type TvStatisticsLabels,
} from '../../lib/tv-statistics.js';
import { TvTeamSide } from './TvTeamSide.js';
import { TvPerformersView } from './TvPerformersView.js';
import { TvFactsView } from './TvFactsView.js';
import { TvStandingsTable } from './ui/organisms/TvStandingsTable.js';
import { TvEventTicker } from './ui/organisms/TvEventTicker.js';
import { TvRailTab } from './ui/atoms/TvRailTab.js';
import type { TvClubItem, TvDashboardLabels, TvWinnerZone } from './tv-types.js';
import type { TvMatchEvent } from '../../lib/tv-match-events.js';
import { mapBracketResponse } from '../../lib/bracket-projection.js';
import type { BracketZone } from '../../lib/bracket-projection.js';
import { bracketZonesOf } from '../../lib/bracket.js';
import type { PublicBracketResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { TvMatchIndicators } from './ui/organisms/TvMatchIndicators.js';
import { TvBracketView } from './ui/organisms/TvBracketView.js';
import { TvMatchList } from './ui/organisms/TvMatchList.js';
import { TvChampions } from './ui/organisms/TvChampions.js';
import { TvEmblem } from './ui/atoms/TvEmblem.js';

export type { TvClubItem, TvDashboardLabels, TvWinnerZone } from './tv-types.js';

/**
 * `lower` is a compact score bug meant to sit over a camera feed; `full` is a
 * self-contained broadcast scene for a stream with no camera source; `kiosk`
 * (the default) is the venue display.
 */
export type TvPresentation = 'kiosk' | 'lower' | 'full';

export interface TvDashboardProps {
  readonly initial: LiveDashboard;
  readonly streamPath: string;
  /**
   * Supplied by the server from the request URL. Deriving it from
   * `window.location` instead meant the first response — the one a broadcast
   * consumer actually captures — never carried the overlay presentation.
   */
  readonly presentation?: TvPresentation;
  /**
   * Set on the pinned-match route; the full-rotation route leaves this unset. The match is named
   * the way the public match route names it, by its stage and its ordinal within that stage.
   */
  readonly pinnedMatch?: PinnedMatchRef;
  /**
   * Keeps a launcher-selected view fixed and full-frame instead of entering carousel rotation:
   * `standings` fills the frame with the table, `matches` with the paged match list.
   */
  readonly initialView?: 'standings' | 'matches';
  /** The organization's IANA zone, in which the header's clock is read. */
  readonly timeZone?: string;
  /** The date of the tournament's last match, shown as the day a finished tournament ended. */
  readonly lastMatchAt?: string;
  /**
   * The pinned match's own recorded events (goals, cards), set only on the pinned-match route —
   * the full-rotation route leaves this unset, same as `pinnedMatchNumber`.
   * Empty or unset renders no ticker section at all, rather than an empty-state placeholder.
   */
  readonly matchEvents?: readonly TvMatchEvent[];
  /**
   * `personId -> display text`, from the pinned match's own rosters —
   * set only alongside `matchEvents`, on the pinned-match
   * route. Resolves a live alert's actor the same way the initial
   * `matchEvents` ticker already resolves one; a `Map` would not survive
   * this island's own JSON prop serialization.
   */
  readonly rosterActors?: Readonly<Record<string, string>>;
  readonly initialBracket?: {
    readonly stageNumber: number;
    /** Zones playing an elimination format: drawn as a bracket. */
    readonly zones: readonly BracketZone[];
  };
  /**
   * Every match of the tournament as list entries, for the `matches` section: it pages through
   * them. Absent or empty leaves the dashboard without that section.
   */
  readonly matchList?: readonly TvMatchEntry[];
  readonly branding?: TvBranding;
  readonly tournamentName?: string;
  readonly organizationName?: string;
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly clubs?: readonly TvClubItem[];
  /**
   * The champions the public projection resolved for each zone of the last stage. When present they
   * are the recap of a finished tournament; a standings leader of an earlier stage never is.
   */
  readonly winners?: readonly TvWinnerZone[];
  readonly standings?: readonly StandingsRowView[];
  readonly topPerformers?: readonly TopPerformer[];
  /**
   * The discipline's own player-ranking projection. Passing `undefined` sends
   * `deriveTopPerformers` down its standings fallback, which is what this
   * surface did unconditionally before: the projection branch never ran outside
   * its own tests.
   */
  readonly performerProjection?: TableProjectionResponse;
  readonly labels: TvStatisticsLabels;
  /**
   * The dashboard's own chrome text — separate
   * from `labels`, which is `tv-statistics.ts`'s derived-stat vocabulary.
   * No client-side react-intl is threaded into this component: every
   * string it renders arrives pre-formatted, the same as `labels` already
   * does, since this crosses into a `client:load` island whose props Astro
   * serializes as JSON.
   */
  readonly dashboardLabels: TvDashboardLabels;
  readonly language: SupportedLanguage;
  readonly pollIntervalMs?: number;
}

export function TvDashboard({
  initial,
  streamPath,
  presentation = 'kiosk',
  pinnedMatch: pinnedRef,
  timeZone,
  lastMatchAt,
  matchEvents,
  rosterActors,
  initialBracket,
  matchList,
  branding,
  tournamentName,
  organizationName,
  organizationAlias,
  tournamentAlias,
  clubs,
  winners,
  standings,
  topPerformers: initialTopPerformers,
  performerProjection,
  labels,
  dashboardLabels,
  language,
  pollIntervalMs = 15_000,
  initialView,
}: TvDashboardProps): React.JSX.Element {
  const [dashboard, setDashboard] = useState<LiveDashboard>(initial);
  const [rail, setRail] = useState<{
    readonly tab: 'standings' | 'performers' | 'facts' | 'bracket' | 'fixtures';
    readonly page: number;
  }>({ tab: initialView === 'matches' ? 'fixtures' : 'standings', page: 0 });
  const activeTab = rail.tab;
  const setActiveTab = (tab: typeof rail.tab): void => setRail({ tab, page: 0 });
  const [bracketData, setBracketData] = useState(initialBracket);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const isOverlay = presentation === 'lower';
  const showBroadcastAlerts = presentation === 'lower' || presentation === 'full';
  const resolvedBranding = resolveTvBranding(branding ?? {});
  const [alertQueue, setAlertQueue] = useState<readonly BroadcastAlertItem[]>([]);
  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);
  const eventLabelsByCode = useMemo(
    () =>
      Object.fromEntries((matchEvents ?? []).map((event) => [event.definitionCode, event.label])),
    [matchEvents],
  );

  // 1. Wall clock, to the minute, in the organization's zone: a venue screen watched from across
  // the room has no use for seconds, and a finished tournament shows no clock at all.
  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(
        formatTimestamp(new Date(), { locale: language, format: 'time-only', timeZone }),
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 15_000);
    return () => clearInterval(timer);
  }, [language, timeZone]);

  // 2. Motion Preference Listener
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener?.('change', handler);
    return () => mediaQuery.removeEventListener?.('change', handler);
  }, []);

  // 3. Polling Refresh Handler (Fallback when tokenless or projection out of sync)
  // Returns the freshly-fetched matches (the alert banner diffs
  // scores against this return value directly, rather than racing React's
  // own state-update timing) — every existing caller already discards it.
  const refreshProjection = useCallback(async (): Promise<readonly LiveMatch[] | undefined> => {
    if (!organizationAlias || !tournamentAlias) return undefined;
    try {
      const res = await fetch(
        `/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/live`,
      );
      if (res.ok) {
        const liveData = await res.json();
        if (liveData && Array.isArray(liveData.matches)) {
          setDashboard((current) => ({
            ...current,
            matches: liveData.matches,
          }));
          return liveData.matches as readonly LiveMatch[];
        }
      }
    } catch {
      // Degrade silently; do not reload page
    }
    return undefined;
  }, [organizationAlias, tournamentAlias]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const pollTimer = window.setInterval(() => void refreshProjection(), pollIntervalMs);
    return () => window.clearInterval(pollTimer);
  }, [pollIntervalMs, refreshProjection]);

  // 4. Realtime SSE Connection with Graceful Degradation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = new URLSearchParams(window.location.search).get('token');

    // Case A: No token present in URL. Run polling fallback only, NEVER call RealtimeClient to avoid 401 loop
    if (!token) {
      return;
    }

    // Case B: Token is present. Layer SSE client on top
    const streamUrl = new URL(streamPath, window.location.origin);
    streamUrl.searchParams.set('surface', presentation === 'kiosk' ? 'kiosk' : 'overlay');
    const client = new RealtimeClient({
      url: streamUrl.pathname + streamUrl.search,
      accessToken: () => token,
      heartbeatTimeoutMs: 30_000,
    });

    void client.connect({
      onOpen: () => setDashboard((current) => markConnected(current)),
      onEvent: (event) => {
        setDashboard((current) => applyEvent(current, event));
        const before =
          pinnedRef === undefined
            ? undefined
            : findPinnedMatch(dashboardRef.current.matches, pinnedRef);
        void refreshProjection().then((updated) => {
          if (
            !showBroadcastAlerts ||
            event.eventType !== 'match.event-recorded' ||
            !before ||
            !updated
          ) {
            return;
          }
          const after = updated.find((m) => m.matchId === before.matchId);
          if (
            !after ||
            typeof event.payload.matchId !== 'string' ||
            event.payload.matchId !== before.matchId
          ) {
            return;
          }
          const resolved = resolveLiveTvMatchEvent(
            { eventId: event.eventId, payload: event.payload },
            {
              homeEntrantId: after.sides[0]?.entrantId,
              awayEntrantId: after.sides[1]?.entrantId,
              actors: rosterActors ?? {},
              labelsByCode: eventLabelsByCode,
            },
          );
          if (!resolved) return;
          const scoring = after.sides.some(
            (side, index) => side.score !== before.sides[index]?.score,
          );
          setAlertQueue((current) => [
            ...current,
            { event: resolved, kind: scoring ? 'scoring' : 'notable' },
          ]);
        });
      },
      // DO NOT RELOAD PAGE ON PROJECTION REQUIRED. Refresh in-memory projection instead
      onProjectionRequired: () => {
        void refreshProjection();
      },
      onFailure: () => {
        // Silently fall back to polling on SSE failure
        void refreshProjection();
      },
    });

    return () => client.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnecting SSE on every render of a prop that changes is worse than a stale closure here: pinnedRef/rosterActors/showBroadcastAlerts are server-supplied once at mount (same treatment matchEvents itself already gets), and eventLabelsByCode only grows from the same static matchEvents.
  }, [streamPath, refreshProjection, presentation]);

  // 5. Automatic Carousel Rotation (respects prefers-reduced-motion)
  // A fixed `standings` view has nothing to rotate; a fixed `matches` view only pages its list; the
  // rotating dashboard pages the list too before it moves to the next section.
  const matchPages = useMemo(() => pageTvMatches(matchList ?? []), [matchList]);
  useEffect(() => {
    if (prefersReducedMotion || initialView === 'standings') return;
    const interval = setInterval(() => {
      setRail((current) => {
        if (current.tab === 'fixtures' && current.page < matchPages.length - 1) {
          return { tab: 'fixtures', page: current.page + 1 };
        }
        if (initialView === 'matches') return { tab: 'fixtures', page: 0 };
        const next = (tab: typeof current.tab): typeof current.tab => {
          if (tab === 'standings') return 'performers';
          if (tab === 'performers') return 'facts';
          // The bracket and the match list join the rotation only for a stage that has them.
          if (tab === 'facts' && bracketData?.zones.length) return 'bracket';
          if (tab === 'facts' && matchPages.length > 0) return 'fixtures';
          if (tab === 'bracket' && matchPages.length > 0) return 'fixtures';
          return 'standings';
        };
        return { tab: next(current.tab), page: 0 };
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [prefersReducedMotion, bracketData, initialView, matchPages.length]);

  // 6. Data Computations
  const matches = dashboard.matches;
  const pinnedMatch = pinnedRef === undefined ? undefined : findPinnedMatch(matches, pinnedRef);
  // A pinned route names one match; one that does not exist is said so, never swapped for another.
  const pinnedMissing = pinnedRef !== undefined && pinnedMatch === undefined;

  const liveMatches = matches.filter((m) => m.state === 'live');
  const allFinal = matches.length > 0 && matches.every((m) => m.state === 'final');
  const isLive = liveMatches.length > 0;

  const winnerZones = winners ?? [];
  const soleWinner =
    winnerZones.length === 1 && winnerZones[0]?.zoneName === undefined
      ? winnerZones[0]?.champions
      : undefined;
  // One unnamed zone with one champion keeps the single-champion presentation.
  const champion: ChampionInfo | undefined =
    soleWinner?.length === 1 && soleWinner[0]
      ? { ...soleWinner[0], title: labels.championTitle }
      : winnerZones.length > 0
        ? undefined
        : resolveChampion(labels, matches, standings, clubs);
  const showZoneChampions = allFinal && winnerZones.length > 0 && champion === undefined;
  // The recap belongs to the rotating dashboard alone: a pinned match and a fixed view mean what
  // they say, finished tournament or not.
  const isRotatingDashboard = pinnedRef === undefined && initialView === undefined;
  const showRecap =
    isRotatingDashboard && allFinal && (champion !== undefined || showZoneChampions);
  const performers: readonly TopPerformer[] =
    initialTopPerformers && initialTopPerformers.length > 0
      ? initialTopPerformers
      : deriveTopPerformers(labels, language, performerProjection, standings, clubs);
  const facts: readonly TournamentFact[] = deriveTournamentFacts(labels, matches);

  // Status Badge Determination
  const statusBadgeState = isLive ? 'live' : allFinal ? 'final' : 'upcoming';
  const statusBadge = {
    label: dashboardLabels.resultState[statusBadgeState],
    type: statusBadgeState,
  };

  // Spotlight Match (pinned match or active live match or first match)
  const spotlightMatch = pinnedRef === undefined ? (liveMatches[0] ?? matches[0]) : pinnedMatch;
  const bracketStage = spotlightMatch?.stageNumber;
  useEffect(() => {
    if (presentation === 'lower' || !organizationAlias || !tournamentAlias || !bracketStage) return;
    const refreshBracket = async () => {
      try {
        const response = await fetch(
          `/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${bracketStage}/bracket`,
        );
        if (!response.ok) return;
        const mapped = mapBracketResponse((await response.json()) as PublicBracketResponse);
        const zones = bracketZonesOf(mapped);
        setBracketData(zones.length > 0 ? { stageNumber: bracketStage, zones } : undefined);
      } catch {
        // The other TV sections retain their last-known projection.
      }
    };
    void refreshBracket();
    const timer = window.setInterval(() => void refreshBracket(), Math.max(pollIntervalMs, 15_000));
    return () => window.clearInterval(timer);
  }, [organizationAlias, tournamentAlias, bracketStage, presentation, pollIntervalMs]);
  const visibleBracket = bracketData?.stageNumber === bracketStage ? bracketData : undefined;
  // The match's own clock when it has one; otherwise the wall clock of a tournament still being
  // played. A finished tournament carries a date instead, below.
  const displayedClock =
    spotlightMatch?.clockSeconds !== undefined
      ? formatClock(spotlightMatch.clockSeconds)
      : allFinal
        ? ''
        : currentTime;
  const showsWallClock =
    spotlightMatch?.clockSeconds === undefined && !allFinal && currentTime !== '';
  const finishedText =
    allFinal && lastMatchAt !== undefined
      ? applyTemplate(dashboardLabels.finishedOn, {
          date: formatTimestamp(lastMatchAt, { locale: language, format: 'date-long', timeZone }),
        })
      : undefined;

  /*
   * A lower third is a strip, not a scene: it names the two sides, their score
   * and the match state, and leaves the rest of the frame to the footage it is
   * composited over. Everything the kiosk shows around that — the rotating
   * rail, the standings, the champion recap — belongs to a full-frame
   * presentation, not over someone's camera.
   */
  const onAlertConsumed = (eventId: string): void => {
    setAlertQueue((current) => current.filter((item) => item.event.eventId !== eventId));
  };
  const broadcastAlertBanner = showBroadcastAlerts ? (
    <BroadcastAlertBanner
      awayLabel={labels.awaySide}
      homeLabel={labels.homeSide}
      onConsumed={onAlertConsumed}
      prefersReducedMotion={prefersReducedMotion}
      queue={alertQueue}
    />
  ) : null;

  const fixedView = initialView !== undefined;
  const labelStage = (ref: PinnedMatchRef | undefined): string =>
    ref === undefined ? '' : `${ref.stageNumber} · ${ref.ordinal}`;

  if (presentation === 'lower') {
    return (
      <div className="tv-root-container tv-lower-third" data-testid="tv-lower-third">
        {broadcastAlertBanner}
        {spotlightMatch ? (
          <div className="tv-lower-third__bug cl-chamfer">
            <span className={`tv-lower-third__state tv-lower-third__state--${statusBadge.type}`}>
              {statusBadge.label}
            </span>
            <span className="tv-lower-third__side">
              {spotlightMatch.sides[0]?.abbreviation ?? spotlightMatch.sides[0]?.name ?? 'Local'}
            </span>
            <span className="tv-lower-third__score">
              {spotlightMatch.sides[0]?.score ?? 0}
              <span className="tv-lower-third__score-sep">:</span>
              {spotlightMatch.sides[1]?.score ?? 0}
            </span>
            <span className="tv-lower-third__side">
              {spotlightMatch.sides[1]?.abbreviation ??
                spotlightMatch.sides[1]?.name ??
                'Visitante'}
            </span>
            {displayedClock && (
              <span
                className="tv-lower-third__clock"
                data-time={displayedClock}
                aria-label={displayedClock}
              />
            )}
            <TvMatchIndicators
              match={spotlightMatch}
              possessionLabel={dashboardLabels.possession}
              penaltyLabel={dashboardLabels.penalty}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="tv-root-container">
      {broadcastAlertBanner}
      {/* 1. Persistent Score-Bug / Status Bar */}
      {!isOverlay && (
        <header className="tv-scorebug cl-chamfer">
          <div className="tv-scorebug__left">
            {resolvedBranding.logoUrl ? (
              <img
                alt=""
                aria-hidden="true"
                className="tv-scorebug__brand-logo"
                src={resolvedBranding.logoUrl}
              />
            ) : (
              <img
                alt="CopaLibre"
                className="tv-scorebug__brand-logo"
                height="32"
                src="/copalibre-logo.svg"
                width="32"
              />
            )}
            <div className="tv-scorebug__titles">
              <span className="tv-scorebug__tournament">{tournamentName ?? 'Torneo Oficial'}</span>
              <span className="tv-scorebug__org">{organizationName ?? 'CopaLibre Broadcast'}</span>
            </div>
          </div>

          <div className="tv-scorebug__right">
            <TvMatchIndicators
              match={spotlightMatch}
              possessionLabel={dashboardLabels.possession}
              penaltyLabel={dashboardLabels.penalty}
            />
            <div
              className={`tv-scorebug__badge tv-scorebug__badge--${statusBadge.type} cl-chamfer`}
            >
              <span className="tv-scorebug__dot" />
              <span>{statusBadge.label}</span>
            </div>
            {showsWallClock && (
              <span className="tv-scorebug__clock-label">{dashboardLabels.clockLabel}</span>
            )}
            {displayedClock && (
              <span
                className="tv-scorebug__clock"
                data-time={displayedClock}
                aria-label={
                  showsWallClock
                    ? `${dashboardLabels.clockLabel} ${displayedClock}`
                    : displayedClock
                }
              />
            )}
            {finishedText !== undefined && (
              <span
                className="tv-scorebug__clock"
                data-time={finishedText}
                aria-label={finishedText}
              />
            )}
          </div>
        </header>
      )}

      {/* 2. Main Stage (Dominant Focal Panel + Secondary Rotating Rail) */}
      <main className={fixedView ? 'tv-main-stage tv-main-stage--single' : 'tv-main-stage'}>
        {/* DOMINANT FOCAL PANEL */}
        {!fixedView && (
          <section
            aria-label={dashboardLabels.focalPanelLabel}
            className="tv-focal-panel cl-chamfer"
          >
            <div className="tv-focal-panel__header">
              <span className="tv-focal-panel__label">
                {showRecap ? 'Recapitulativo de Campeonato' : 'Foco del Encuentro'}
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
                  <TvEmblem
                    alt={champion.name}
                    className="tv-champion__emblem"
                    fallback={
                      <div className="tv-champion__monogram">
                        {champion.abbreviation ?? champion.name.substring(0, 2).toUpperCase()}
                      </div>
                    }
                    src={champion.emblemUrl}
                  />
                </div>
                <h2 className="tv-champion__name">{champion.name}</h2>
                {champion.record && <p className="tv-champion__record">{champion.record}</p>}
              </div>
            ) : spotlightMatch ? (
              /* Spotlight Match Presentation */
              <div className="tv-match-spotlight" data-testid="tv-match-spotlight">
                <div className="tv-match-spotlight__stage">
                  Etapa {spotlightMatch.stageNumber} · Partido{' '}
                  {spotlightMatch.stageOrdinal ?? spotlightMatch.matchNumber}
                </div>
                <div className="tv-match-spotlight__vs-grid">
                  {/* Home Side — the spotlight's visual anchor */}
                  <TvTeamSide
                    anchor
                    clubs={clubs}
                    name={spotlightMatch.sides[0]?.name ?? 'Local'}
                    abbreviation={spotlightMatch.sides[0]?.abbreviation}
                  />

                  {/* Score Center */}
                  <div className="tv-score-center">
                    <div className="tv-score-center__digits">
                      {spotlightMatch.sides[0]?.score ?? 0} : {spotlightMatch.sides[1]?.score ?? 0}
                    </div>
                    <div
                      className="cl-chamfer"
                      style={{
                        padding: '0.4vmin 1.4vmin',
                        background: 'var(--tv-bg-elevated)',
                        border: `1px solid ${tvStateColor(spotlightMatch.state)}`,
                        fontFamily: 'var(--cl-font-mono)',
                        fontSize:
                          'clamp(var(--cl-font-size-xs), 1.4vmin, var(--cl-font-size-base))',
                        color: tvStateColor(spotlightMatch.state),
                        textTransform: 'uppercase',
                      }}
                    >
                      {presentState(spotlightMatch.state, dashboardLabels.resultState).label}
                    </div>
                  </div>

                  {/* Away Side */}
                  <TvTeamSide
                    clubs={clubs}
                    name={spotlightMatch.sides[1]?.name ?? 'Visitante'}
                    abbreviation={spotlightMatch.sides[1]?.abbreviation}
                  />
                </div>

                {matchEvents && matchEvents.length > 0 ? (
                  <TvEventTicker
                    ariaLabel={dashboardLabels.matchEventsLabel}
                    awayLabel={labels.awaySide}
                    events={matchEvents}
                    homeLabel={labels.homeSide}
                    language={language}
                  />
                ) : null}
              </div>
            ) : pinnedMissing ? (
              <div className="tv-champion" data-testid="tv-match-not-found">
                <h2 className="tv-champion__name">{dashboardLabels.matchNotFound}</h2>
                <p className="tv-champion__record">
                  {tournamentName} · {labelStage(pinnedRef)}
                </p>
              </div>
            ) : (
              <div className="tv-champion">
                <h2 className="tv-champion__name">{tournamentName}</h2>
                <p className="tv-champion__record">{dashboardLabels.noMatchesScheduled}</p>
              </div>
            )}
          </section>
        )}

        {/* SECONDARY ROTATING RAIL */}
        {!isOverlay && (
          <aside
            aria-label={dashboardLabels.statsAndTablesLabel}
            className="tv-rail-panel cl-chamfer"
          >
            {/* Navigation Tabs: a fixed view is that one section, so there is nothing to choose between. */}
            {!fixedView && (
              <nav aria-label={dashboardLabels.sidebarSectionsLabel} className="tv-rail-nav">
                <TvRailTab
                  active={activeTab === 'standings'}
                  label={dashboardLabels.standingsTab}
                  onClick={() => setActiveTab('standings')}
                />
                <TvRailTab
                  active={activeTab === 'performers'}
                  label={dashboardLabels.performersTab}
                  onClick={() => setActiveTab('performers')}
                />
                <TvRailTab
                  active={activeTab === 'facts'}
                  label={dashboardLabels.statisticsTab}
                  onClick={() => setActiveTab('facts')}
                />
                {visibleBracket && visibleBracket.zones.length > 0 && (
                  <TvRailTab
                    active={activeTab === 'bracket'}
                    label={dashboardLabels.bracketTab}
                    onClick={() => setActiveTab('bracket')}
                  />
                )}
                {matchPages.length > 0 && (
                  <TvRailTab
                    active={activeTab === 'fixtures'}
                    label={dashboardLabels.fixturesTab}
                    onClick={() => setActiveTab('fixtures')}
                  />
                )}
              </nav>
            )}

            {/* Tab Content */}
            <div className="tv-rail-content" data-testid="tv-rail-content">
              {activeTab === 'standings' && (
                <TvStandingsTable
                  clubs={clubs}
                  dashboardLabels={dashboardLabels}
                  pointsShortLabel={labels.pointsShort}
                  standings={standings}
                />
              )}

              {activeTab === 'performers' && (
                <TvPerformersView
                  noTopPerformersLabel={dashboardLabels.noTopPerformers}
                  performers={performers}
                />
              )}

              {activeTab === 'facts' && <TvFactsView facts={facts} />}
              {activeTab === 'bracket' && visibleBracket && (
                <TvBracketView labels={dashboardLabels} zones={visibleBracket.zones} />
              )}
              {activeTab === 'fixtures' && matchPages.length > 0 && (
                <TvMatchList labels={dashboardLabels} page={rail.page} pages={matchPages} />
              )}
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
