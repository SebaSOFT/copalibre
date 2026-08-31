import { EntrantName } from './EntrantName.js';
import { presentState } from '../lib/result-state.js';
import { seriesScore, seriesSegments, seriesPending, toSeriesInput } from '../lib/series.js';
import { applyTemplate, formatClock, type MatchCardData } from '../lib/matches-view.js';
import type { MatchCardLabels } from '../lib/i18n/public-intl.js';

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
              className="cl-badge"
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
              className="cl-badge"
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
