import { useState } from 'react';
import { isSupportedLanguage, type SupportedLanguage } from '@copalibre/domain';
import { isImplicitGroupZoneName } from '../../../lib/competition-context.js';
import { formatPlacement, formatSideSource, sourceMatchLabel } from '../../../lib/side-source.js';
import { rescheduledStatement } from '../../../lib/reschedule.js';
import { useHydrated } from '../../../lib/island-browser-state.js';
import { useLiveScoreboardPatch } from '../../../lib/live-scoreboard-hooks.js';
import { activeSegmentLabel } from '../../../lib/segment-label.js';
import { eventLabel } from '../../../lib/event-label.js';
import { resolveTiebreakerLabel } from '../../../lib/tiebreaker-labels.js';
import { Badge } from '../atoms/Badge.js';
import { Icon } from '../atoms/icon.js';
import { Card } from '../atoms/Card.js';
import { EntrantName } from '../atoms/EntrantName.js';
import { EntrantEmblem } from '../molecules/EntrantEmblem.js';
import { LiveMatchScoreboard } from '../molecules/LiveMatchScoreboard.js';
import { ResponsiveTimestamp } from '../atoms/ResponsiveTimestamp.js';
import { isDelayed } from '../../../lib/match-state.js';
import { presentDelayedState, presentState } from '../../../lib/result-state.js';
import { seriesScore, seriesSegments, seriesPending, toSeriesInput } from '../../../lib/series.js';
import {
  applyTemplate,
  displayedScore,
  formatClock,
  matchCardTitle,
  type MatchCardData,
} from '../../../lib/matches-view.js';
import type { MatchCardLabels } from '../../../lib/i18n/public-intl.js';
import { ValueFlash } from '../atoms/ValueFlash.js';
import { clubEmblemUrl } from '../../../lib/public-image-paths.js';
import { optionalClubPageUrl } from '../../../lib/club-url.js';

/**
 * The matches-view card: one shared React component for both the public
 * site (mounted with `client:load`, the same way `EntrantName` already is)
 * and control-web (used natively, no hydration boundary). Every label
 * arrives pre-formatted via `labels` — the same constraint `LiveMatchHero`
 * already documents: this file must never import `react-intl`'s formatting
 * machinery itself, only accept already-resolved strings.
 */
/**
 * The viewer's side in a finished match, as a labelled badge. The caller supplies the words in the
 * page's language; the card supplies the icon and tone for each kind.
 */
export interface MatchCardOutcome {
  readonly kind: 'won' | 'drawn' | 'lost';
  readonly label: string;
}

const OUTCOME_BADGE: Record<
  MatchCardOutcome['kind'],
  { readonly className: string; readonly icon: 'check' | 'minus' | 'close' }
> = {
  won: { className: 'cl-badge--positive', icon: 'check' },
  drawn: { className: 'cl-badge--muted', icon: 'minus' },
  lost: { className: 'cl-badge--negative', icon: 'close' },
};

export interface MatchCardProps {
  readonly match: MatchCardData;
  /** The viewer's result in this finished match, shown as a labelled badge; absent on other surfaces. */
  readonly outcome?: MatchCardOutcome;
  readonly labels: MatchCardLabels;
  /** Required: threaded straight into `ResponsiveTimestamp`, which no longer guesses one. */
  readonly locale: string;
  /** Public schedules use the organization's zone; other callers may keep viewer-local time. */
  readonly timeZone?: string;
  /** Request instant for deterministic SSR/client relative-day and delayed rendering. */
  readonly referenceDate?: number;
  /** Wraps the card in a link when present — the public site's report page. */
  readonly reportUrl?: string;
  /** Builds same-origin emblem routes for persisted team entrants. */
  readonly organizationAlias?: string;
  /** Builds club page links for teams in regular cards when `clubAlias` is present. */
  readonly tournamentAlias?: string;
  /** Optional locale prefix (`'/es'`, etc.) for club page links. */
  readonly localePrefix?: string;
  /** Opaque band assigned by a public list; other surfaces retain their default card surface. */
  readonly band?: 'panel' | 'base';
  /** Single-line ticker presentation — a dense listing's own row shape, not a smaller version of the full card. */
  readonly compact?: boolean;
  /** Abbreviated names suit a ticker; overview summaries can request readable names. */
  readonly compactNames?: 'abbreviated' | 'full';
  /** Heading depth in the page outline. */
  readonly headingLevel?: number;
  /** True when this card sits inside its zone's own heading section so placement titles omit the zone prefix. */
  readonly inZoneSection?: boolean;
}

