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
import { nextTvMatches } from '../../lib/tv-match-list.js';
import { tvTournamentState, type TvTournamentState } from '../../lib/tv-statistics.js';
import { formatTimestamp } from '../../lib/format-timestamp.js';
import { applyTemplate } from '../../lib/matches-view.js';
import { LiveMatchClock } from '../ui/atoms/LiveMatchClock.js';
import { ValueFlash } from '../ui/atoms/ValueFlash.js';
import { Icon } from '../ui/atoms/icon.js';
import { useHydrated, usePrefersReducedMotion } from '../../lib/island-browser-state.js';
import { TvStartTime } from './ui/atoms/TvStartTime.js';
import { tvStatusToneClass } from './ui/atoms/tv-status-tone.js';

const PAGE_ROTATE_MS = 20_000;
/** The header's clock and the "next" comparison both move on this cadence. */
const CLOCK_TICK_MS = 30_000;

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
  /** The tournament's name, heading the kiosk header. */
  readonly tournamentName?: string;
  /** The tournament badge's text while matches are final and none is live. */
  readonly inProgressLabel: string;
  /** "Página {page} de {total}", shown while the grid rotates. */
  readonly pageOfLabel: string;
  readonly timeZone?: string;
}

/** One tile per court: its live match, else its next match. */
export interface CourtTile {
  readonly court: string;
  readonly match: LiveMatch;
  readonly live: boolean;
}

/**
 * The court tiles of a venue screen. A match without a court gets no tile, and a court with neither
 * a live nor a future match gets none. Live courts come first.
 */
export function courtTilesOf(
  matches: readonly LiveMatch[],
  venueNameByMatchId: Readonly<Record<string, string>>,
  now: number,
): readonly CourtTile[] {
  const byCourt = new Map<string, LiveMatch[]>();
  for (const match of matches) {
    const court = match.venueName ?? venueNameByMatchId[match.matchId];
    if (court === undefined) continue;
    byCourt.set(court, [...(byCourt.get(court) ?? []), match]);
  }
  const tiles: CourtTile[] = [];
  for (const [court, courtMatches] of byCourt) {
    const live = courtMatches.find((match) => match.state === 'live');
    if (live) {
      tiles.push({ court, match: live, live: true });
      continue;
    }
    const next = nextTvMatches(courtMatches, now, 1)[0];
    if (next) tiles.push({ court, match: next, live: false });
  }
  return tiles.sort((a, b) => Number(b.live) - Number(a.live) || a.court.localeCompare(b.court));
}

function resolveLanguageTag(locale: string): SupportedLanguage {
  const base = locale.split('-')[0] ?? 'en';
  return isSupportedLanguage(base) ? base : 'en';
}

/** The requested size, grown to the next supported size when the live courts need more tiles. */
function resolveGridSize(requested: CourtGridSize | 'auto', liveCount: number): CourtGridSize {
  const needed: CourtGridSize = liveCount <= 2 ? 2 : liveCount <= 4 ? 4 : 6;
  if (requested === 'auto') return needed;
  return requested >= needed ? requested : needed;
}

/**
 * The tiles on screen for one page. Live courts stay on every page; only the slots they leave free
 * rotate. A grid all live courts fill rotates among those courts instead.
 */
function visibleTiles(
  tiles: readonly CourtTile[],
  size: CourtGridSize,
  pageIndex: number,
): { readonly shown: readonly CourtTile[]; readonly pageCount: number } {
  const live = tiles.filter((tile) => tile.live);
  const rest = tiles.filter((tile) => !tile.live);
  if (live.length >= size) {
    return {
      shown: paginate(live, size, pageIndex),
      pageCount: Math.ceil(live.length / size),
    };
  }
  const free = size - live.length;
  return {
    shown: [...live, ...paginate(rest, free, pageIndex)],
    pageCount: Math.max(1, Math.ceil(rest.length / free)),
  };
}

