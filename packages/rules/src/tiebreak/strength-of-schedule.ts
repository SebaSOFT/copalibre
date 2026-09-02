/**
 * Strength-of-schedule (SoS) reducers for tournament tiebreaking:
 * - Buchholz (sum of opponent points)
 * - Scoped Buchholz (opponent points filtered by direct outcome)
 * - Median-Buchholz (Buchholz with highest and lowest opponent scores trimmed)
 * - Sonneborn-Berger / Neustadtl (sum of defeated opponent points + 0.5 * drawn opponent points)
 */

export type OpponentMatchOutcome = 'win' | 'draw' | 'loss' | 'forfeit';

export interface OpponentScore {
  readonly opponentId: string;
  readonly points: number;
  readonly outcome?: OpponentMatchOutcome;
}

export interface MedianBuchholzOptions {
  readonly cutLowest?: number;
  readonly cutHighest?: number;
}

export interface MedianBuchholzResult {
  readonly score: number;
  readonly trimmedLowest: readonly number[];
  readonly trimmedHighest: readonly number[];
  readonly remainingScores: readonly number[];
}

/**
 * Standard Buchholz: sum of all opponents' stage points.
 */
export function computeBuchholz(opponents: readonly OpponentScore[]): number {
  return opponents.reduce((sum, opp) => sum + opp.points, 0);
}

/**
 * Scoped Buchholz: sum of points of opponents against whom the entrant won, drew, or lost.
 */
export function computeScopedBuchholz(
  opponents: readonly OpponentScore[],
  filter: 'win' | 'draw' | 'loss',
): number {
  return opponents
    .filter((opp) => opp.outcome === filter)
    .reduce((sum, opp) => sum + opp.points, 0);
}

/**
 * Median-Buchholz: drops the highest and lowest scoring opponents before summing.
 * Default: cuts 1 lowest and 1 highest score.
 */
export function computeMedianBuchholz(
  opponents: readonly OpponentScore[],
  options: MedianBuchholzOptions = {},
): MedianBuchholzResult {
  const cutLowest = options.cutLowest ?? 1;
  const cutHighest = options.cutHighest ?? 1;

  const sorted = [...opponents.map((o) => o.points)].sort((a, b) => a - b);

  if (sorted.length <= cutLowest + cutHighest) {
    return {
      score: 0,
      trimmedLowest: sorted.slice(0, cutLowest),
      trimmedHighest: sorted.slice(sorted.length - cutHighest),
      remainingScores: [],
    };
  }

  const trimmedLowest = sorted.slice(0, cutLowest);
  const trimmedHighest = sorted.slice(sorted.length - cutHighest);
  const remainingScores = sorted.slice(cutLowest, sorted.length - cutHighest);
  const score = remainingScores.reduce((sum, val) => sum + val, 0);

  return {
    score,
    trimmedLowest,
    trimmedHighest,
    remainingScores,
  };
}

/**
 * Sonneborn-Berger / Neustadtl: sum of points of defeated opponents plus half of drawn opponents.
 */
export function computeSonnebornBerger(opponents: readonly OpponentScore[]): number {
  let score = 0;
  for (const opp of opponents) {
    if (opp.outcome === 'win') {
      score += opp.points;
    } else if (opp.outcome === 'draw') {
      score += 0.5 * opp.points;
    }
  }
  return score;
}
