import { useEffect, useState } from 'react';

export interface PenaltyCountdownInput {
  readonly timerId: string;
  readonly entrantId: string;
  readonly remainingSeconds: number;
}

/**
 * Ticks the remaining time of each penalty once a second, from the moment this hook mounted. The
 * caller keys the component on the penalty snapshot, so a new set of timers mounts a fresh countdown
 * instead of carrying over one that belonged to earlier timers. Penalties that run out are dropped.
 */
export function usePenaltyCountdown<T extends PenaltyCountdownInput>(
  penalties: readonly T[],
): readonly (T & { readonly remaining: number })[] {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return penalties
    .map((penalty) => ({
      ...penalty,
      remaining: Math.max(0, Math.ceil(penalty.remainingSeconds - elapsedSeconds)),
    }))
    .filter((penalty) => penalty.remaining > 0);
}

/** "MM:SS" for a remaining time in seconds. */
export function formatPenaltyClock(remaining: number): string {
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** The key that changes when the penalty set does, so its countdown remounts. */
export function penaltySnapshotKey(penalties: readonly PenaltyCountdownInput[]): string {
  return penalties.map((penalty) => `${penalty.timerId}:${penalty.remainingSeconds}`).join(',');
}
