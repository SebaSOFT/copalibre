import type { TournamentFormat, SeriesDeclaration } from '@copalibre/domain';
import type { PlacementOptions } from './fixtures/placement.js';

/**
 * Fixture-graph model shared by every format.
 *
 * Slots are declarative (`winner-of`/`loser-of` a match) rather than mutated
 * pointers, so advancement is recomputed from structure — which is what lets the
 * correction workflow replay deterministically after a result is
 * superseded instead of unwinding imperative writes.
 */

export type BracketKind =
  'winners' | 'losers' | 'grand-final' | 'round-robin' | 'placement' | 'bracket-groups' | 'custom';

/** Where a match's participant comes from. */
export type SlotSource =
  | { readonly kind: 'entrant'; readonly entrantId: string; readonly seed: number }
  /** A structural bye: the opposing slot advances unopposed. */
  | { readonly kind: 'bye' }
  | { readonly kind: 'winner-of'; readonly matchId: string }
  | { readonly kind: 'loser-of'; readonly matchId: string }
  | { readonly kind: 'placement-top'; readonly matchId: string; readonly rank: number };

export interface GeneratedMatchBase {
  /** Deterministic, human-readable: `WB-R2-M1`, `LB-R3-M2`, `GF-R1-M1`, `RR-R1-M1`. */
  readonly id: string;
  readonly bracket: BracketKind;
  /** 1-based round within the bracket. */
  readonly round: number;
  /** 1-based position within the round. */
  readonly position: number;
  /** Optional human-readable label: e.g. "Upper Semifinal A", "Grand Final Reset". */
  readonly label?: string;
  /** Optional custom branch name: e.g. "consolation", "placement-3rd". */
  readonly branch?: string;
}

/** Two sides, a winner and a loser — the only shape advancement edges apply to. */
export interface DuelMatch extends GeneratedMatchBase {
  readonly shape: 'duel';
  readonly slotA: SlotSource;
  readonly slotB: SlotSource;
  /** For round-robin home/away, which side is at home. Absent when not applicable. */
  readonly homeSlot?: 'A' | 'B';
  /** 1-based match number within the fixture series (1..N). When omitted, represents match 1. */
  readonly matchNumber?: number;
  /** Series configuration if this match is part of a multi-match series. */
  readonly series?: SeriesDeclaration;
  /**
   * Only present on double-elimination grand finals: generated conditionally,
   * played solely when the losers-bracket champion wins the first grand final.
   */
  readonly conditional?: 'bracket-reset';
}

/**
 * N sides producing an ordering, not a winner: an FFA lobby, a swimming heat,
 * an athletics final. It feeds stage standings and nothing else — qualification
 * is by result across all heats, so "winner of heat 3" is not a thing a slot
 * may source from. Placement matches carry no advancement edges.
 */
export interface PlacementMatch extends GeneratedMatchBase {
  readonly shape: 'placement';
  readonly slots: readonly SlotSource[];
}

/**
 * Discriminated rather than a uniform `slots` array of length two: an FFA heat
 * has no winner and no home side, so `winner-of` and `homeSlot` would be
 * meaningless against it. The union makes the compiler enumerate every site
 * that must decide, instead of deferring an impossible arity to runtime.
 */
export type GeneratedMatch = DuelMatch | PlacementMatch;

export function isDuelMatch(match: GeneratedMatch): match is DuelMatch {
  return match.shape === 'duel';
}

export function isPlacementMatch(match: GeneratedMatch): match is PlacementMatch {
  return match.shape === 'placement';
}

/** Every slot a match sources from, in order, whatever its shape. */
export function slotsOf(match: GeneratedMatch): readonly SlotSource[] {
  return match.shape === 'duel' ? [match.slotA, match.slotB] : match.slots;
}

export interface FixtureGraph {
  readonly format: TournamentFormat;
  readonly entrantCount: number;
  readonly matches: readonly GeneratedMatch[];
  /** Rounds per bracket, for UI layout. */
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

export interface BracketGroupsOptions {
  readonly idPrefix?: string;
  readonly groupSize?: number;
  readonly seedingMethod?: 'snake' | 'sequential';
}

export type CustomBracketSlotSource =
  | { readonly kind: 'entrant'; readonly seed: number; readonly entrantId?: string }
  | { readonly kind: 'bye' }
  | { readonly kind: 'winner-of'; readonly matchId: string }
  | { readonly kind: 'loser-of'; readonly matchId: string };

export interface CustomBracketMatchDefinition {
  readonly id: string;
  readonly round: number;
  readonly position: number;
  readonly label?: string;
  readonly branch?: string;
  readonly slotA: CustomBracketSlotSource;
  readonly slotB: CustomBracketSlotSource;
  readonly series?: SeriesDeclaration;
}

export interface CustomBracketDefinition {
  readonly matches: readonly CustomBracketMatchDefinition[];
}

export interface FFABracketOptions {
  /** Capacity of each lobby (default 16). */
  readonly lobbySize?: number;
  /** Number of top finishers advancing from each lobby (default 4, must be < lobbySize). */
  readonly advancingCount?: number;
  /** Custom ID prefix for match identifiers (default 'FFA'). */
  readonly idPrefix?: string;
  /** Number of groups for ffa-bracket-groups format (default 2). */
  readonly groupCount?: number;
  /** Bracket stops once total advancing participants <= thresholdFinalists. */
  readonly thresholdFinalists?: number;
}

export interface GenerateFixturesInput {
  readonly format: TournamentFormat;
  readonly entrants: readonly SeededEntrant[];
  /** Round-robin only: generate a second leg with sides reversed. */
  readonly homeAndAway?: boolean;
  /** Placement formats only: rounds, lobby size, and the draw that fills them. */
  readonly placement?: PlacementOptions;
  /** Series configuration for multi-match fixtures. */
  readonly series?: SeriesDeclaration;
  /** Bracket groups (GSL dual tournament) configuration. */
  readonly bracketGroups?: BracketGroupsOptions;
  /** Custom bracket DAG configuration. */
  readonly customBracket?: CustomBracketDefinition;
  /** FFA elimination bracket configuration. */
  readonly ffaBracket?: FFABracketOptions;
  /** FFA league configuration. */
  readonly ffaLeague?: FFALeagueOptions;
}

export interface FFALeagueDivision {
  readonly divisionId: string;
  readonly name?: string;
  readonly entrants: readonly SeededEntrant[];
}

export interface FFALeagueOptions {
  /** Number of rounds (match weeks / game days) to generate (default 1). */
  readonly rounds?: number;
  /** Maximum lobby capacity (default 16). */
  readonly lobbySize?: number;
  /** Explicit division partitions. */
  readonly divisions?: readonly FFALeagueDivision[];
  /** Number of divisions to partition entrants into if divisions are not explicitly provided (default 1). */
  readonly divisionCount?: number;
  /** Custom ID prefix (default 'FFA-L'). */
  readonly idPrefix?: string;
}
