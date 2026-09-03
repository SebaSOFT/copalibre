import { useEffect, useState } from 'react';
import { RealtimeClient } from '@copalibre/realtime';
import { EntrantName } from './EntrantName.js';
import {
  applyEvent,
  markConnected,
  type LiveDashboard,
  type LiveMatch,
} from '../lib/live-state.js';
import { presentState, type ResultStateLabels } from '../lib/result-state.js';
import { resolveTvBranding, tvStateColor, type TvBranding } from '../lib/tv-branding.js';

export interface TvClubItem {
  readonly name: string;
  readonly emblemObjectId?: string;
}

/**
 * The `/tv/**` kiosk and overlay surface.
 *
 * Unlike `LiveMatchHero`, this renders no "showing last known state" banner
 * and no reconnect/error UI of any kind — the design decision is explicit:
 * "this surface's UI layer never renders the recoverable-error state... it
 * only ever shows last known good projection while retrying underneath."
 * There is nobody at the venue to dismiss a message.
 *
 * The display token and `?mode=overlay` are read from the URL on mount
 * rather than passed as build-time props, because this page is statically
 * generated and the query string only exists at request time in the
 * browser. Neither is ever appended back onto the stream URL: the token goes
 * out only as an `Authorization` header (`display-token-auth.guard.ts`
 * rejects a `token` query parameter outright), matching the one-time
 * provisioning-link exception this repeats nowhere else.
 */
export interface TvDashboardProps {
  readonly initial: LiveDashboard;
  readonly streamPath: string;
  /** Set on the pinned-match route; the full-rotation route leaves this unset. */
  readonly pinnedMatchNumber?: number;
  readonly branding?: TvBranding;
  readonly tournamentName?: string;
  readonly organizationName?: string;
  readonly clubs?: readonly TvClubItem[];
}

