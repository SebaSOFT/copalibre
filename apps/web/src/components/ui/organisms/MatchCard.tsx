import { formatPlacement, formatSideSource, sourceMatchLabel } from '../../../lib/side-source.js';
import { rescheduledStatement } from '../../../lib/reschedule.js';
import { Badge } from '../atoms/Badge.js';
import { Icon } from '../atoms/icon.js';
import { Card } from '../atoms/Card.js';
import { EntrantName } from '../atoms/EntrantName.js';
import { ResponsiveTimestamp } from '../atoms/ResponsiveTimestamp.js';
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
  /** Required: threaded straight into `ResponsiveTimestamp`, which no longer guesses one. */
  readonly locale: string;
  /** Wraps the card in a link when present — the public site's report page. */
  readonly reportUrl?: string;
  /** Opaque band assigned by a public list; other surfaces retain their default card surface. */
  readonly band?: 'panel' | 'base';
  /** Single-line ticker presentation — a dense listing's own row shape, not a smaller version of the full card. */
  readonly compact?: boolean;
}

/**
 * The compact ticker's entrant text: a persisted abbreviation
 * always wins — this never overrides an organizer's own choice, the same
 * rule `EntrantName` follows for its overflow fallback. Absent one, it
 * derives dotted initials from a multi-word name ("San Juan" -> "S.J.") or
 * the first 5 characters of a single word ("River" -> "RIVER"), and falls
 * back to "TBD" with no name at all — deterministic, so the same match
 * always tickers the same way regardless of viewport.
 */
export function resolveCompactEntrant(abbreviation?: string, fullName?: string): string {
  if (abbreviation !== undefined && abbreviation.trim() !== '') return abbreviation.trim();
  if (fullName === undefined || fullName.trim() === '') return 'TBD';
  const words = fullName.trim().split(/\s+/);
  if (words.length > 1) {
    return `${words.map((word) => word[0]?.toUpperCase()).join('.')}.`;
  }
  return (words[0] ?? '').slice(0, 5).toUpperCase();
}

