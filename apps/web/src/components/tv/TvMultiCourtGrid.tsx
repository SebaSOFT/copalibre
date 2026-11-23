import { rescheduledStatement } from '../../lib/reschedule.js';
import { measureSchedule, animateSchedule } from '../../lib/schedule-travel.js';
import { useEffect, useRef, useState } from 'react';
import { RealtimeClient } from '@copalibre/realtime';
import { isSupportedLanguage, type SupportedLanguage } from '@copalibre/domain';
import {
  applyEvent,
  markConnected,
  type LiveDashboard,
  type LiveMatch,
} from '../../lib/live-state.js';
import { activeSegmentLabel } from '../../lib/segment-label.js';
import { presentState, type ResultStateLabels } from '../../lib/result-state.js';
import { LiveMatchClock } from '../ui/atoms/LiveMatchClock.js';
import { ValueFlash } from '../ui/atoms/ValueFlash.js';
import { Icon } from '../ui/atoms/icon.js';
import { useHydrated, usePrefersReducedMotion } from '../../lib/island-browser-state.js';

const PAGE_ROTATE_MS = 20_000;

export type CourtGridSize = 2 | 4 | 6;

export interface TvMultiCourtGridProps {
  readonly initial: LiveDashboard;
  readonly locale?: string;
  readonly rescheduledLabel?: string;
  readonly streamPath: string;
  /** `matchId -> "Cancha 1"` — resolved once at page load from the matches-view endpoint, the only public projection that already carries a venue name per match. */
  readonly venueNameByMatchId: Readonly<Record<string, string>>;
  /** An explicit court count, or the live-match count clamped to the nearest supported size. */
  readonly gridSize?: CourtGridSize | 'auto';
  readonly resultStateLabels: ResultStateLabels;
  readonly noMatchesLabel: string;
  readonly ariaLabel: string;
  readonly clockStoppedLabel?: string;
  readonly clockAriaLabel?: string;
}

function resolveLanguageTag(locale: string): SupportedLanguage {
  const base = locale.split('-')[0] ?? 'en';
  return isSupportedLanguage(base) ? base : 'en';
}

function resolveGridSize(requested: CourtGridSize | 'auto', liveCount: number): CourtGridSize {
  if (requested !== 'auto') return requested;
  if (liveCount <= 2) return 2;
  if (liveCount <= 4) return 4;
  return 6;
}

/** A page of at most `pageSize` items, wrapping around — `pageIndex` may grow without bound as the rotation timer ticks; only its remainder ever matters. */
function paginate<T>(items: readonly T[], pageSize: number, pageIndex: number): readonly T[] {
  if (items.length <= pageSize) return items;
  const pageCount = Math.ceil(items.length / pageSize);
  const start = (pageIndex % pageCount) * pageSize;
  return items.slice(start, start + pageSize);
}

/**
 * The multi-court kiosk grid: several live matches at once,
 * each in its own card, independently reactive. Reuses this surface's
 * existing live-data mechanism verbatim — the same `RealtimeClient`,
 * `applyEvent`/`LiveDashboard`/`markConnected` every other live surface
 * already uses (see `LiveMatchHero.tsx`) — rather than a bespoke subscription;
 * a score or clock change on one court re-renders only that court's card by
 * construction, since `LiveDashboard.matches` is keyed by `matchId` and each
 * card is keyed the same way.
 */
