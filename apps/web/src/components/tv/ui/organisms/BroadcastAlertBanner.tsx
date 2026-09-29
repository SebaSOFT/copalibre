import { useEffect, useRef, useState } from 'react';
import type { TvMatchEvent } from '../../../../lib/tv-match-events.js';

/**
 * One live event queued for the broadcast overlay's animated callout
 * (openspec 0300). `kind` is generic and discipline-agnostic — `scoring` when
 * the affected match's score changed as a result of this event, `notable`
 * for everything else (cards, fouls, substitutions, or whatever else the
 * installed discipline records) — never a hardcoded goal/card distinction.
 */
export interface BroadcastAlertItem {
  readonly event: TvMatchEvent;
  readonly kind: 'scoring' | 'notable';
}

type Phase = 'idle' | 'entering' | 'showing' | 'exiting' | 'gap';

const ENTER_MS = 400;
const EXIT_MS = 300;
const GAP_MS = 500;
const SHOW_MS: Readonly<Record<BroadcastAlertItem['kind'], number>> = {
  scoring: 5500,
  notable: 4000,
};

/**
 * The overlay's animated event-alert callout. A caller (`TvDashboard.tsx`)
 * pushes items into `queue`; this component shows them one at a time through
 * an enter/show/exit lifecycle, with a short gap between alerts, and calls
 * `onConsumed` once an item has finished its full lifecycle so the caller can
 * drop it from `queue`. Renders nothing while idle with an empty queue — an
 * overlay with no live events shows no banner at all, never a placeholder.
 */
export function BroadcastAlertBanner({
  queue,
  onConsumed,
  homeLabel,
  awayLabel,
  prefersReducedMotion = false,
}: {
  readonly queue: readonly BroadcastAlertItem[];
  readonly onConsumed: (eventId: string) => void;
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly prefersReducedMotion?: boolean;
}): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('idle');
  const onConsumedRef = useRef(onConsumed);
  useEffect(() => {
    onConsumedRef.current = onConsumed;
  });

  // While animating (entering/showing/exiting), `queue[0]` is by construction
  // the item this state machine is displaying: the only thing that ever
  // removes it is this same effect's own 'exiting' step, via `onConsumed`.
  // No separate "current item" state to keep in sync. Nothing renders during
  // 'idle' or 'gap' — the pause between alerts shows the next one early
  // otherwise, if `queue[0]` already points past the one that just finished.
  const isAnimating = phase === 'entering' || phase === 'showing' || phase === 'exiting';
  const current = isAnimating ? queue[0] : undefined;
  const currentEventId = current?.event.eventId;
  const currentKind = current?.kind;
  const hasPending = queue.length > 0;

  useEffect(() => {
    // Every transition below fires from inside the timer callback, never
    // synchronously in the effect body — an effect that set state directly
    // here would just be mirroring `queue`/`phase` into more state.
    if (phase === 'idle') {
      if (!hasPending) return undefined;
      const timer = setTimeout(() => setPhase('entering'), 0);
      return () => clearTimeout(timer);
    }
    if (phase === 'gap') {
      const timer = setTimeout(() => setPhase('idle'), GAP_MS);
      return () => clearTimeout(timer);
    }
    if (currentEventId === undefined || currentKind === undefined) return undefined;

    if (phase === 'entering') {
      const timer = setTimeout(() => setPhase('showing'), ENTER_MS);
      return () => clearTimeout(timer);
    }
    if (phase === 'showing') {
      const timer = setTimeout(() => setPhase('exiting'), SHOW_MS[currentKind]);
      return () => clearTimeout(timer);
    }
    // phase === 'exiting'
    const timer = setTimeout(() => {
      onConsumedRef.current(currentEventId);
      setPhase('gap');
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase, hasPending, currentEventId, currentKind]);

  if (!current) return null;

  const { event, kind } = current;

  return (
    <div
      aria-live="polite"
      className={`tv-broadcast-alert tv-broadcast-alert--${kind} tv-broadcast-alert--${phase} cl-chamfer`}
      data-reduced-motion={prefersReducedMotion ? '' : undefined}
      role="status"
    >
      <span className="tv-broadcast-alert__label">{event.label}</span>
      {event.side !== undefined && (
        <span className="tv-broadcast-alert__side">
          {event.side === 'home' ? homeLabel : awayLabel}
        </span>
      )}
      {event.actor !== undefined && (
        <span className="tv-broadcast-alert__actor">{event.actor}</span>
      )}
    </div>
  );
}
