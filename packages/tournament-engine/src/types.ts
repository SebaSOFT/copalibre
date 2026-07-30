import type { TournamentFormat } from '@copalibre/domain';

/**
 * Fixture-graph model shared by every format.
 *
 * Slots are declarative (`winner-of`/`loser-of` a match) rather than mutated
 * pointers, so advancement is recomputed from structure — which is what lets the
 * correction workflow (phase 0009) replay deterministically after a result is
 * superseded instead of unwinding imperative writes.
 */

export type BracketKind = 'winners' | 'losers' | 'grand-final' | 'round-robin';

/** Where a match's participant comes from. */
export type SlotSource =
  | { readonly kind: 'entrant'; readonly entrantId: string; readonly seed: number }
  /** A structural bye: the opposing slot advances unopposed. */
  | { readonly kind: 'bye' }
  | { readonly kind: 'winner-of'; readonly matchId: string }
  | { readonly kind: 'loser-of'; readonly matchId: string };

export interface GeneratedMatch {
  /** Deterministic, human-readable: `WB-R2-M1`, `LB-R3-M2`, `GF-R1-M1`, `RR-R1-M1`. */
  readonly id: string;
  readonly bracket: BracketKind;
  /** 1-based round within the bracket. */
  readonly round: number;
  /** 1-based position within the round. */
  readonly position: number;
  readonly slotA: SlotSource;
  readonly slotB: SlotSource;
  /** For round-robin home/away, which side is at home. Absent when not applicable. */
  readonly homeSlot?: 'A' | 'B';
  /**
   * Only present on double-elimination grand finals: generated conditionally,
   * played solely when the losers-bracket champion wins the first grand final.
   */
  readonly conditional?: 'bracket-reset';
}

export interface FixtureGraph {
  readonly format: TournamentFormat;
  readonly entrantCount: number;
  readonly matches: readonly GeneratedMatch[];
  /** Rounds per bracket, for UI layout (phase 0017 renders from this). */
  readonly rounds: readonly {
    readonly bracket: BracketKind;
    readonly round: number;
    readonly matchIds: readonly string[];
  }[];
}

export interface SeededEntrant {
  readonly entrantId: string;
  /** 1-based seed. Callers supply the order; the engine never invents seeds. */
  readonly seed: number;
}

export interface GenerateFixturesInput {
  readonly format: TournamentFormat;
  readonly entrants: readonly SeededEntrant[];
  /** Round-robin only: generate a second leg with sides reversed. */
  readonly homeAndAway?: boolean;
}
