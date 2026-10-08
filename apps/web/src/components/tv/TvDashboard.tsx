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
import { formatClock } from '../../lib/matches-view.js';
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
import type { TvClubItem, TvDashboardLabels } from './tv-types.js';
import type { TvMatchEvent } from '../../lib/tv-match-events.js';
import { mapBracketResponse } from '../../lib/bracket-projection.js';
import type { BracketZone } from '../../lib/bracket-projection.js';
import { bracketZonesOf, leagueZonesOf } from '../../lib/bracket.js';
import type { PublicBracketResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { TvMatchIndicators } from './ui/organisms/TvMatchIndicators.js';
import { TvBracketView } from './ui/organisms/TvBracketView.js';
import { TvLeagueFixtures } from './ui/organisms/TvLeagueFixtures.js';
import { TvEmblem } from './ui/atoms/TvEmblem.js';

export type { TvClubItem, TvDashboardLabels } from './tv-types.js';

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
  /** Set on the pinned-match route; the full-rotation route leaves this unset. */
  readonly pinnedMatchNumber?: number;
  /** Keeps a launcher-selected TV tab fixed instead of entering carousel rotation. */
  readonly initialView?: 'standings' | 'fixtures';
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
    /** Zones playing a league beside them: listed by round. Absent for a stage without any. */
    readonly leagueZones?: readonly BracketZone[];
  };
  readonly branding?: TvBranding;
  readonly tournamentName?: string;
  readonly organizationName?: string;
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly clubs?: readonly TvClubItem[];
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
  pinnedMatchNumber,
  matchEvents,
  rosterActors,
  initialBracket,
  branding,
  tournamentName,
  organizationName,
  organizationAlias,
  tournamentAlias,
  clubs,
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
  const [activeTab, setActiveTab] = useState<
    'standings' | 'performers' | 'facts' | 'bracket' | 'fixtures'
  >(initialView ?? 'standings');
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

  // 1. Digital Clock (JetBrains Mono formatting)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString(language, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [language]);

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
        `/api/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/live`,
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
          pinnedMatchNumber === undefined
            ? undefined
            : dashboardRef.current.matches.find((m) => m.matchNumber === pinnedMatchNumber);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnecting SSE on every render of a prop that changes is worse than a stale closure here: pinnedMatchNumber/rosterActors/showBroadcastAlerts are server-supplied once at mount (same treatment matchEvents itself already gets), and eventLabelsByCode only grows from the same static matchEvents.
  }, [streamPath, refreshProjection, presentation]);

  // 5. Automatic Carousel Rotation (respects prefers-reduced-motion)
  useEffect(() => {
    if (prefersReducedMotion || initialView) return;
    const interval = setInterval(() => {
      setActiveTab((current) => {
        if (current === 'standings') return 'performers';
        if (current === 'performers') return 'facts';
        // The bracket and the league fixtures join the rotation only for a stage that has them.
        if (current === 'facts' && bracketData?.zones.length) return 'bracket';
        if (current === 'facts' && bracketData?.leagueZones?.length) return 'fixtures';
        if (current === 'bracket' && bracketData?.leagueZones?.length) return 'fixtures';
        return 'standings';
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [prefersReducedMotion, bracketData, initialView]);

  // 6. Data Computations
  const matches = dashboard.matches;
  const pinnedMatch =
    pinnedMatchNumber === undefined
      ? undefined
      : matches.find((m) => m.matchNumber === pinnedMatchNumber);

  const liveMatches = matches.filter((m) => m.state === 'live');
  const allFinal = matches.length > 0 && matches.every((m) => m.state === 'final');
  const isLive = liveMatches.length > 0;

  const champion: ChampionInfo | undefined = resolveChampion(labels, matches, standings, clubs);
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
  const spotlightMatch = pinnedMatch ?? liveMatches[0] ?? matches[0];
  const bracketStage = spotlightMatch?.stageNumber;
  useEffect(() => {
    if (presentation === 'lower' || !organizationAlias || !tournamentAlias || !bracketStage) return;
    const refreshBracket = async () => {
      try {
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${bracketStage}/bracket`,
        );
        if (!response.ok) return;
        const mapped = mapBracketResponse((await response.json()) as PublicBracketResponse);
        const zones = bracketZonesOf(mapped);
        const leagueZones = leagueZonesOf(mapped);
        setBracketData(
          zones.length > 0 || leagueZones.length > 0
            ? {
                stageNumber: bracketStage,
                zones,
                ...(leagueZones.length > 0 ? { leagueZones } : {}),
              }
            : undefined,
        );
      } catch {
        // The other TV sections retain their last-known projection.
      }
    };
    void refreshBracket();
    const timer = window.setInterval(() => void refreshBracket(), Math.max(pollIntervalMs, 15_000));
    return () => window.clearInterval(timer);
  }, [organizationAlias, tournamentAlias, bracketStage, presentation, pollIntervalMs]);
  const visibleBracket = bracketData?.stageNumber === bracketStage ? bracketData : undefined;
  const displayedClock =
    spotlightMatch?.clockSeconds !== undefined
      ? formatClock(spotlightMatch.clockSeconds)
      : currentTime;

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
            {displayedClock && (
              <span
                className="tv-scorebug__clock"
                data-time={displayedClock}
                aria-label={displayedClock}
              />
            )}
          </div>
        </header>
      )}

      {/* 2. Main Stage (Dominant Focal Panel + Secondary Rotating Rail) */}
      <main className="tv-main-stage">
        {/* DOMINANT FOCAL PANEL */}
        <section aria-label={dashboardLabels.focalPanelLabel} className="tv-focal-panel cl-chamfer">
          <div className="tv-focal-panel__header">
            <span className="tv-focal-panel__label">
              {allFinal && champion ? 'Recapitulativo de Campeonato' : 'Foco del Encuentro'}
            </span>
          </div>

          {allFinal && champion ? (
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
                Etapa {spotlightMatch.stageNumber} · Partido {spotlightMatch.matchNumber}
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
                      fontSize: 'clamp(var(--cl-font-size-xs), 1.4vmin, var(--cl-font-size-base))',
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
          ) : (
            <div className="tv-champion">
              <h2 className="tv-champion__name">{tournamentName}</h2>
              <p className="tv-champion__record">{dashboardLabels.noMatchesScheduled}</p>
            </div>
          )}
        </section>

        {/* SECONDARY ROTATING RAIL */}
        {!isOverlay && (
          <aside
            aria-label={dashboardLabels.statsAndTablesLabel}
            className="tv-rail-panel cl-chamfer"
          >
            {/* Navigation Tabs */}
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
              {visibleBracket?.leagueZones && (
                <TvRailTab
                  active={activeTab === 'fixtures'}
                  label={dashboardLabels.fixturesTab}
                  onClick={() => setActiveTab('fixtures')}
                />
              )}
            </nav>

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
              {activeTab === 'fixtures' && visibleBracket?.leagueZones && (
                <TvLeagueFixtures labels={dashboardLabels} zones={visibleBracket.leagueZones} />
              )}
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
