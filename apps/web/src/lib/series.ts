/**
 * The series bar (0021): won, current, still to play.
 *
 * A best-of-five is five segments whether or not five are played, because a bar
 * that grows as the series goes hides the thing a spectator wants to know —
 * how many are left.
 */

export type SegmentState = 'won-home' | 'won-away' | 'current' | 'upcoming';

export interface SeriesInput {
  readonly bestOf: number;
  /** Game results in play order, `home` or `away`. */
  readonly results: readonly ('home' | 'away')[];
  readonly inProgress?: boolean;
}

export function seriesSegments(input: SeriesInput): readonly SegmentState[] {
  const segments: SegmentState[] = input.results.map((winner) =>
    winner === 'home' ? 'won-home' : 'won-away',
  );

  if (input.inProgress === true && segments.length < input.bestOf) segments.push('current');
  while (segments.length < input.bestOf) segments.push('upcoming');

  // A series decided in three does not grow a fourth segment because somebody
  // passed a longer history than the format allows.
  return segments.slice(0, input.bestOf);
}

export function seriesScore(input: SeriesInput): { readonly home: number; readonly away: number } {
  return {
    home: input.results.filter((winner) => winner === 'home').length,
    away: input.results.filter((winner) => winner === 'away').length,
  };
}

/** Whether the series is over: someone reached the majority. */
export function seriesDecided(input: SeriesInput): boolean {
  const { home, away } = seriesScore(input);
  return Math.max(home, away) > Math.floor(input.bestOf / 2);
}