function badgeTypeOf(
  state: TvTournamentState,
  liveCount: number,
): 'live' | 'in-progress' | 'upcoming' | 'final' {
  if (liveCount > 0) return 'live';
  if (state === 'finished') return 'final';
  if (state === 'inProgress') return 'in-progress';
  return 'upcoming';
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
  tournamentName,
  inProgressLabel,
  pageOfLabel,
  timeZone,
}: TvMultiCourtGridProps): React.JSX.Element {
  const [dashboard, setDashboard] = useState<LiveDashboard>(initial);
  const [pageIndex, setPageIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [clockText, setClockText] = useState('');
  const prefersReducedMotion = usePrefersReducedMotion();
  const hydrated = useHydrated();
  // Read inside the SSE callback below, which must never close over a stale
  // `dashboard` from the render that first mounted it (the same pattern
  // `TvDashboard.tsx` uses its own `dashboardRef` for).
  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);

  const tiles = courtTilesOf(dashboard.matches, venueNameByMatchId, now);
  const liveCount = tiles.filter((tile) => tile.live).length;
  const activeGridSize = resolveGridSize(gridSize, liveCount);
  const { shown, pageCount } = visibleTiles(tiles, activeGridSize, pageIndex);
  const tournamentState = tvTournamentState(dashboard.matches);
  const badgeType = badgeTypeOf(tournamentState, liveCount);
  const badgeLabel =
    badgeType === 'in-progress'
      ? inProgressLabel
      : resultStateLabels[
          badgeType === 'live' ? 'live' : badgeType === 'final' ? 'final' : 'upcoming'
        ];

  useEffect(() => {
    const tick = (): void => {
      setNow(Date.now());
      setClockText(formatTimestamp(new Date(), { locale, format: 'time-only', timeZone }));
    };
    tick();
    const timer = setInterval(tick, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [locale, timeZone]);

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
    if (prefersReducedMotion || pageCount <= 1) return;
    const timer = setInterval(() => setPageIndex((current) => current + 1), PAGE_ROTATE_MS);
    return () => clearInterval(timer);
  }, [prefersReducedMotion, pageCount]);

  const header = (
    <header className="tv-multicourt__header">
      <span className="tv-multicourt__title">{tournamentName}</span>
      <span className={`tv-scorebug__badge ${tvStatusToneClass(badgeType)}`}>
        <span>{badgeLabel}</span>
      </span>
      <span className="tv-multicourt__clock">{clockText}</span>
    </header>
  );

  if (shown.length === 0) {
    return (
      <div className="tv-multicourt" data-hydrated={hydrated ? '' : undefined}>
        {header}
        <div className="tv-multicourt-grid tv-multicourt-grid--empty">
          <p>{noMatchesLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-multicourt" data-hydrated={hydrated ? '' : undefined}>
      {header}
      <div
        aria-label={ariaLabel}
        className={`tv-multicourt-grid tv-multicourt-grid--${activeGridSize}`}
        data-hydrated={hydrated ? '' : undefined}
        data-testid="tv-multicourt-grid"
      >
        {shown.map((tile) => (
          <CourtCard
            key={tile.court}
            clockAriaLabel={clockAriaLabel}
            clockStoppedLabel={clockStoppedLabel}
            match={tile.match}
            locale={locale}
            now={now}
            rescheduledLabel={rescheduledLabel}
            resultStateLabels={resultStateLabels}
            timeZone={timeZone}
            venueName={tile.court}
          />
        ))}
      </div>
      {pageCount > 1 && (
        <p className="tv-multicourt__pager">
          {applyTemplate(pageOfLabel, {
            page: (pageIndex % pageCount) + 1,
            total: pageCount,
          })}
        </p>
      )}
    </div>
  );
}

function CourtCard({
  match,
  locale,
  now,
  rescheduledLabel,
  venueName,
  resultStateLabels,
  clockStoppedLabel,
  clockAriaLabel,
  timeZone,
}: {
  readonly match: LiveMatch;
  readonly locale: string;
  readonly now: number;
  readonly rescheduledLabel?: string;
  readonly venueName: string | undefined;
  readonly resultStateLabels: ResultStateLabels;
  readonly clockStoppedLabel: string;
  readonly clockAriaLabel: string;
  readonly timeZone?: string;
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
      {match.state === 'upcoming' && match.scheduledAt !== undefined ? (
        <div className="tv-court-card__score">
          <span className="tv-court-card__side">
            <span className="tv-court-card__name" title={home?.name}>
              {home?.name ?? ''}
            </span>
          </span>
          <span className="tv-court-card__side">
            <span className="tv-court-card__name" title={away?.name}>
              {away?.name ?? ''}
            </span>
          </span>
          <TvStartTime
            locale={locale}
            referenceDate={now}
            scheduledAt={match.scheduledAt}
            {...(timeZone === undefined ? {} : { timeZone })}
          />
        </div>
      ) : (
        <div className="tv-court-card__score">
          <span className="tv-court-card__side">
            <span className="tv-court-card__name" title={home?.name}>
              {home?.name ?? ''}
            </span>
            <ValueFlash className="tv-court-card__value" value={home?.score ?? 0} />
          </span>
          <span className="tv-court-card__side">
            <span className="tv-court-card__name" title={away?.name}>
              {away?.name ?? ''}
            </span>
            <ValueFlash className="tv-court-card__value" value={away?.score ?? 0} />
          </span>
        </div>
      )}
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