export function TvMultiCourtGrid({
  initial,
  locale = 'en',
  rescheduledLabel,
  streamPath,
  venueNameByMatchId,
  gridSize = 'auto',
  resultStateLabels,
  noMatchesLabel,
  ariaLabel,
  clockStoppedLabel = '',
  clockAriaLabel = '{segment}, {time}',
}: TvMultiCourtGridProps): React.JSX.Element {
  const [dashboard, setDashboard] = useState<LiveDashboard>(initial);
  const [pageIndex, setPageIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const hydrated = useHydrated();
  // Read inside the SSE callback below, which must never close over a stale
  // `dashboard` from the render that first mounted it (the same pattern
  // `TvDashboard.tsx` uses its own `dashboardRef` for).
  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);

  const liveMatches = dashboard.matches
    .filter(
      (match) =>
        match.state === 'live' || (match.state === 'upcoming' && match.scheduledAt !== undefined),
    )
    .sort(
      (a, b) =>
        (a.venueName ?? venueNameByMatchId[a.matchId] ?? '').localeCompare(
          b.venueName ?? venueNameByMatchId[b.matchId] ?? '',
        ) || (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''),
    );
  const activeGridSize = resolveGridSize(gridSize, liveMatches.length);
  const visibleMatches = paginate(liveMatches, activeGridSize, pageIndex);

  useEffect(() => {
    const streamUrl = new URL(streamPath, window.location.origin);
    streamUrl.searchParams.set('surface', 'kiosk');
    const client = new RealtimeClient({ url: streamUrl.pathname + streamUrl.search });
    void client.connect({
      onOpen: () => setDashboard((current) => markConnected(current)),
      onEvent: (event) => {
        const positions = event.eventType === 'match.rescheduled' ? measureSchedule() : undefined;
        const next = applyEvent(dashboardRef.current, event);
        dashboardRef.current = next;
        if (positions) requestAnimationFrame(() => animateSchedule(positions));
        setDashboard(next);
      },
      // A replay-window-expired reload is the same recovery every other live
      // surface on this page takes — a partial-history replay would be a
      // wrong score shown as a right one.
      onProjectionRequired: () => globalThis.location?.reload(),
    });
    return () => {
      client.close();
    };
  }, [streamPath]);

  useEffect(() => {
    if (prefersReducedMotion || liveMatches.length <= activeGridSize) return;
    const timer = setInterval(() => setPageIndex((current) => current + 1), PAGE_ROTATE_MS);
    return () => clearInterval(timer);
  }, [prefersReducedMotion, liveMatches.length, activeGridSize]);

  if (visibleMatches.length === 0) {
    return (
      <div
        className="tv-multicourt-grid tv-multicourt-grid--empty"
        data-hydrated={hydrated ? '' : undefined}
      >
        <p>{noMatchesLabel}</p>
      </div>
    );
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`tv-multicourt-grid tv-multicourt-grid--${activeGridSize}`}
      data-hydrated={hydrated ? '' : undefined}
      data-testid="tv-multicourt-grid"
    >
      {visibleMatches.map((match) => (
        <CourtCard
          key={match.matchId}
          clockAriaLabel={clockAriaLabel}
          clockStoppedLabel={clockStoppedLabel}
          match={match}
          locale={locale}
          rescheduledLabel={rescheduledLabel}
          resultStateLabels={resultStateLabels}
          venueName={match.venueName ?? venueNameByMatchId[match.matchId]}
        />
      ))}
    </div>
  );
}

function CourtCard({
  match,
  locale,
  rescheduledLabel,
  venueName,
  resultStateLabels,
  clockStoppedLabel,
  clockAriaLabel,
}: {
  readonly match: LiveMatch;
  readonly locale: string;
  readonly rescheduledLabel?: string;
  readonly venueName: string | undefined;
  readonly resultStateLabels: ResultStateLabels;
  readonly clockStoppedLabel: string;
  readonly clockAriaLabel: string;
}): React.JSX.Element {
  const badge = presentState(match.state, resultStateLabels);
  const [home, away] = match.sides;
  const language = resolveLanguageTag(locale);
  const courtClock =
    match.state !== 'live'
      ? undefined
      : (match.clock ??
        (match.clockSeconds !== undefined
          ? {
              segmentNumber: 1,
              elapsedSeconds: match.clockSeconds,
              running: false,
              asOf: '',
            }
          : undefined));
  const segmentLabel = activeSegmentLabel(match.segments, match.clock, language);

  return (
    <article
      data-schedule-match={match.matchId}
      className="tv-court-card cl-chamfer"
      data-testid={`tv-court-card-${match.matchId}`}
    >
      {venueName !== undefined && <span className="tv-court-card__venue">{venueName}</span>}
      {match.rescheduledFrom && (
        <p className="tv-court-card__venue">
          {rescheduledStatement(match.rescheduledFrom, venueName, locale, rescheduledLabel)}
        </p>
      )}
      <div className="tv-court-card__score">
        <span className="tv-court-card__side">
          <span className="tv-court-card__name" title={home?.name}>
            {home?.abbreviation ?? home?.name ?? ''}
          </span>
          <ValueFlash className="tv-court-card__value" value={home?.score ?? 0} />
        </span>
        <span className="tv-court-card__side">
          <span className="tv-court-card__name" title={away?.name}>
            {away?.abbreviation ?? away?.name ?? ''}
          </span>
          <ValueFlash className="tv-court-card__value" value={away?.score ?? 0} />
        </span>
      </div>
      <div className="tv-court-card__footer">
        <span className={`tv-scorebug__badge tv-scorebug__badge--${badge.state}`}>
          {badge.state === 'live' ? (
            <span aria-hidden="true" className="cl-live-dot" />
          ) : (
            <Icon name={badge.icon} size={16} />
          )}
          <span>{badge.label}</span>
        </span>
        {(courtClock || segmentLabel) && (
          <LiveMatchClock
            className="tv-court-card__clock"
            clock={courtClock}
            labels={{
              clockStopped: clockStoppedLabel,
              clockAriaLabel,
            }}
            segmentLabel={segmentLabel}
            variant="tv"
          />
        )}
      </div>
    </article>
  );
}
