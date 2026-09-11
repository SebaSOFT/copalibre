import { EntrantName } from '../atoms/EntrantName.js';
import { presentState } from '../../../lib/result-state.js';
import { seriesScore, seriesSegments, seriesPending, toSeriesInput } from '../../../lib/series.js';
import { applyTemplate, formatClock, type MatchCardData } from '../../../lib/matches-view.js';
import type { MatchCardLabels } from '../../../lib/i18n/public-intl.js';

/**
 * The matches-view card: one shared React component for both the public
 * site (mounted with `client:load`, the same way `EntrantName` already is)
 * and control-web (used natively, no hydration boundary). Every label
 * arrives pre-formatted via `labels` — the same constraint `LiveMatchHero`
 * already documents: this file must never import `react-intl`'s formatting
 * machinery itself, only accept already-resolved strings.
 */
export interface MatchCardProps {
  readonly match: MatchCardData;
  readonly labels: MatchCardLabels;
  /** Wraps the card in a link when present — the public site's report page. */
  readonly reportUrl?: string;
}

export function MatchCard({ match, labels, reportUrl }: MatchCardProps): React.JSX.Element {
  const badge = presentState(match.state, labels.state);
  const scopeLine = [match.zoneName, match.groupName]
    .filter((part) => part !== undefined)
    .join(' · ');
  const hasFullTrace =
    (match.homeTrace !== undefined && match.homeTrace.length > 0) ||
    (match.awayTrace !== undefined && match.awayTrace.length > 0);

  const body = (
    <article className="cl-card cl-chamfer cl-match-card" data-match={match.matchId}>
      <div className="cl-match-card__header">
        <span className="cl-badge">
          <span aria-hidden="true">{badge.icon}</span>
          <span>{badge.label}</span>
        </span>
        {match.clockSeconds !== undefined && (
          <span
            className="cl-match-card__clock"
            title={applyTemplate(labels.clockAriaLabel, { time: formatClock(match.clockSeconds) })}
          >
            {formatClock(match.clockSeconds)}
          </span>
        )}
      </div>

      <ol className="cl-match-card__sides">
        <li className="cl-match-card__side">
          <EntrantName fullName={match.homeName ?? 'TBD'} abbreviation={match.homeAbbreviation} />
          {match.homePosition !== undefined && (
            <span
              className="cl-badge cl-badge--rank"
              title={applyTemplate(labels.position, { position: match.homePosition })}
            >
              #{match.homePosition}
            </span>
          )}
          <span className="cl-stat-tile__value">{match.homeScore ?? '—'}</span>
        </li>
        <li className="cl-match-card__side">
          <EntrantName fullName={match.awayName ?? 'TBD'} abbreviation={match.awayAbbreviation} />
          {match.awayPosition !== undefined && (
            <span
              className="cl-badge cl-badge--rank"
              title={applyTemplate(labels.position, { position: match.awayPosition })}
            >
              #{match.awayPosition}
            </span>
          )}
          <span className="cl-stat-tile__value">{match.awayScore ?? '—'}</span>
        </li>
      </ol>

      {scopeLine !== '' && (
        <p
          className="cl-match-card__scope"
          title={applyTemplate(labels.zoneGroupAriaLabel, { scope: scopeLine })}
        >
          {scopeLine}
        </p>
      )}

      {match.venueName !== undefined && (
        <p
          className="cl-match-card__venue"
          title={applyTemplate(labels.venueAriaLabel, { venue: match.venueName })}
        >
          {match.venueName}
        </p>
      )}

      {match.latestEvent !== undefined && (
        <p
          className="cl-match-card__event"
          title={applyTemplate(labels.latestEventAriaLabel, { event: match.latestEvent.label })}
        >
          {match.latestEvent.label}
        </p>
      )}

      {match.series !== undefined && (
        <SeriesSummary
          series={match.series}
          labels={labels}
          homeName={match.homeName}
          awayName={match.awayName}
        />
      )}

      {match.decidingFactor !== undefined && (
        <p className="cl-match-card__deciding-factor" title={labels.decidedByAriaLabel}>
          {applyTemplate(labels.decidedBy, { factor: match.decidingFactor })}
        </p>
      )}

      {hasFullTrace && (
        <TracePanel homeTrace={match.homeTrace} awayTrace={match.awayTrace} labels={labels} />
      )}
    </article>
  );

  return reportUrl === undefined ? body : <a href={reportUrl}>{body}</a>;
}

