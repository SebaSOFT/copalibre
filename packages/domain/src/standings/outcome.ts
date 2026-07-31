export interface OutcomeSide {
  readonly entrantId: string;
  /** Values for the statistics the bound discipline declares, keyed by code. */
  readonly statistics: Readonly<Record<string, number>>;
  /** 1-based finishing position. Required for placement matches, absent for duels. */
  readonly placement?: number;
}

export interface RecordedOutcome {
  readonly matchId: string;
  readonly sides: readonly OutcomeSide[];
  /** Duel matches only; derivable from statistics via the win condition. */
  readonly winnerEntrantId?: string;
}
