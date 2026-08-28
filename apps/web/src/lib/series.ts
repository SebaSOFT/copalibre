/**
 * The series bar: won, current, still to play.
 *
 * A best-of-five is five segments whether or not five are played, because a bar
 * that grows as the series goes hides the thing a spectator wants to know —
 * how many are left.
 */

export type SegmentState = 'won-home' | 'won-away' | 'current' | 'upcoming' | 'not-required';

export interface SeriesInput {
  readonly bestOf: number;
  /** Game results in play order, `home` or `away`. */
  readonly results: readonly ('home' | 'away')[];
  readonly inProgress?: boolean;
  /**
   * Play-order numbers the series ended before reaching. Distinct from `upcoming`: a game that
   * will not be played is not a game that has not been played yet, and a spectator planning
   * their week needs to be able to tell them apart.
   */
  readonly notRequired?: readonly number[];
}

export function seriesSegments(input: SeriesInput): readonly SegmentState[] {
  const notRequired = new Set(input.notRequired ?? []);
  const segments: SegmentState[] = [];
  let played = 0;
  let currentPlaced = false;

  // Walked by position rather than built by concatenation, because an anulled game keeps its
  // own position: game five of a series decided in four is the fifth segment, not an extra one
  // on the end. A series decided in three does not grow a fourth segment either, because
  // somebody passed a longer history than the format allows — the walk stops at the span.
  for (let number = 1; number <= input.bestOf; number += 1) {
    if (notRequired.has(number)) {
      segments.push('not-required');
      continue;
    }
    const result = input.results[played];
    if (result !== undefined) {
      played += 1;
      segments.push(result === 'home' ? 'won-home' : 'won-away');
      continue;
    }
    if (input.inProgress === true && !currentPlaced) {
      currentPlaced = true;
      segments.push('current');
      continue;
    }
    segments.push('upcoming');
  }

  return segments;
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

/**
 * The shape a public projection reports a cross's series in.
 *
 * Deliberately side-relative rather than entrant-id-keyed: the server knows which entrant is
 * home and which is away, so it says `home`/`away` and nothing here matches ids.
 */
export interface PublicSeriesState {
  readonly span: number;
  readonly resolutionClass?: 'best-of' | 'aggregate' | 'points-per-leg';
  readonly games: readonly {
    readonly number: number;
    readonly status: 'scheduled' | 'in-progress' | 'finalized' | 'not-required';
    readonly winner?: 'home' | 'away';
    readonly scores?: readonly number[];
  }[];
  readonly homeGamesWon: number;
  readonly awayGamesWon: number;
  readonly aggregateScores?: readonly number[];
  readonly status: 'decided' | 'undecided' | 'finished-unresolved';
  readonly winner?: 'home' | 'away';
  readonly explanation: string;
}

/**
 * Maps a projection's series onto the bar's own input.
 *
 * Games are read in play order by number, never by finalization time: a game played late still
 * holds its own position, so a series whose third game was entered after its fourth still reads
 * as one, two, three, four.
 */
export function toSeriesInput(state: PublicSeriesState): SeriesInput {
  const ordered = [...state.games].sort((a, b) => a.number - b.number);
  return {
    bestOf: state.span,
    results: ordered.flatMap((game) => (game.winner === undefined ? [] : [game.winner])),
    inProgress: ordered.some((game) => game.status === 'in-progress'),
    notRequired: ordered
      .filter((game) => game.status === 'not-required')
      .map((game) => game.number),
  };
}

/**
 * Whether a series has settled on a side.
 *
 * A bracket must not show a winner for a cross that has not resolved, and a cross standing at
 * two games to one is not the same as one nobody has started — the score says so.
 */
export function seriesPending(state: PublicSeriesState): boolean {
  return state.status !== 'decided';
}