/**
 * Score, decided-or-pending, and aggregate — the same facts
 * `SeriesStateBar.astro` states, minus its segment-by-segment dot row: that
 * visualization stays Astro-only (see `MatchNode.astro`) rather than being
 * reproduced here, a deliberate scope simplification for this shared card.
 */
function SeriesSummary({
  series,
  labels,
  homeName,
  awayName,
}: {
  readonly series: NonNullable<MatchCardData['series']>;
  readonly labels: MatchCardLabels;
  readonly homeName?: string;
  readonly awayName?: string;
}): React.JSX.Element {
  const input = toSeriesInput(series);
  const score = seriesScore(input);
  // Read, not rendered directly: segment count establishes the label reads
  // the same "how many are left" fact `SeriesStateBar` states, without this
  // card reproducing its dot-by-dot visualization.
  void seriesSegments(input);
  const pending = seriesPending(series);
  const winnerName =
    series.winner === 'home'
      ? (homeName ?? '1')
      : series.winner === 'away'
        ? (awayName ?? '2')
        : '';

  return (
    <div className="cl-match-card__series">
      <p
        className="cl-series__score"
        aria-label={applyTemplate(labels.seriesAriaLabel, {
          bestOf: input.bestOf,
          home: score.home,
          away: score.away,
        })}
        title={applyTemplate(labels.seriesAriaLabel, {
          bestOf: input.bestOf,
          home: score.home,
          away: score.away,
        })}
      >
        {score.home} — {score.away}
      </p>
      {pending ? (
        <p className="cl-series__pending">
          {applyTemplate(labels.seriesPending, { home: score.home, away: score.away })}
        </p>
      ) : (
        <p className="cl-series__decided">
          {applyTemplate(labels.seriesDecided, { winner: winnerName })}
        </p>
      )}
      {series.aggregateScores !== undefined && (
        <p className="cl-series__aggregate">
          {applyTemplate(labels.seriesAggregate, {
            home: series.aggregateScores[0] ?? 0,
            away: series.aggregateScores[1] ?? 0,
          })}
        </p>
      )}
    </div>
  );
}