/**
 * The compact ticker's entrant text uses the stored abbreviation when one
 * exists, then the full display name. It never creates initials or clips a
 * persisted abbreviation; CSS may ellipsize only the surrounding ticker text.
 */
export function resolveCompactEntrant(
  undecided: string,
  abbreviation?: string,
  fullName?: string,
): string {
  return abbreviation?.trim() || fullName || undecided;
}

function resolveLanguageTag(locale: string): SupportedLanguage {
  const base = locale.split('-')[0] ?? 'en';
  return isSupportedLanguage(base) ? base : 'en';
}

export function MatchCard({
  match,
  labels,
  locale,
  timeZone,
  referenceDate,
  reportUrl,
  organizationAlias,
  tournamentAlias,
  localePrefix,
  band,
  compact = false,
  compactNames = 'abbreviated',
  headingLevel = 3,
  inZoneSection = false,
  outcome,
}: MatchCardProps): React.JSX.Element {
  const bothUndecided = match.homeName === undefined && match.awayName === undefined;
  const [homeOverflow, setHomeOverflow] = useState(false);
  const [awayOverflow, setAwayOverflow] = useState(false);
  const syncCompactUndecided = bothUndecided && (homeOverflow || awayOverflow);
  const hydrated = useHydrated();
  const livePatch = useLiveScoreboardPatch(match.matchId);
  const usePatch = hydrated && livePatch !== undefined;
  const effectiveState = usePatch && livePatch.state !== undefined ? livePatch.state : match.state;
  const effectiveClock = usePatch ? livePatch.clock : match.clock;
  const effectiveSegments = (usePatch ? livePatch.segments : undefined) ?? match.segments;
  const language = resolveLanguageTag(locale);
  const effectiveSegmentLabel = activeSegmentLabel(effectiveSegments, effectiveClock, language);
  const MatchHeading = `h${Math.min(Math.max(headingLevel, 2), 6)}` as
    'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const homeSource = formatSideSource(
    match.homeSource,
    labels.sideSource,
    match.homeSource === undefined
      ? undefined
      : sourceMatchLabel(
          match.homeSource,
          labels.sideSource,
          match.sourceFinalRound,
          match.zoneNodeKeys,
        ),
  );
  const awaySource = formatSideSource(
    match.awaySource,
    labels.sideSource,
    match.awaySource === undefined
      ? undefined
      : sourceMatchLabel(
          match.awaySource,
          labels.sideSource,
          match.sourceFinalRound,
          match.zoneNodeKeys,
        ),
  );
  const rescheduled =
    effectiveState === 'upcoming'
      ? rescheduledStatement(match.rescheduledFrom, match.venueName, locale, labels.rescheduled)
      : '';
  const delayed =
    effectiveState === 'upcoming' &&
    isDelayed({ state: effectiveState, scheduledAt: match.scheduledAt }, referenceDate);
  const badge =
    delayed && labels.delayed
      ? presentDelayedState(labels.delayed)
      : presentState(effectiveState, labels.state);
  const linkedClass = reportUrl === undefined ? '' : ' cl-match-card--linked';
  const title = matchCardTitle(match, labels, { inZoneSection });
  const placementIncludesZone =
    title.names === 'placement' &&
    !inZoneSection &&
    match.multiZoneStage === true &&
    match.zoneName !== undefined;
  const visibleZoneName =
    placementIncludesZone ||
    (match.groupName !== undefined && isImplicitGroupZoneName(match.zoneName))
      ? undefined
      : match.zoneName;
  // The title already names the group or the placement; the scope line keeps what it does not.
  const scopeLine = [
    visibleZoneName,
    title.names === 'group' ? undefined : match.groupName,
    match.placement === undefined || title.names === 'placement'
      ? undefined
      : formatPlacement(match.placement, labels.sideSource),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
  const hasFullTrace =
    (match.homeTrace !== undefined && match.homeTrace.length > 0) ||
    (match.awayTrace !== undefined && match.awayTrace.length > 0);
  const rawHomeScore =
    usePatch && livePatch.homeScore !== undefined ? livePatch.homeScore : match.homeScore;
  const rawAwayScore =
    usePatch && livePatch.awayScore !== undefined ? livePatch.awayScore : match.awayScore;
  const homeScore = displayedScore(effectiveState, rawHomeScore);
  const awayScore = displayedScore(effectiveState, rawAwayScore);
  const showScores =
    effectiveState !== 'upcoming' || (homeScore !== undefined && awayScore !== undefined);
  const homeName = match.homeName ?? homeSource.long;
  const awayName = match.awayName ?? awaySource.long;
  const versus = labels.versus ?? 'vs';
  const matchTitle = title.number === undefined ? title.title : `${title.title} · ${title.number}`;
  const homeEmblemSrc =
    organizationAlias && match.homeClubId && match.homeEmblemObjectId
      ? clubEmblemUrl(organizationAlias, match.homeClubId)
      : undefined;
  const awayEmblemSrc =
    organizationAlias && match.awayClubId && match.awayEmblemObjectId
      ? clubEmblemUrl(organizationAlias, match.awayClubId)
      : undefined;
  const homeClubUrl =
    match.homeName !== undefined
      ? optionalClubPageUrl({
          organizationAlias,
          tournamentAlias,
          clubAlias: match.homeClubAlias,
          localePrefix,
        })
      : undefined;
  const awayClubUrl =
    match.awayName !== undefined
      ? optionalClubPageUrl({
          organizationAlias,
          tournamentAlias,
          clubAlias: match.awayClubAlias,
          localePrefix,
        })
      : undefined;

  if (compact) {
    const homeCompactName =
      compactNames === 'full'
        ? homeName
        : match.homeName === undefined
          ? homeSource.short
          : resolveCompactEntrant(homeSource.short, match.homeAbbreviation, match.homeName);
    const awayCompactName =
      compactNames === 'full'
        ? awayName
        : match.awayName === undefined
          ? awaySource.short
          : resolveCompactEntrant(awaySource.short, match.awayAbbreviation, match.awayName);
    const hasScores = homeScore !== undefined && awayScore !== undefined;
    const showCompactTime = !hasScores && match.scheduledAt !== undefined;
    const compactBody = (
      <Card
        as="article"
        className={`cl-match-card cl-match-card--compact${compactNames === 'full' ? ' cl-match-card--compact-full-names' : ''}${linkedClass}`}
        data-match={match.matchId}
        data-schedule-version={match.scheduleVersion ?? 0}
      >
        {reportUrl !== undefined && (
          <a
            aria-label={`${homeName} ${versus} ${awayName}`}
            className="cl-match-card__hit-area"
            href={reportUrl}
          />
        )}
        <span
          aria-label={badge.label}
          className={`cl-match-card__compact-dot${badge.state === 'live' ? ' cl-live-dot' : ''} ${badge.className}`.trim()}
          role="img"
          title={badge.label}
        >
          <span className="cl-visually-hidden">{badge.label}</span>
        </span>
        <span className="cl-match-card__compact-content">
          <span
            className="cl-match-card__compact-side cl-match-card__compact-side--home"
            title={homeName}
          >
            <EntrantEmblem
              abbreviation={match.homeAbbreviation}
              alt={homeName}
              decorative
              size={24}
              src={homeEmblemSrc}
            />
            <span>
              {homeCompactName}
              {hasScores ? ` ${homeScore}` : ''}
            </span>
          </span>{' '}
          <span className="cl-match-card__compact-versus">{versus}</span>{' '}
          <span
            className="cl-match-card__compact-side cl-match-card__compact-side--away"
            title={awayName}
          >
            <EntrantEmblem
              abbreviation={match.awayAbbreviation}
              alt={awayName}
              decorative
              size={24}
              src={awayEmblemSrc}
            />
            <span>
              {hasScores ? `${awayScore} ` : ''}
              {awayCompactName}
            </span>
          </span>
          {showCompactTime && match.scheduledAt !== undefined && (
            <span className="cl-match-card__compact-time">
              {' '}
              <ResponsiveTimestamp
                locale={locale}
                referenceDate={referenceDate}
                timeZone={timeZone}
                timestamp={match.scheduledAt}
              />
            </span>
          )}
          {delayed && labels.delayed && (
            <Badge className={`cl-match-card__compact-state ${badge.className}`}>
              <Icon name={badge.icon} size={16} />
              <span>{badge.label}</span>
            </Badge>
          )}
          {rescheduled && (
            <span className="cl-match-card__venue cl-match-card__compact-rescheduled">
              {rescheduled}
            </span>
          )}
        </span>
      </Card>
    );

    return compactBody;
  }

  const body = (
    <Card
      as="article"
      className={`cl-match-card${band === undefined ? '' : band === 'base' ? ' cl-band--base' : ' cl-band'}${linkedClass}`}
      data-match={match.matchId}
      data-schedule-version={match.scheduleVersion ?? 0}
    >
      <div className="cl-match-card__header">
        <MatchHeading className="cl-match-card__heading">
          {reportUrl === undefined ? (
            title.title
          ) : (
            <a
              aria-label={`${matchTitle}: ${homeName} ${versus} ${awayName}`}
              className="cl-match-card__report-link cl-focusable"
              href={reportUrl}
            >
              {title.title}
            </a>
          )}
          {title.number !== undefined && (
            // A linked title's label already says the number; a reader hears it once.
            <span
              aria-hidden={reportUrl === undefined ? undefined : true}
              className="cl-match-card__number"
            >
              {title.number}
            </span>
          )}
        </MatchHeading>
        <Badge className={badge.className}>
          {badge.state !== 'live' && <Icon name={badge.icon} size={16} />}
          <span>{badge.label}</span>
        </Badge>
        {outcome !== undefined && (
          <Badge className={`cl-match-card__outcome ${OUTCOME_BADGE[outcome.kind].className}`}>
            <Icon name={OUTCOME_BADGE[outcome.kind].icon} size={16} />
            <span>{outcome.label}</span>
          </Badge>
        )}
        {effectiveState === 'live' &&
        (effectiveClock !== undefined || effectiveSegmentLabel !== undefined) ? (
          <LiveMatchScoreboard
            clock={effectiveClock}
            labels={{
              clockStopped: labels.clockStopped ?? '',
              clockAriaLabel: labels.liveClockAriaLabel ?? labels.clockAriaLabel,
              lastUpdated: labels.lastUpdated ?? '{time}',
            }}
            locale={locale}
            matchId={match.matchId}
            segmentLabel={effectiveSegmentLabel}
            segments={effectiveSegments}
            showLastUpdated={Boolean(labels.lastUpdated)}
            timeZone={timeZone}
          />
        ) : (
          effectiveState === 'live' &&
          match.clockSeconds !== undefined && (
            <span
              className="cl-match-card__clock"
              title={applyTemplate(labels.clockAriaLabel, {
                time: formatClock(match.clockSeconds),
              })}
            >
              {formatClock(match.clockSeconds)}
            </span>
          )
        )}
      </div>

      {rescheduled && (
        <p className="cl-match-card__venue" role="status">
          {rescheduled}
        </p>
      )}
      <ol className="cl-match-card__sides">
        <li className="cl-match-card__side">
          <EntrantEmblem
            abbreviation={match.homeAbbreviation}
            alt={homeName}
            decorative
            size={32}
            src={homeEmblemSrc}
          />
          {homeClubUrl ? (
            <a className="cl-match-card__team-link cl-focusable" href={homeClubUrl}>
              <EntrantName
                pending={match.homeName === undefined}
                compact={syncCompactUndecided}
                onOverflowChange={bothUndecided ? setHomeOverflow : undefined}
                fullName={homeName}
                abbreviation={
                  match.homeName === undefined ? homeSource.short : match.homeAbbreviation
                }
              />
            </a>
          ) : (
            <EntrantName
              pending={match.homeName === undefined}
              compact={syncCompactUndecided}
              onOverflowChange={bothUndecided ? setHomeOverflow : undefined}
              fullName={homeName}
              abbreviation={
                match.homeName === undefined ? homeSource.short : match.homeAbbreviation
              }
            />
          )}
          {match.state !== 'upcoming' && match.homePosition !== undefined && (
            <Badge
              className="cl-badge--rank"
              title={applyTemplate(labels.position, { position: match.homePosition })}
            >
              #{match.homePosition}
            </Badge>
          )}
          {showScores && (
            <ValueFlash className="cl-stat-tile__value cl-tabular-nums" value={homeScore} />
          )}
        </li>
        <li className="cl-match-card__side">
          <EntrantEmblem
            abbreviation={match.awayAbbreviation}
            alt={awayName}
            decorative
            size={32}
            src={awayEmblemSrc}
          />
          {awayClubUrl ? (
            <a className="cl-match-card__team-link cl-focusable" href={awayClubUrl}>
              <EntrantName
                pending={match.awayName === undefined}
                compact={syncCompactUndecided}
                onOverflowChange={bothUndecided ? setAwayOverflow : undefined}
                fullName={awayName}
                abbreviation={
                  match.awayName === undefined ? awaySource.short : match.awayAbbreviation
                }
              />
            </a>
          ) : (
            <EntrantName
              pending={match.awayName === undefined}
              compact={syncCompactUndecided}
              onOverflowChange={bothUndecided ? setAwayOverflow : undefined}
              fullName={awayName}
              abbreviation={
                match.awayName === undefined ? awaySource.short : match.awayAbbreviation
              }
            />
          )}
          {match.state !== 'upcoming' && match.awayPosition !== undefined && (
            <Badge
              className="cl-badge--rank"
              title={applyTemplate(labels.position, { position: match.awayPosition })}
            >
              #{match.awayPosition}
            </Badge>
          )}
          {showScores && (
            <ValueFlash className="cl-stat-tile__value cl-tabular-nums" value={awayScore} />
          )}
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
              <ResponsiveTimestamp
                timestamp={match.scheduledAt}
                locale={locale}
                referenceDate={referenceDate}
                timeZone={timeZone}
              />
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
          title={applyTemplate(labels.latestEventAriaLabel, {
            event: eventLabel(match.latestEvent, language),
          })}
        >
          {eventLabel(match.latestEvent, language)}
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

      {match.state === 'final' && match.decidingFactorCode !== undefined && (
        <p className="cl-match-card__deciding-factor" title={labels.decidedByAriaLabel}>
          {applyTemplate(labels.decidedBy, {
            factor: resolveTiebreakerLabel(
              match.decidingFactorCode,
              labels.tiebreakers,
              undefined,
              language,
            ),
          })}
        </p>
      )}

      {hasFullTrace && (
        <TracePanel homeTrace={match.homeTrace} awayTrace={match.awayTrace} labels={labels} />
      )}
    </Card>
  );

  return body;
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
          <Icon className="cl-scorecard__dot" name="live" size={16} />
          <span className="cl-scorecard__location">{location}</span>
          <span className="cl-scorecard__separator">•</span>
          <span className="cl-scorecard__operations">{operationsLabel}</span>
        </div>

        <div className="cl-scorecard__clock-group">
          <Icon className="cl-scorecard__dot" name="live" size={16} />
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
