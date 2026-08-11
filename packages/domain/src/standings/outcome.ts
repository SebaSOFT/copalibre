import type { ActorGranularity } from '../statistics/hierarchies.js';

/**
 * What one person contributed to a side's figures (0016).
 *
 * The side's `statistics` are the totals; these are the rows they were folded
 * from, stored verbatim rather than recomputed later. A finalized result that
 * kept only the totals would answer "who scored?" by re-deriving it from an
 * event log that a correction may since have changed — so the per-person base
 * granularity is part of the result, not a query against it.
 */
export interface OutcomeContributor {
  readonly actorGranularity: ActorGranularity;
  readonly actorId: string;
  /** Values by collector code, at the granularity that collector declares. */
  readonly statistics: Readonly<Record<string, number>>;
}

export interface OutcomeSide {
  readonly entrantId: string;
  /** Values for the statistics the bound discipline declares, keyed by code. */
  readonly statistics: Readonly<Record<string, number>>;
  /** 1-based finishing position. Required for placement matches, absent for duels. */
  readonly placement?: number;
  /** Who produced them, at the finest granularity the collectors declare. */
  readonly contributors?: readonly OutcomeContributor[];
}

export interface RecordedOutcome {
  readonly matchId: string;
  readonly sides: readonly OutcomeSide[];
  /** Duel matches only; derivable from statistics via the win condition. */
  readonly winnerEntrantId?: string;
}
