import { useEffect, useState, useCallback } from 'react';
import { RealtimeClient } from '@copalibre/realtime';
import { applyEvent, markConnected, type LiveDashboard } from '../lib/live-state.js';
import { presentState, type ResultStateLabels } from '../lib/result-state.js';
import { resolveTvBranding, tvStateColor, type TvBranding } from '../lib/tv-branding.js';
import type { StandingsRowView } from '../lib/overview.js';
import {
  deriveTopPerformers,
  deriveTournamentFacts,
  resolveChampion,
  type TopPerformer,
  type TournamentFact,
  type ChampionInfo,
} from '../lib/tv-statistics.js';

export interface TvClubItem {
  readonly name: string;
  readonly emblemObjectId?: string;
}

export interface TvDashboardProps {
  readonly initial: LiveDashboard;
  readonly streamPath: string;
  /** Set on the pinned-match route; the full-rotation route leaves this unset. */
  readonly pinnedMatchNumber?: number;
  readonly branding?: TvBranding;
  readonly tournamentName?: string;
  readonly organizationName?: string;
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly clubs?: readonly TvClubItem[];
  readonly standings?: readonly StandingsRowView[];
  readonly topPerformers?: readonly TopPerformer[];
  readonly pollIntervalMs?: number;
}

const TV_RESULT_STATE_LABELS: ResultStateLabels = {
  live: 'EN VIVO',
  upcoming: 'PROGRAMADO',
  final: 'FINALIZADO',
  disputed: 'EN DISPUTA',
  winner: 'GANÓ',
  loser: 'PERDIÓ',
  tbd: 'A DEFINIR',
  cancelled: 'CANCELADO',
};

