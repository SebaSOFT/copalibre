import type { DisciplineDescriptor, Segment } from '@copalibre/domain';

export interface PublicMatchClock {
  readonly segmentNumber: number;
  readonly elapsedSeconds: number;
  readonly running: boolean;
  readonly asOf: string;
}

export interface ClockChangedPayload {
  readonly matchId: string;
  readonly segmentNumber: number;
  readonly elapsedSeconds: number;
  readonly running: boolean;
  readonly changedAt: string;
}

/**
 * A segment's elapsed time is never stored as a running countdown — only a
 * base `elapsedSeconds` plus, while the clock is active, when it started —
 * so two readers computing "right now" from the same row always agree, and
 * neither has to poll a value that changes every second on its own.
 */
export function elapsedSecondsOf(
  segment: { readonly elapsedSeconds?: number; readonly clockStartedAt?: string },
  now: number,
): number {
  const elapsed = segment.elapsedSeconds ?? 0;
  if (!segment.clockStartedAt) return elapsed;
  return elapsed + Math.max(0, Math.floor((now - Date.parse(segment.clockStartedAt)) / 1000));
}

export function isTimedSegment(
  descriptor: Pick<DisciplineDescriptor, 'segmentTypes'> | null | undefined,
  segmentTypeName: string,
): boolean {
  const segmentType = descriptor?.segmentTypes.find((type) => type.name === segmentTypeName);
  return segmentType?.timed !== false;
}

/**
 * Derives the public match clock from the active timed segment at `now`.
 * Untimed segments (e.g. sets played to a target) and matches without an
 * active segment produce `undefined`.
 */
export function publicClockOf(
  segments: readonly Pick<
    Segment,
    'number' | 'type' | 'state' | 'elapsedSeconds' | 'clockStartedAt'
  >[],
  descriptor: Pick<DisciplineDescriptor, 'segmentTypes'> | null | undefined,
  now: number,
): PublicMatchClock | undefined {
  const active = segments.find((segment) => segment.state === 'active');
  if (!active || !isTimedSegment(descriptor, active.type)) return undefined;

  return {
    segmentNumber: active.number,
    elapsedSeconds: elapsedSecondsOf(active, now),
    running: Boolean(active.clockStartedAt),
    asOf: new Date(now).toISOString(),
  };
}

/**
 * Builds the public `match.clock-changed` payload for a timed segment mutation,
 * or `undefined` when the segment type is declared untimed.
 */
export function clockChangedPayloadOf(
  matchId: string,
  segment: Pick<Segment, 'number' | 'type' | 'elapsedSeconds' | 'clockStartedAt'>,
  descriptor: Pick<DisciplineDescriptor, 'segmentTypes'> | null | undefined,
  now: number,
): ClockChangedPayload | undefined {
  if (!isTimedSegment(descriptor, segment.type)) return undefined;

  return {
    matchId,
    segmentNumber: segment.number,
    elapsedSeconds: elapsedSecondsOf(segment, now),
    running: Boolean(segment.clockStartedAt),
    changedAt: new Date(now).toISOString(),
  };
}
