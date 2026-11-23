import { useEffect, useState } from 'react';
import { useHydrated } from '../../../lib/island-browser-state.js';
import type { LiveMatchClock as LiveMatchClockState } from '../../../lib/live-state.js';
import { applyTemplate, formatClock } from '../../../lib/matches-view.js';

export interface LiveMatchClockLabels {
  readonly clockStopped: string;
  readonly clockAriaLabel: string;
}

export interface LiveMatchClockProps {
  readonly clock?: LiveMatchClockState;
  readonly segmentLabel?: string;
  readonly labels: LiveMatchClockLabels;
  readonly variant: 'public' | 'tv';
  readonly className?: string;
}

const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | undefined;

function subscribeTick(listener: () => void): () => void {
  subscribers.add(listener);
  if (subscribers.size === 1 && intervalId === undefined) {
    intervalId = setInterval(() => {
      for (const notify of subscribers) notify();
    }, 1000);
  }
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0 && intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  };
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Live match game-clock atom.
 *
 * Server render and the first client render both print `formatClock(clock.elapsedSeconds)` verbatim
 * so hydration never disagrees. Once hydrated, running clocks share one page-level 1-second timer
 * (`setInterval` active only while at least one running clock is mounted) and advance by elapsed
 * monotonic time since the snapshot arrived. Paused clocks never subscribe.
 */
export function LiveMatchClock({
  clock,
  segmentLabel,
  labels,
  variant,
  className = '',
}: LiveMatchClockProps): React.JSX.Element | null {
  const hydrated = useHydrated();
  const clockKey =
    clock === undefined
      ? ''
      : `${clock.segmentNumber}:${clock.elapsedSeconds}:${clock.running}:${clock.asOf}`;
  const isRunning = Boolean(clock?.running);
  const [tick, setTick] = useState<{ readonly key: string; readonly elapsed: number } | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!hydrated || !isRunning || !clockKey) return undefined;
    const baseAt = nowMs();
    return subscribeTick(() => {
      setTick({
        key: clockKey,
        elapsed: Math.max(0, Math.floor((nowMs() - baseAt) / 1000)),
      });
    });
  }, [hydrated, isRunning, clockKey]);

  const variantClass = variant === 'tv' ? 'cl-live-clock--tv' : 'cl-live-clock--public';
  const classes = ['cl-live-clock', variantClass, className].filter(Boolean).join(' ');

  if (clock === undefined) {
    if (!segmentLabel) return null;
    return (
      <span className={classes}>
        <span className="cl-live-clock__segment">{segmentLabel}</span>
      </span>
    );
  }

  const extraSeconds = hydrated && clock.running && tick?.key === clockKey ? tick.elapsed : 0;
  const formattedTime = formatClock(clock.elapsedSeconds + extraSeconds);
  const ariaLabel = segmentLabel
    ? applyTemplate(labels.clockAriaLabel, { segment: segmentLabel, time: formattedTime })
    : formattedTime;

  return (
    <span aria-label={ariaLabel} className={classes} role="timer">
      {segmentLabel && <span className="cl-live-clock__segment">{segmentLabel}</span>}
      <span className="cl-live-clock__digits">{formattedTime}</span>
      {!clock.running && <span className="cl-live-clock__stopped">{labels.clockStopped}</span>}
    </span>
  );
}
