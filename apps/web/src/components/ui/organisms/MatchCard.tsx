import { Badge } from '../atoms/Badge.js';
import { Card } from '../atoms/Card.js';
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
    <Card as="article" className="cl-match-card" data-match={match.matchId}>
      <div className="cl-match-card__header">
        <Badge>
          <span aria-hidden="true">{badge.icon}</span>
          <span>{badge.label}</span>
        </Badge>
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
            <Badge
              className="cl-badge--rank"
              title={applyTemplate(labels.position, { position: match.homePosition })}
            >
              #{match.homePosition}
            </Badge>
          )}
          <span className="cl-stat-tile__value">{match.homeScore ?? '—'}</span>
        </li>
        <li className="cl-match-card__side">
          <EntrantName fullName={match.awayName ?? 'TBD'} abbreviation={match.awayAbbreviation} />
          {match.awayPosition !== undefined && (
            <Badge
              className="cl-badge--rank"
              title={applyTemplate(labels.position, { position: match.awayPosition })}
            >
              #{match.awayPosition}
            </Badge>
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
    </Card>
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
    <div className={`cl-championship-card cl-chamfer ${className}`.trim()}>
      {/* Header with Trophy Icon and Status */}
      <div className="cl-championship-card__header">
        <div className="cl-championship-card__title-group">
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

          <span className="cl-championship-card__title">{title}</span>
        </div>

        <div className="cl-championship-card__meta">
          {scheduledTime && <span className="cl-championship-card__time">{scheduledTime}</span>}
          <span
            className={`cl-championship-card__status ${isLive ? 'cl-championship-card__status--live' : ''}`.trim()}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Participants Rows */}
      <div className="cl-championship-card__participants">
        {[homeParticipant, awayParticipant].map((participant, index) => (
          <div
            className={`cl-championship-card__participant ${participant.winner ? 'cl-championship-card__participant--winner' : ''}`.trim()}
            key={index === 0 ? 'home' : 'away'}
          >
            <div className="cl-championship-card__participant-info">
              {participant.seed !== undefined && (
                <span className="cl-championship-card__seed">[{participant.seed}]</span>
              )}
              <span
                className={`cl-championship-card__name ${participant.winner ? 'cl-championship-card__name--winner' : ''}`.trim()}
              >
                {participant.name}
              </span>
            </div>

            {participant.score !== undefined && (
              <span
                className={`cl-championship-card__score ${participant.winner ? 'cl-championship-card__score--winner' : ''}`.trim()}
              >
                {participant.score}
              </span>
            )}
          </div>
        ))}
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
    <article className={`cl-scorecard cl-chamfer ${className}`.trim()}>
      {/* Tactical live status header */}
      <div className="cl-scorecard__header">
        <div className="cl-scorecard__location-group">
          <span className="cl-scorecard__dot">●</span>
          <span className="cl-scorecard__location">{location}</span>
          <span className="cl-scorecard__separator">•</span>
          <span className="cl-scorecard__operations">{operationsLabel}</span>
        </div>

        <div className="cl-scorecard__clock-group">
          <span className="cl-scorecard__dot">●</span>
          <span className="cl-scorecard__clock">{clock}</span>
        </div>
      </div>

      {/* Teams and Central Monospace Score Box */}
      <div className="cl-scorecard__matchup">
        {/* Home Team */}
        <div className="cl-scorecard__team cl-scorecard__team--home">
          <span className="cl-scorecard__team-name">{homeTeam.name}</span>
          <span
            aria-hidden="true"
            className="cl-scorecard__team-swatch"
            style={{ color: homeTeam.color ?? 'var(--cl-color-cyan-400)' }}
          >
            ■
          </span>
        </div>

        {/* Central Monospace Score Box */}
        <div className="cl-scorecard__score-box">
          [ {homeTeam.score} : {awayTeam.score} ]
        </div>

        {/* Away Team */}
        <div className="cl-scorecard__team cl-scorecard__team--away">
          <span
            aria-hidden="true"
            className="cl-scorecard__team-swatch"
            style={{ color: awayTeam.color ?? 'var(--cl-accent-team)' }}
          >
            ■
          </span>
          <span className="cl-scorecard__team-name">{awayTeam.name}</span>
        </div>
      </div>

      {/* Goal Events with VAR Status */}
      {events.length > 0 && (
        <div
          className="cl-scorecard__events"
          style={{ marginBottom: comparatorTrace ? 'var(--cl-space-3)' : 0 }}
        >
          {events.map((evt, idx) => (
            <div className="cl-scorecard__event" key={idx}>
              <span className="cl-scorecard__event-minute">{evt.minute}&apos;</span>
              <span className="cl-scorecard__event-player">{evt.player}</span>
              {evt.varConfirmed && <span className="cl-scorecard__var-tag">VAR CONFIRMED</span>}
            </div>
          ))}
        </div>
      )}

      {/* Standings Comparator Trace Callout */}
      {comparatorTrace && (
        <div className="cl-scorecard__comparator-trace cl-accent-rail cl-accent-rail--thin">
          <span className="cl-scorecard__comparator-step">[Step {comparatorTrace.step}]</span>
          <span className="cl-scorecard__comparator-text">{comparatorTrace.text}</span>
        </div>
      )}
    </article>
  );
}
