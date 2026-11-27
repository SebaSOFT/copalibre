import { useEffect, useState } from 'react';
import { isSupportedLanguage, type SupportedLanguage } from '@copalibre/domain';
import { RealtimeClient } from '@copalibre/realtime';
import { matchReportUrl } from '../../../lib/bracket.js';
import { Badge } from '../atoms/Badge.js';
import { Card, CardDescription, CardTitle } from '../atoms/Card.js';
import { EntrantName } from '../atoms/EntrantName.js';
import { Icon } from '../atoms/icon.js';
import { ResponsiveTimestamp } from '../atoms/ResponsiveTimestamp.js';
import { ValueFlash } from '../atoms/ValueFlash.js';
import {
  LiveMatchScoreboard,
  type LiveMatchScoreboardLabels,
} from '../molecules/LiveMatchScoreboard.js';
import { useEntryOnce } from '../../../lib/use-entry-once.js';
import { applyEvent, markConnected, type LiveDashboard } from '../../../lib/live-state.js';
import { applyTemplate } from '../../../lib/matches-view.js';
import { activeSegmentLabel } from '../../../lib/segment-label.js';
import { presentState, type ResultStateLabels } from '../../../lib/result-state.js';

/**
 * The one interactive island on the public live screen.
 *
 * It starts from what the server already rendered and patches it. If the stream
 * never connects, the props are still the truth — which is why this component
 * takes a full dashboard rather than fetching one.
 *
 * `usingLastKnownText` and `resultStateLabels` arrive pre-formatted from the
 * parent `.astro` page rather than this file importing the catalog or
 * `react-intl`'s formatting machinery itself — the one deliberate exception to
 * how every other public-web string is resolved, so this client bundle stays
 * free of build-time-only Node dependencies.
 */
export interface LiveMatchHeroProps {
  readonly initial: LiveDashboard;
  readonly streamPath: string;
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly localePrefix?: string;
  readonly versusLabel: string;
  readonly openMatchLabel: string;
  readonly clockLabels: LiveMatchScoreboardLabels;
  readonly usingLastKnownText: string;
  readonly noMatchesText: string;
  readonly nextKickoffText: string;
  readonly nextKickoffAt?: string;
  readonly locale: string;
  readonly timeZone?: string;
  readonly referenceDate: number;
  readonly resultStateLabels: ResultStateLabels;
}

function resolveLanguageTag(locale: string): SupportedLanguage {
  const base = locale.split('-')[0] ?? 'en';
  return isSupportedLanguage(base) ? base : 'en';
}

