import type { ActorGranularity } from '../statistics/hierarchies.js';

/**
 * What one person contributed to a side's figures.
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

/**
 * Why a side's result is what it is. Independent per side: a
 * free-for-all's disqualified competitor and its normally-finishing rest each
 * carry their own reason, because the outcome was already per-entrant before
 * this field existed. Absent (or `played`) means an ordinarily played result
 * — every result recorded before this field existed reads this way.
 */
export type ResultReason =
  | 'played'
  | 'administrative-loss'
  | 'walkover'
  | 'forfeit-abandonment'
  | 'disqualified'
  | 'did-not-finish';

export interface OutcomeSide {
  readonly entrantId: string;
  /** Values for the statistics the bound discipline declares, keyed by code. */
  readonly statistics: Readonly<Record<string, number>>;
  /** 1-based finishing position. Required for placement matches, absent for duels. */
  readonly placement?: number;
  /** Who produced them, at the finest granularity the collectors declare. */
  readonly contributors?: readonly OutcomeContributor[];
  /** Absent means an ordinarily played result. */
  readonly resultReason?: ResultReason;
}

export interface RecordedOutcome {
  readonly matchId: string;
  readonly sides: readonly OutcomeSide[];
  /** Duel matches only; derivable from statistics via the win condition. */
  readonly winnerEntrantId?: string;
  /**
   * The fixture this match belongs to. How the accounting engine groups a
   * series' matches back into the one result they contribute — never by
   * parsing `matchId`, which is an opaque UUIDv7 for a persisted match.
   * Absent only for an outcome a caller assembled without a fixture to name;
   * every outcome the persistence layer reads carries it.
   */
  readonly fixtureId?: string;
}