export function TvDashboard({
  initial,
  streamPath,
  pinnedMatchNumber,
  branding,
  tournamentName,
  organizationName,
  clubs,
}: TvDashboardProps): React.JSX.Element {
  const [dashboard, setDashboard] = useState(initial);
  const resolvedBranding = resolveTvBranding(branding ?? {});

  useEffect(() => {
    const overlay = new URLSearchParams(window.location.search).get('mode') === 'overlay';
    document.body.classList.toggle('tv-overlay', overlay);
    return () => document.body.classList.remove('tv-overlay');
  }, []);

  useEffect(() => {
    // Read once per connection attempt rather than cached in a variable that
    // outlives it: a revoked-and-reissued token never requires this tab to
    // navigate, only for its launch URL to be updated on next power-cycle.
    const token = () => new URLSearchParams(window.location.search).get('token') ?? undefined;
    const client = new RealtimeClient({
      url: streamPath,
      accessToken: () => token(),
      heartbeatTimeoutMs: 30_000,
    });
    void client.connect({
      onOpen: () => setDashboard((current) => markConnected(current)),
      onEvent: (event) => setDashboard((current) => applyEvent(current, event)),
      // The replay window passed; reloading in place is the silent recovery
      // path — there is no banner offering a person a "click to refresh".
      onProjectionRequired: () => globalThis.location?.reload(),
      // No onFailure: the client already retries with backoff underneath;
      // this surface has nothing to say about a failure it is still handling.
    });
    return () => client.close();
  }, [streamPath]);

  const pinnedMatch =
    pinnedMatchNumber === undefined
      ? undefined
      : dashboard.matches.find((match) => match.matchNumber === pinnedMatchNumber);

  const matches =
    pinnedMatchNumber === undefined ? dashboard.matches : pinnedMatch ? [pinnedMatch] : [];

  const nearbyMatches =
    pinnedMatchNumber !== undefined
      ? dashboard.matches.filter((match) => match.matchNumber !== pinnedMatchNumber)
      : [];

  if (matches.length === 0) {
    return (
      <div
        className="tv-dashboard"
        style={
          resolvedBranding.accentColor
            ? ({ '--tv-accent': resolvedBranding.accentColor } as React.CSSProperties)
            : undefined
        }
      >
        <TvStandbyFallback
          branding={resolvedBranding}
          clubs={clubs}
          organizationName={organizationName}
          tournamentName={tournamentName}
        />
      </div>
    );
  }

  return (
    <div
      className="tv-dashboard"
      style={
        resolvedBranding.accentColor
          ? ({ '--tv-accent': resolvedBranding.accentColor } as React.CSSProperties)
          : undefined
      }
    >
      {resolvedBranding.logoUrl && (
        <img
          className="tv-dashboard__logo"
          src={resolvedBranding.logoUrl}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className="tv-dashboard__matches">
        {matches.map((match) => (
          <TvMatchCard
            isSpotlight={pinnedMatchNumber !== undefined}
            key={match.matchId}
            match={match}
          />
        ))}
      </div>
      {nearbyMatches.length > 0 && (
        <div className="tv-nearby">
          <span className="tv-nearby__title">Otros partidos de la fecha</span>
          <div className="tv-nearby__list">
            {nearbyMatches.map((match) => (
              <TvMatchCard key={match.matchId} match={match} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TvStandbyFallback({
  branding,
  tournamentName,
  organizationName,
  clubs,
}: {
  readonly branding: TvBranding;
  readonly tournamentName?: string;
  readonly organizationName?: string;
  readonly clubs?: readonly TvClubItem[];
}): React.JSX.Element {
  const displayClubs = clubs && clubs.length > 0 ? clubs.concat(clubs) : [];

  return (
    <div className="tv-standby">
      <div className="tv-standby__glow" />
      <div className="tv-standby__content">
        <div className="tv-standby__badge">
          <span className="tv-standby__dot" />
          <span>Circuito TV en vivo · Esperando encuentro</span>
        </div>
        <div className="tv-standby__brand">
          {branding.logoUrl ? (
            <img
              alt={organizationName ?? ''}
              className="tv-standby__org-logo"
              src={branding.logoUrl}
            />
          ) : (
            <div className="tv-standby__copalibre-emblem">
              <img alt="CopaLibre" height="120" src="/copalibre-logo.svg" width="120" />
            </div>
          )}
          <h1 className="tv-standby__tournament">{tournamentName ?? 'Torneo Oficial'}</h1>
          {organizationName && <p className="tv-standby__organization">{organizationName}</p>}
        </div>
        {displayClubs.length > 0 && (
          <div className="tv-standby__carousel-wrap">
            <p className="tv-standby__carousel-title">Clubes participantes</p>
            <div className="tv-standby__carousel">
              <div className="tv-standby__track">
                {displayClubs.map((club, idx) => (
                  <div className="tv-standby__club-pill" key={`${club.name}-${idx}`}>
                    {club.emblemObjectId ? (
                      <img
                        alt=""
                        className="tv-standby__club-img"
                        src={`/api/objects/${club.emblemObjectId}`}
                      />
                    ) : (
                      <span className="tv-standby__club-avatar">
                        {club.name.substring(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="tv-standby__club-name">{club.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Not localized: `/tv/**` is a non-SEO surface the architecture doc
 * explicitly allows "a simpler locale mechanism" than public-web's URL
 * prefixing — out of scope for this change, same boundary as `/control/**`.
 * Kept as the pre-existing Spanish text rather than switched to English, so
 * this surface's appearance does not change as a side effect of this file
 * merely needing to keep compiling against `presentState`'s new signature.
 */
const TV_RESULT_STATE_LABELS: ResultStateLabels = {
  live: 'EN VIVO',
  upcoming: 'PROGRAMADO',
  final: 'FINAL',
  disputed: 'EN DISPUTA',
  winner: 'GANÓ',
  loser: 'PERDIÓ',
  tbd: 'A DEFINIR',
  cancelled: 'CANCELADO',
};

function TvMatchCard({
  match,
  isSpotlight = false,
}: {
  readonly match: LiveMatch;
  readonly isSpotlight?: boolean;
}): React.JSX.Element {
  const badge = presentState(match.state, TV_RESULT_STATE_LABELS);
  return (
    <article
      className={`tv-match${isSpotlight ? ' tv-match--spotlight' : ''}`}
      style={{ borderInlineStartColor: tvStateColor(match.state) }}
    >
      <div className="tv-match__badge">
        <span aria-hidden="true">{badge.icon}</span>
        <span>{badge.label}</span>
      </div>
      <div className="tv-match__sides">
        {match.sides.map((side) => (
          <div className="tv-match__side" key={side.entrantId}>
            <EntrantName
              abbreviation={side.abbreviation}
              className="tv-match__name"
              fullName={side.name}
            />
            <span className="tv-match__score">{side.score}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