/** Control-web only: the full internal comparator trace, verbatim. */
function TracePanel({
  homeTrace,
  awayTrace,
  labels,
}: {
  readonly homeTrace: readonly string[] | undefined;
  readonly awayTrace: readonly string[] | undefined;
  readonly labels: MatchCardLabels;
}): React.JSX.Element {
  return (
    <details className="cl-match-card__trace">
      <summary>{labels.fullTraceHeading}</summary>
      {homeTrace !== undefined && homeTrace.length > 0 && (
        <ol className="cl-match-card__trace-lines">
          {homeTrace.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ol>
      )}
      {awayTrace !== undefined && awayTrace.length > 0 && (
        <ol className="cl-match-card__trace-lines">
          {awayTrace.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ol>
      )}
    </details>
  );
}

// ---------------------------------------------------------------------------
// ChampionshipMatchCard — a match renderer variant (openspec 0225 task 4.3):
// the grand-final spotlight presentation, merged in from its own file rather
// than sharing MatchCardProps' data shape, which has no place for a seed or
// a per-participant winner flag. Its inline styles and Spanish literal
// defaults are pre-existing debt (KNOWN_INLINE_LAYOUT/KNOWN_RAW_STYLE_VALUES
// in check-atomic-composition.mjs), carried over rather than paid down here
// — that is task 5.2's job, not this file merge's.
// ---------------------------------------------------------------------------

export interface ChampionshipParticipant {
  readonly name: string;
  readonly seed?: number | string;
  readonly score?: number | string;
  readonly winner?: boolean;
}

export interface ChampionshipMatchCardProps {
  /** Card header title, e.g. "GRAND FINAL", "GRAN FINAL", "CHAMPIONSHIP" */
  readonly title?: string;
  /** Home finalist */
  readonly homeParticipant: ChampionshipParticipant;
  /** Away finalist */
  readonly awayParticipant: ChampionshipParticipant;
  /** Match status (e.g. "FINAL", "LIVE", "SCHEDULED") */
  readonly status?: string;
  /** Scheduled time or date */
  readonly scheduledTime?: string;
  /** Additional CSS class */
  readonly className?: string;
}

export function ChampionshipMatchCard({
  title = 'GRAND FINAL',
  homeParticipant,
  awayParticipant,
  status = 'FINAL',
  scheduledTime,
  className = '',
}: ChampionshipMatchCardProps): React.JSX.Element {
  const isLive = status.toUpperCase() === 'LIVE';

  return (
    <div
      className={`cl-championship-card cl-chamfer ${className}`.trim()}
      style={{
        background: 'var(--cl-surface-panel)',
        border: '2px solid var(--cl-state-live)',
        boxShadow: isLive ? 'var(--cl-glow-cyan)' : 'none',
        padding: 'var(--cl-space-4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header with Trophy Icon and Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--cl-border-muted)',
          paddingBottom: 'var(--cl-space-2)',
          marginBottom: 'var(--cl-space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
          {/* Trophy Icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--cl-state-live)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>

          <span
            style={{
              fontFamily: 'var(--cl-font-display)',
              fontSize: 'var(--cl-font-size-sm)',
              fontWeight: 'var(--cl-weight-bold)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--cl-tracking-wider)',
              color: 'var(--cl-state-live)',
            }}
          >
            {title}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            fontFamily: 'var(--cl-font-mono)',
            fontSize: 'var(--cl-font-size-xs)',
          }}
        >
          {scheduledTime && <span style={{ color: 'var(--cl-text-muted)' }}>{scheduledTime}</span>}
          <span
            style={{
              background: isLive ? 'var(--cl-state-live)' : 'var(--cl-surface-base)',
              color: isLive ? 'var(--cl-surface-base)' : 'var(--cl-text-primary)',
              padding: '1px 6px',
              borderRadius: 'var(--cl-radius-sm)',
              fontWeight: 'var(--cl-weight-bold)',
              border: isLive ? 'none' : '1px solid var(--cl-border-muted)',
            }}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Participants Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cl-space-2)' }}>
        {/* Home Participant */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--cl-space-2) var(--cl-space-3)',
            background: homeParticipant.winner
              ? 'var(--cl-surface-chrome)'
              : 'var(--cl-surface-base)',
            borderLeft: homeParticipant.winner
              ? '3px solid var(--cl-state-live)'
              : '3px solid transparent',
            borderRadius: '0 var(--cl-radius-sm) var(--cl-radius-sm) 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
            {homeParticipant.seed !== undefined && (
              <span
                style={{
                  fontFamily: 'var(--cl-font-mono)',
                  fontSize: 'var(--cl-font-size-xs)',
                  color: 'var(--cl-text-muted)',
                }}
              >
                [{homeParticipant.seed}]
              </span>
            )}
            <span
              style={{
                fontFamily: 'var(--cl-font-display)',
                fontWeight: homeParticipant.winner
                  ? 'var(--cl-weight-bold)'
                  : 'var(--cl-weight-semibold)',
                fontSize: 'var(--cl-font-size-base)',
                textTransform: 'uppercase',
                color: homeParticipant.winner
                  ? 'var(--cl-text-primary)'
                  : 'var(--cl-text-secondary)',
              }}
            >
              {homeParticipant.name}
            </span>
          </div>

          {homeParticipant.score !== undefined && (
            <span
              style={{
                fontFamily: 'var(--cl-font-mono)',
                fontSize: 'var(--cl-font-size-lg)',
                fontWeight: 'var(--cl-weight-bold)',
                fontVariantNumeric: 'tabular-nums',
                color: homeParticipant.winner ? 'var(--cl-state-live)' : 'var(--cl-text-primary)',
              }}
            >
              {homeParticipant.score}
            </span>
          )}
        </div>

        {/* Away Participant */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--cl-space-2) var(--cl-space-3)',
            background: awayParticipant.winner
              ? 'var(--cl-surface-chrome)'
              : 'var(--cl-surface-base)',
            borderLeft: awayParticipant.winner
              ? '3px solid var(--cl-state-live)'
              : '3px solid transparent',
            borderRadius: '0 var(--cl-radius-sm) var(--cl-radius-sm) 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
            {awayParticipant.seed !== undefined && (
              <span
                style={{
                  fontFamily: 'var(--cl-font-mono)',
                  fontSize: 'var(--cl-font-size-xs)',
                  color: 'var(--cl-text-muted)',
                }}
              >
                [{awayParticipant.seed}]
              </span>
            )}
            <span
              style={{
                fontFamily: 'var(--cl-font-display)',
                fontWeight: awayParticipant.winner
                  ? 'var(--cl-weight-bold)'
                  : 'var(--cl-weight-semibold)',
                fontSize: 'var(--cl-font-size-base)',
                textTransform: 'uppercase',
                color: awayParticipant.winner
                  ? 'var(--cl-text-primary)'
                  : 'var(--cl-text-secondary)',
              }}
            >
              {awayParticipant.name}
            </span>
          </div>

          {awayParticipant.score !== undefined && (
            <span
              style={{
                fontFamily: 'var(--cl-font-mono)',
                fontSize: 'var(--cl-font-size-lg)',
                fontWeight: 'var(--cl-weight-bold)',
                fontVariantNumeric: 'tabular-nums',
                color: awayParticipant.winner ? 'var(--cl-state-live)' : 'var(--cl-text-primary)',
              }}
            >
              {awayParticipant.score}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveMatchScorecard — a match renderer variant (openspec 0225 task 4.3):
// the tactical live-broadcast presentation, merged in for the same reason
// as ChampionshipMatchCard above — its data shape (per-team colour, goal
// events, a comparator trace) has no correspondence in MatchCardData.
// ---------------------------------------------------------------------------

export interface LiveMatchGoalEvent {
  readonly minute: string | number;
  readonly player: string;
  readonly team: 'home' | 'away';
  readonly varConfirmed?: boolean;
}

export interface LiveMatchParticipant {
  readonly name: string;
  readonly score: number | string;
  readonly color?: string;
  readonly seed?: number | string;
}

export interface ComparatorTrace {
  readonly step: number;
  readonly text: string;
}

export interface LiveMatchScorecardProps {
  readonly location?: string;
  readonly operationsLabel?: string;
  readonly clock?: string;
  readonly homeTeam: LiveMatchParticipant;
  readonly awayTeam: LiveMatchParticipant;
  readonly events?: readonly LiveMatchGoalEvent[];
  readonly comparatorTrace?: ComparatorTrace;
  readonly className?: string;
}

export function LiveMatchScorecard({
  location = 'CANCHA 1',
  operationsLabel = 'OPERACIONES EN VIVO',
  clock = '78:48',
  homeTeam,
  awayTeam,
  events = [],
  comparatorTrace,
  className = '',
}: LiveMatchScorecardProps): React.JSX.Element {
  return (
    <article
      className={`cl-scorecard cl-chamfer ${className}`.trim()}
      style={{
        background: 'var(--cl-surface-panel)',
        border: '1px solid var(--cl-border-muted)',
        padding: 'var(--cl-space-4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Tactical live status header */}
      <div
        className="cl-scorecard__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--cl-border-muted)',
          paddingBottom: 'var(--cl-space-2)',
          marginBottom: 'var(--cl-space-4)',
          fontFamily: 'var(--cl-font-display)',
          fontSize: 'var(--cl-font-size-xs)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--cl-tracking-wider)',
          fontWeight: 'var(--cl-weight-bold)',
          flexWrap: 'wrap',
          gap: 'var(--cl-space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
          <span style={{ color: 'var(--cl-state-live)', fontSize: '0.9em' }}>●</span>
          <span style={{ color: 'var(--cl-text-primary)' }}>{location}</span>
          <span style={{ color: 'var(--cl-text-muted)' }}>•</span>
          <span style={{ color: 'var(--cl-text-secondary)' }}>{operationsLabel}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            fontFamily: 'var(--cl-font-mono)',
          }}
        >
          <span style={{ color: 'var(--cl-state-live)', fontSize: '0.9em' }}>●</span>
          <span style={{ color: 'var(--cl-state-live)', fontWeight: 'var(--cl-weight-bold)' }}>
            {clock}
          </span>
        </div>
      </div>

      {/* Teams and Central Monospace Score Box */}
      <div
        className="cl-scorecard__matchup"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 'var(--cl-space-4)',
          marginBottom: 'var(--cl-space-4)',
        }}
      >
        {/* Home Team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            justifyContent: 'flex-end',
            textAlign: 'right',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--cl-font-display)',
              fontSize: 'var(--cl-font-size-lg)',
              fontWeight: 'var(--cl-weight-bold)',
              textTransform: 'uppercase',
              color: 'var(--cl-text-primary)',
            }}
          >
            {homeTeam.name}
          </span>
          <span
            style={{
              color: homeTeam.color ?? 'var(--cl-color-cyan-400)',
              fontSize: 'var(--cl-font-size-sm)',
            }}
            aria-hidden="true"
          >
            ■
          </span>
        </div>

        {/* Central Monospace Score Box */}
        <div
          className="cl-scorecard__score-box"
          style={{
            background: 'var(--cl-surface-base)',
            border: '1px solid var(--cl-border-muted)',
            padding: 'var(--cl-space-2) var(--cl-space-4)',
            borderRadius: 'var(--cl-radius-sm)',
            fontFamily: 'var(--cl-font-mono)',
            fontSize: 'var(--cl-font-size-xl)',
            fontWeight: 'var(--cl-weight-bold)',
            color: 'var(--cl-text-primary)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 'var(--cl-tracking-wide)',
            textAlign: 'center',
            minWidth: '90px',
          }}
        >
          [ {homeTeam.score} : {awayTeam.score} ]
        </div>

        {/* Away Team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            justifyContent: 'flex-start',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              color: awayTeam.color ?? 'var(--cl-accent-team)',
              fontSize: 'var(--cl-font-size-sm)',
            }}
            aria-hidden="true"
          >
            ■
          </span>
          <span
            style={{
              fontFamily: 'var(--cl-font-display)',
              fontSize: 'var(--cl-font-size-lg)',
              fontWeight: 'var(--cl-weight-bold)',
              textTransform: 'uppercase',
              color: 'var(--cl-text-primary)',
            }}
          >
            {awayTeam.name}
          </span>
        </div>
      </div>

      {/* Goal Events with VAR Status */}
      {events.length > 0 && (
        <div
          className="cl-scorecard__events"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--cl-space-2)',
            padding: 'var(--cl-space-2) 0',
            borderTop: '1px solid var(--cl-border-muted)',
            marginBottom: comparatorTrace ? 'var(--cl-space-3)' : 0,
          }}
        >
          {events.map((evt, idx) => (
            <div
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--cl-space-2)',
                background: 'var(--cl-surface-chrome)',
                padding: 'var(--cl-space-1) var(--cl-space-2)',
                borderRadius: 'var(--cl-radius-sm)',
                fontSize: 'var(--cl-font-size-xs)',
                fontFamily: 'var(--cl-font-mono)',
              }}
            >
              <span style={{ color: 'var(--cl-state-live)', fontWeight: 'var(--cl-weight-bold)' }}>
                {evt.minute}&apos;
              </span>
              <span style={{ color: 'var(--cl-text-primary)' }}>{evt.player}</span>
              {evt.varConfirmed && (
                <span
                  style={{
                    background: 'var(--cl-surface-base)',
                    color: 'var(--cl-color-amber-400)',
                    border: '1px solid var(--cl-color-amber-400)',
                    padding: '0 4px',
                    borderRadius: '2px',
                    fontSize: 'var(--cl-font-size-xs)',
                    fontWeight: 'var(--cl-weight-bold)',
                  }}
                >
                  VAR CONFIRMED
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Standings Comparator Trace Callout */}
      {comparatorTrace && (
        <div
          className="cl-scorecard__comparator-trace"
          style={{
            borderLeft: '3px solid var(--cl-state-live)',
            background: 'var(--cl-surface-chrome)',
            padding: 'var(--cl-space-2) var(--cl-space-3)',
            marginTop: 'var(--cl-space-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            fontSize: 'var(--cl-font-size-xs)',
            fontFamily: 'var(--cl-font-mono)',
            color: 'var(--cl-text-secondary)',
          }}
        >
          <span style={{ color: 'var(--cl-state-live)', fontWeight: 'var(--cl-weight-bold)' }}>
            [Step {comparatorTrace.step}]
          </span>
          <span style={{ color: 'var(--cl-text-primary)' }}>{comparatorTrace.text}</span>
        </div>
      )}
    </article>
  );
}