export function LiveMatchHero({
  initial,
  streamPath,
  organizationAlias,
  tournamentAlias,
  localePrefix = '',
  versusLabel,
  openMatchLabel,
  clockLabels,
  usingLastKnownText,
  noMatchesText,
  nextKickoffText,
  nextKickoffAt,
  locale,
  timeZone,
  referenceDate,
  resultStateLabels,
}: LiveMatchHeroProps): React.JSX.Element {
  const language = resolveLanguageTag(locale);
  const [dashboard, setDashboard] = useState(initial);
  const [connectionStale, setConnectionStale] = useState(false);
  const enteringMatchIds = useEntryOnce(
    dashboard.matches.filter((match) => match.state === 'live').map((match) => match.matchId),
    initial.matches.filter((match) => match.state === 'live').map((match) => match.matchId),
  );

  useEffect(() => {
    const client = new RealtimeClient({ url: streamPath });
    void client.connect({
      onOpen: () => {
        setConnectionStale(false);
        setDashboard((current) => markConnected(current));
      },
      onFailure: () => setConnectionStale(true),
      onEvent: (event) => setDashboard((current) => applyEvent(current, event)),
      // The window passed; the page reloads rather than showing a partial
      // replay, which would be a score that is quietly wrong.
      onProjectionRequired: () => globalThis.location?.reload(),
    });
    return () => client.close();
  }, [streamPath]);

  return (
    <div>
      {dashboard.matches.length === 0 ? (
        <Card as="section">
          <CardTitle>{noMatchesText}</CardTitle>
          {nextKickoffAt && (
            <CardDescription>
              {nextKickoffText}:{' '}
              <ResponsiveTimestamp
                format="full"
                locale={locale}
                referenceDate={referenceDate}
                timestamp={nextKickoffAt}
                timeZone={timeZone}
              />
            </CardDescription>
          )}
          {(dashboard.usingLastKnown || connectionStale) && (
            <p className="cl-inline-alert" role="status">
              {usingLastKnownText}
            </p>
          )}
        </Card>
      ) : (
        <>
          {(dashboard.usingLastKnown || connectionStale) && (
            <p className="cl-inline-alert" role="status">
              {usingLastKnownText}
            </p>
          )}
          {/*
           * The same grid `MatchCardGrid` lays its cards out on. Without it these
           * were one full-width card per row, which wastes most of a desktop
           * viewport and reads nothing like the matches view beside it.
           */}
          <div className="cl-match-card-grid">
            {dashboard.matches.map((match) => {
              const badge = presentState(match.state, resultStateLabels);
              const reportUrl =
                organizationAlias && tournamentAlias
                  ? matchReportUrl({
                      organizationAlias,
                      tournamentAlias,
                      stageNumber: match.stageNumber,
                      matchNumber: match.stageOrdinal ?? match.matchNumber,
                      localePrefix,
                    })
                  : undefined;
              const fallbackClock =
                match.clock ??
                (match.clockSeconds !== undefined
                  ? {
                      segmentNumber: 1,
                      elapsedSeconds: match.clockSeconds,
                      running: false,
                      asOf: '',
                    }
                  : undefined);
              const cardClasses = [
                enteringMatchIds.has(match.matchId) ? 'cl-enter-once' : '',
                reportUrl ? 'cl-match-card--linked' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const homeName = match.sides[0]?.name ?? '';
              const awayName = match.sides[1]?.name ?? '';
              return (
                <Card
                  as="article"
                  aria-label={match.sides.map((side) => side.name).join(` ${versusLabel} `)}
                  className={cardClasses}
                  key={match.matchId}
                >
                  {reportUrl && (
                    <a
                      aria-label={applyTemplate(openMatchLabel, {
                        home: homeName,
                        away: awayName,
                      })}
                      className="cl-match-card__hit-area cl-focusable"
                      href={reportUrl}
                    />
                  )}
                  <Badge className={badge.className}>
                    {badge.state !== 'live' && <Icon name={badge.icon} size={16} />}
                    <span>{badge.label}</span>
                  </Badge>
                  {match.state === 'live' && (
                    <LiveMatchScoreboard
                      clock={fallbackClock}
                      labels={clockLabels}
                      lastUpdatedAt={dashboard.lastUpdatedAt}
                      locale={locale}
                      segmentLabel={activeSegmentLabel(match.segments, match.clock, language)}
                      segments={match.segments}
                      timeZone={timeZone}
                      usingLastKnown={dashboard.usingLastKnown || connectionStale}
                    />
                  )}
                  {/* Polite: a score arriving mid-sentence must not interrupt. */}
                  <div aria-live="polite">
                    {/*
                     * The same side-row treatment `MatchCard` composes. Written by
                     * hand as a bare `<p>` until a later pass, which put the name and the
                     * score on separate lines: `EntrantName` renders `display: block`
                     * so its ResizeObserver has a constrained box to measure, and a
                     * block element in a paragraph takes the whole line. The owned
                     * row is a flex line that gives the name the free space and keeps
                     * the score beside it.
                     */}
                    <ol className="cl-match-card__sides">
                      {match.sides.map((side) => (
                        <li className="cl-match-card__side" key={side.entrantId}>
                          <EntrantName abbreviation={side.abbreviation} fullName={side.name} />
                          <ValueFlash
                            className="cl-stat-tile__value cl-tabular-nums"
                            value={side.score}
                          />
                        </li>
                      ))}
                    </ol>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
