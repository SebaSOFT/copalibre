import { useEffect, useRef, useState } from 'react';
import { RealtimeClient } from '@copalibre/realtime';
import {
  applyEvent,
  markConnected,
  type LiveDashboard,
  type LiveMatch,
} from '../../lib/live-state.js';
import { formatClock } from '../../lib/matches-view.js';
import { presentState, type ResultStateLabels } from '../../lib/result-state.js';

const PAGE_ROTATE_MS = 20_000;
const PULSE_MS = 1_200;

export type CourtGridSize = 2 | 4 | 6;

export interface TvMultiCourtGridProps {
  readonly initial: LiveDashboard;
  readonly streamPath: string;
  /** `matchId -> "Cancha 1"` — resolved once at page load from the matches-view endpoint, the only public projection that already carries a venue name per match. */
  readonly venueNameByMatchId: Readonly<Record<string, string>>;
  /** An explicit court count, or the live-match count clamped to the nearest supported size. */
  readonly gridSize?: CourtGridSize | 'auto';
  readonly resultStateLabels: ResultStateLabels;
  readonly noMatchesLabel: string;
  readonly ariaLabel: string;
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

function totalScore(match: LiveMatch): number {
  return match.sides.reduce((sum, side) => sum + side.score, 0);
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
  streamPath,
  venueNameByMatchId,
  gridSize = 'auto',
  resultStateLabels,
  noMatchesLabel,
  ariaLabel,
}: TvMultiCourtGridProps): React.JSX.Element {
  const [dashboard, setDashboard] = useState<LiveDashboard>(initial);
  const [pageIndex, setPageIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  // Seeded from the initial dashboard, not empty — otherwise the first real
  // SSE event would have nothing to diff against and never pulse.
  const previousScores = useRef<Record<string, number>>(
    Object.fromEntries(initial.matches.map((match) => [match.matchId, totalScore(match)])),
  );
  const [pulsingMatchIds, setPulsingMatchIds] = useState<ReadonlySet<string>>(new Set());
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Read inside the SSE callback below, which must never close over a stale
  // `dashboard` from the render that first mounted it (the same pattern
  // `TvDashboard.tsx` uses its own `dashboardRef` for).
  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);

  const liveMatches = dashboard.matches.filter((match) => match.state === 'live');
  const activeGridSize = resolveGridSize(gridSize, liveMatches.length);
  const visibleMatches = paginate(liveMatches, activeGridSize, pageIndex);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent): void => setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener?.('change', handler);
    return () => mediaQuery.removeEventListener?.('change', handler);
  }, []);

  useEffect(() => {
    const streamUrl = new URL(streamPath, window.location.origin);
    streamUrl.searchParams.set('surface', 'kiosk');
    const client = new RealtimeClient({ url: streamUrl.pathname + streamUrl.search });
    void client.connect({
      onOpen: () => setDashboard((current) => markConnected(current)),
      onEvent: (event) => {
        // A pure recompute, not a reactive effect on the state it produces —
        // the diff that decides which cards pulse happens once, right where
        // the change that causes it actually arrives.
        const next = applyEvent(dashboardRef.current, event);
        setDashboard(next);

        const changed = new Set<string>();
        for (const match of next.matches) {
          const score = totalScore(match);
          const previous = previousScores.current[match.matchId];
          if (previous !== undefined && previous !== score) changed.add(match.matchId);
          previousScores.current[match.matchId] = score;
        }
        if (changed.size > 0) {
          setPulsingMatchIds(changed);
          clearTimeout(pulseTimer.current);
          pulseTimer.current = setTimeout(() => setPulsingMatchIds(new Set()), PULSE_MS);
        }
      },
      // A replay-window-expired reload is the same recovery every other live
      // surface on this page takes — a partial-history replay would be a
      // wrong score shown as a right one.
      onProjectionRequired: () => globalThis.location?.reload(),
    });
    return () => {
      client.close();
      clearTimeout(pulseTimer.current);
    };
  }, [streamPath]);

  useEffect(() => {
    if (prefersReducedMotion || liveMatches.length <= activeGridSize) return;
    const timer = setInterval(() => setPageIndex((current) => current + 1), PAGE_ROTATE_MS);
    return () => clearInterval(timer);
  }, [prefersReducedMotion, liveMatches.length, activeGridSize]);

  if (visibleMatches.length === 0) {
    return (
      <div className="tv-multicourt-grid tv-multicourt-grid--empty">
        <p>{noMatchesLabel}</p>
      </div>
    );
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`tv-multicourt-grid tv-multicourt-grid--${activeGridSize}`}
      data-testid="tv-multicourt-grid"
    >
      {visibleMatches.map((match) => (
        <CourtCard
          key={match.matchId}
          match={match}
          pulsing={pulsingMatchIds.has(match.matchId)}
          resultStateLabels={resultStateLabels}
          venueName={venueNameByMatchId[match.matchId]}
        />
      ))}
    </div>
  );
}

function CourtCard({
  match,
  venueName,
  pulsing,
  resultStateLabels,
}: {
  readonly match: LiveMatch;
  readonly venueName: string | undefined;
  readonly pulsing: boolean;
  readonly resultStateLabels: ResultStateLabels;
}): React.JSX.Element {
  const badge = presentState(match.state, resultStateLabels);
  const [home, away] = match.sides;

  return (
    <article className="tv-court-card cl-chamfer" data-testid={`tv-court-card-${match.matchId}`}>
      {venueName !== undefined && <span className="tv-court-card__venue">{venueName}</span>}
      <div
        className={
          pulsing ? 'tv-court-card__score tv-court-card__score--pulse' : 'tv-court-card__score'
        }
      >
        <span className="tv-court-card__side">
          <span className="tv-court-card__name" title={home?.name}>
            {home?.abbreviation ?? home?.name ?? ''}
          </span>
          <span className="tv-court-card__value">{home?.score ?? 0}</span>
        </span>
        <span className="tv-court-card__side">
          <span className="tv-court-card__name" title={away?.name}>
            {away?.abbreviation ?? away?.name ?? ''}
          </span>
          <span className="tv-court-card__value">{away?.score ?? 0}</span>
        </span>
      </div>
      <div className="tv-court-card__footer">
        <span className={`tv-scorebug__badge tv-scorebug__badge--${badge.state}`}>
          <span aria-hidden="true">{badge.icon}</span>
          <span>{badge.label}</span>
        </span>
        {match.clockSeconds !== undefined && (
          <span className="tv-court-card__clock">{formatClock(match.clockSeconds)}</span>
        )}
      </div>
    </article>
  );
}