export function TvDashboard({
  initial,
  streamPath,
  pinnedMatchNumber,
  branding,
  tournamentName,
  organizationName,
  organizationAlias,
  tournamentAlias,
  clubs,
  standings,
  topPerformers: initialTopPerformers,
  pollIntervalMs = 15_000,
}: TvDashboardProps): React.JSX.Element {
  const [dashboard, setDashboard] = useState<LiveDashboard>(initial);
  const [activeTab, setActiveTab] = useState<'standings' | 'performers' | 'facts'>('standings');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const resolvedBranding = resolveTvBranding(branding ?? {});

  // 1. Digital Clock (JetBrains Mono formatting)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Motion Preference Listener
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener?.('change', handler);
    return () => mediaQuery.removeEventListener?.('change', handler);
  }, []);

  // 3. Polling Refresh Handler (Fallback when tokenless or projection out of sync)
  const refreshProjection = useCallback(async () => {
    if (!organizationAlias || !tournamentAlias) return;
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
        }
      }
    } catch {
      // Degrade silently; do not reload page
    }
  }, [organizationAlias, tournamentAlias]);

  // 4. Realtime SSE Connection with Graceful Degradation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = new URLSearchParams(window.location.search).get('token');

    // Case A: No token present in URL. Run polling fallback only, NEVER call RealtimeClient to avoid 401 loop
    if (!token) {
      if (pollIntervalMs > 0) {
        const pollTimer = setInterval(() => {
          void refreshProjection();
        }, pollIntervalMs);
        return () => clearInterval(pollTimer);
      }
      return;
    }

    // Case B: Token is present. Layer SSE client on top
    const client = new RealtimeClient({
      url: streamPath,
      accessToken: () => token,
      heartbeatTimeoutMs: 30_000,
    });

    void client.connect({
      onOpen: () => setDashboard((current) => markConnected(current)),
      onEvent: (event) => setDashboard((current) => applyEvent(current, event)),
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
  }, [streamPath, refreshProjection, pollIntervalMs]);

  // 5. Automatic Carousel Rotation (respects prefers-reduced-motion)
  useEffect(() => {
    if (prefersReducedMotion) return;
    const interval = setInterval(() => {
      setActiveTab((current) => {
        if (current === 'standings') return 'performers';
        if (current === 'performers') return 'facts';
        return 'standings';
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  // 6. Data Computations
  const matches = dashboard.matches;
  const pinnedMatch =
    pinnedMatchNumber === undefined
      ? undefined
      : matches.find((m) => m.matchNumber === pinnedMatchNumber);

  const liveMatches = matches.filter((m) => m.state === 'live');
  const allFinal = matches.length > 0 && matches.every((m) => m.state === 'final');
  const isLive = liveMatches.length > 0;

  const champion: ChampionInfo | undefined = resolveChampion(matches, standings, clubs);
  const performers: readonly TopPerformer[] =
    initialTopPerformers && initialTopPerformers.length > 0
      ? initialTopPerformers
      : deriveTopPerformers(undefined, standings, clubs);
  const facts: readonly TournamentFact[] = deriveTournamentFacts(matches);

  // Status Badge Determination
  const statusBadge = isLive
    ? { label: 'EN VIVO', type: 'live' }
    : allFinal
      ? { label: 'TORNEO FINALIZADO', type: 'final' }
      : { label: 'PROGRAMADO', type: 'upcoming' };

  // Spotlight Match (pinned match or active live match or first match)
  const spotlightMatch = pinnedMatch ?? liveMatches[0] ?? matches[0];

  return (
    <div className="tv-root-container">
      {/* 1. Persistent Score-Bug / Status Bar */}
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
          <div className={`tv-scorebug__badge tv-scorebug__badge--${statusBadge.type} cl-chamfer`}>
            <span className="tv-scorebug__dot" />
            <span>{statusBadge.label}</span>
          </div>
          {currentTime && <span className="tv-scorebug__clock">{currentTime}</span>}
        </div>
      </header>

      {/* 2. Main Stage (Dominant Focal Panel + Secondary Rotating Rail) */}
      <main className="tv-main-stage">
        {/* DOMINANT FOCAL PANEL */}
        <section aria-label="Panel Principal de Transmisión" className="tv-focal-panel cl-chamfer">
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
                {champion.emblemObjectId ? (
                  <img
                    alt={champion.name}
                    className="tv-champion__emblem"
                    src={`/api/objects/${champion.emblemObjectId}`}
                  />
                ) : (
                  <div className="tv-champion__monogram">
                    {champion.abbreviation ?? champion.name.substring(0, 2).toUpperCase()}
                  </div>
                )}
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
                {/* Home Side */}
                <TvTeamSide
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
                      fontSize: 'clamp(0.75rem, 1.4vmin, 1rem)',
                      color: tvStateColor(spotlightMatch.state),
                      textTransform: 'uppercase',
                    }}
                  >
                    {presentState(spotlightMatch.state, TV_RESULT_STATE_LABELS).label}
                  </div>
                </div>

                {/* Away Side */}
                <TvTeamSide
                  clubs={clubs}
                  name={spotlightMatch.sides[1]?.name ?? 'Visitante'}
                  abbreviation={spotlightMatch.sides[1]?.abbreviation}
                />
              </div>
            </div>
          ) : (
            <div className="tv-champion">
              <h2 className="tv-champion__name">{tournamentName}</h2>
              <p className="tv-champion__record">Sin encuentros programados actualmente</p>
            </div>
          )}
        </section>

        {/* SECONDARY ROTATING RAIL */}
        <aside aria-label="Estadísticas y Tablas del Torneo" className="tv-rail-panel cl-chamfer">
          {/* Navigation Tabs */}
          <nav aria-label="Secciones del panel lateral" className="tv-rail-nav">
            <button
              className={`tv-rail-tab cl-chamfer ${activeTab === 'standings' ? 'tv-rail-tab--active' : ''}`}
              onClick={() => setActiveTab('standings')}
              type="button"
            >
              Posiciones
            </button>
            <button
              className={`tv-rail-tab cl-chamfer ${activeTab === 'performers' ? 'tv-rail-tab--active' : ''}`}
              onClick={() => setActiveTab('performers')}
              type="button"
            >
              Destacados
            </button>
            <button
              className={`tv-rail-tab cl-chamfer ${activeTab === 'facts' ? 'tv-rail-tab--active' : ''}`}
              onClick={() => setActiveTab('facts')}
              type="button"
            >
              Estadísticas
            </button>
          </nav>

          {/* Tab Content */}
          <div className="tv-rail-content" data-testid="tv-rail-content">
            {activeTab === 'standings' && <TvStandingsView clubs={clubs} standings={standings} />}

            {activeTab === 'performers' && <TvPerformersView performers={performers} />}

            {activeTab === 'facts' && <TvFactsView facts={facts} />}
          </div>
        </aside>
      </main>
    </div>
  );
}

function TvTeamSide({
  name,
  abbreviation,
  clubs,
}: {
  readonly name: string;
  readonly abbreviation?: string;
  readonly clubs?: readonly TvClubItem[];
}): React.JSX.Element {
  const club = clubs?.find((c) => c.name.toLowerCase() === name.toLowerCase());

  return (
    <div className="tv-team-side">
      <div className="tv-team-side__emblem-wrap">
        {club?.emblemObjectId ? (
          <img
            alt={name}
            className="tv-team-side__emblem"
            src={`/api/objects/${club.emblemObjectId}`}
          />
        ) : (
          <div className="tv-team-side__monogram">
            {abbreviation ?? name.substring(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <span className="tv-team-side__name">{name}</span>
    </div>
  );
}

function TvStandingsView({
  standings,
  clubs,
}: {
  readonly standings?: readonly StandingsRowView[];
  readonly clubs?: readonly TvClubItem[];
}): React.JSX.Element {
  if (!standings || standings.length === 0) {
    return (
      <div style={{ padding: '2vmin', color: 'var(--tv-text-secondary)', textAlign: 'center' }}>
        Tabla de posiciones no disponible
      </div>
    );
  }

  return (
    <table className="tv-standings-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Club</th>
          <th>PJ</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {standings.slice(0, 8).map((row) => {
          const club = clubs?.find((c) => c.name.toLowerCase() === row.name.toLowerCase());
          return (
            <tr key={row.name}>
              <td>{row.position}</td>
              <td>
                <div className="tv-table-club-cell">
                  {club?.emblemObjectId ? (
                    <img
                      alt=""
                      className="tv-table-club-emblem"
                      src={`/api/objects/${club.emblemObjectId}`}
                    />
                  ) : (
                    <span className="tv-table-club-monogram">
                      {row.abbreviation ?? row.name.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span>{row.name}</span>
                </div>
              </td>
              <td>{row.played}</td>
              <td>{row.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TvPerformersView({
  performers,
}: {
  readonly performers: readonly TopPerformer[];
}): React.JSX.Element {
  if (performers.length === 0) {
    return (
      <div style={{ padding: '2vmin', color: 'var(--tv-text-secondary)', textAlign: 'center' }}>
        Sin figuras destacadas registradas
      </div>
    );
  }

  return (
    <div className="tv-performers-list">
      {performers.map((p) => (
        <article className="tv-performer-card cl-chamfer" key={`${p.rank}-${p.name}`}>
          <div className="tv-performer-card__left">
            <span className="tv-performer-card__rank">#{p.rank}</span>
            {p.clubEmblemObjectId ? (
              <img
                alt=""
                className="tv-table-club-emblem"
                src={`/api/objects/${p.clubEmblemObjectId}`}
              />
            ) : null}
            <div className="tv-performer-card__info">
              <span className="tv-performer-card__name">{p.name}</span>
              {p.clubName && <span className="tv-performer-card__club">{p.clubName}</span>}
            </div>
          </div>
          <span className="tv-performer-card__score">
            {p.statValue}{' '}
            <small style={{ fontSize: '0.9rem', color: 'var(--tv-text-secondary)' }}>
              {p.statLabel}
            </small>
          </span>
        </article>
      ))}
    </div>
  );
}

function TvFactsView({ facts }: { readonly facts: readonly TournamentFact[] }): React.JSX.Element {
  return (
    <div className="tv-facts-grid">
      {facts.map((fact) => (
        <div className="tv-fact-tile cl-chamfer" key={fact.label}>
          <span className="tv-fact-tile__label">{fact.label}</span>
          <span className="tv-fact-tile__value">{fact.value}</span>
          {fact.detail && <span className="tv-fact-tile__detail">{fact.detail}</span>}
        </div>
      ))}
    </div>
  );
}