export function MatchCard({
  match,
  labels,
  locale,
  reportUrl,
  band,
  compact = false,
}: MatchCardProps): React.JSX.Element {
  const homeSource = formatSideSource(
    match.homeSource,
    labels.sideSource,
    match.homeSource === undefined
      ? undefined
      : sourceMatchLabel(match.homeSource, labels.sideSource, match.sourceFinalRound),
  );
  const awaySource = formatSideSource(
    match.awaySource,
    labels.sideSource,
    match.awaySource === undefined
      ? undefined
      : sourceMatchLabel(match.awaySource, labels.sideSource, match.sourceFinalRound),
  );
  const rescheduled =
    match.state === 'upcoming'
      ? rescheduledStatement(match.rescheduledFrom, match.venueName, locale, labels.rescheduled)
      : '';
  const badge = presentState(match.state, labels.state);
  const scopeLine = [
    match.zoneName,
    match.groupName,
    match.placement === undefined ? undefined : formatPlacement(match.placement, labels.sideSource),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
  const hasFullTrace =
    (match.homeTrace !== undefined && match.homeTrace.length > 0) ||
    (match.awayTrace !== undefined && match.awayTrace.length > 0);

  if (compact) {
    const versus = labels.versus ?? 'vs';
    const homeAbbr =
      match.homeName === undefined
        ? homeSource.short
        : resolveCompactEntrant(match.homeAbbreviation, match.homeName);
    const awayAbbr =
      match.awayName === undefined
        ? awaySource.short
        : resolveCompactEntrant(match.awayAbbreviation, match.awayName);
    const hasScores = match.homeScore !== undefined && match.awayScore !== undefined;
    const timeStr =
      !hasScores && match.scheduledAt !== undefined
        ? ` ${new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(match.scheduledAt))}`
        : '';
    const content = hasScores
      ? `${homeAbbr} ${match.homeScore} ${versus} ${match.awayScore} ${awayAbbr}`
      : `${homeAbbr} ${versus} ${awayAbbr}${timeStr}`;

    const compactBody = (
      <Card
        as="article"
        className="cl-match-card cl-match-card--compact"
        data-match={match.matchId}
        data-schedule-version={match.scheduleVersion ?? 0}
      >
        <span
          aria-label={badge.label}
          className={`cl-match-card__compact-dot ${badge.className}`.trim()}
          role="img"
          title={badge.label}
        >
          <span className="cl-visually-hidden">{badge.label}</span>
        </span>
        <span className="cl-match-card__compact-content">
          {content}
          {rescheduled && <span className="cl-match-card__venue">{rescheduled}</span>}
        </span>
      </Card>
    );

    return reportUrl === undefined ? compactBody : <a href={reportUrl}>{compactBody}</a>;
  }

  const body = (
    <Card
      as="article"
      className={`cl-match-card${band === undefined ? '' : band === 'base' ? ' cl-band--base' : ' cl-band'}`}
      data-match={match.matchId}
      data-schedule-version={match.scheduleVersion ?? 0}
    >
      <div className="cl-match-card__header">
        <Badge className={badge.className}>
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

      {rescheduled && (
        <p className="cl-match-card__venue" role="status">
          {rescheduled}
        </p>
      )}
      <ol className="cl-match-card__sides">
        <li className="cl-match-card__side">
          <EntrantName
            pending={match.homeName === undefined}
            fullName={match.homeName ?? homeSource.long}
            abbreviation={match.homeName === undefined ? homeSource.short : match.homeAbbreviation}
          />
          {match.homePosition !== undefined && (
            <Badge
              className="cl-badge--rank"
              title={applyTemplate(labels.position, { position: match.homePosition })}
            >
              #{match.homePosition}
            </Badge>
          )}
          <span className="cl-stat-tile__value cl-tabular-nums">{match.homeScore ?? '—'}</span>
        </li>
        <li className="cl-match-card__side">
          <EntrantName
            pending={match.awayName === undefined}
            fullName={match.awayName ?? awaySource.long}
            abbreviation={match.awayName === undefined ? awaySource.short : match.awayAbbreviation}
          />
          {match.awayPosition !== undefined && (
            <Badge
              className="cl-badge--rank"
              title={applyTemplate(labels.position, { position: match.awayPosition })}
            >
              #{match.awayPosition}
            </Badge>
          )}
          <span className="cl-stat-tile__value cl-tabular-nums">{match.awayScore ?? '—'}</span>
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

      {(match.venueName !== undefined || match.scheduledAt !== undefined) && (
        <p className="cl-match-card__venue">
          {match.scheduledAt !== undefined && (
            <span
              aria-label={
                labels.scheduledAtAriaLabel && match.scheduledAtLabel !== undefined
                  ? applyTemplate(labels.scheduledAtAriaLabel, { time: match.scheduledAtLabel })
                  : undefined
              }
            >
              <Icon name="clock" size={16} />
              <ResponsiveTimestamp timestamp={match.scheduledAt} locale={locale} />
            </span>
          )}
          {match.venueName !== undefined && match.scheduledAt !== undefined && ' · '}
          {match.venueName !== undefined && (
            <span title={applyTemplate(labels.venueAriaLabel, { venue: match.venueName })}>
              {match.venueName}
            </span>
          )}
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
        className="cl-series__score cl-tabular-nums"
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
// ChampionshipMatchCard — a match renderer variant:
// the grand-final spotlight presentation, merged in from its own file rather
// than sharing MatchCardProps' data shape, which has no place for a seed or
// a per-participant winner flag. Its inline styles and Spanish literal
// defaults are pre-existing debt (KNOWN_INLINE_LAYOUT/KNOWN_RAW_STYLE_VALUES
// in check-atomic-composition.mjs), carried over rather than paid down here —
// that is a separate paydown, not this file merge's.
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
          <Icon name="trophy" size={20} />

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
                className={`cl-championship-card__score cl-tabular-nums ${participant.winner ? 'cl-championship-card__score--winner' : ''}`.trim()}
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
// LiveMatchScorecard — a match renderer variant:
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
        <div className="cl-scorecard__score-box cl-tabular-nums">
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
