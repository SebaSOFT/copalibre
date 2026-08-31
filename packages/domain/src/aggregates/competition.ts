import type { OutcomeSide } from '../standings/outcome.js';
import type { TournamentFormat } from '../descriptors/discipline-descriptor.js';

/**
 * Stage, Fixture, Match, and Segment. Stage/round/match numbers are scoped
 * sequential numbers — they are the identifiers that appear in URLs (never
 * UUIDs), per the URL/routing contract in copalibre-platform-architecture.md.
 */

export interface Stage {
  readonly stageId: string;
  /**
   * The edition this stage belongs to. It was the tournament until then,
   * which is the season collapsed into the competition that repeats — and which
   * made "what did we play in 2025" answerable only by filtering on a name.
   */
  readonly seasonId: string;
  /** 1-based sequential number within the tournament. */
  readonly number: number;
  readonly name: string;
  readonly format: TournamentFormat;
  readonly stageConfigurationId?: string;
}

/** A generated pairing slot within a stage's structure. */
export interface Fixture {
  readonly fixtureId: string;
  readonly stageId: string;
  readonly zoneId?: string;
  readonly groupId?: string;
  /** 1-based round number within the stage. */
  readonly round: number;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
}

export type MatchStatus = 'scheduled' | 'in-progress' | 'finalized' | 'not-required';

/**
 * One side of a stored result. It carries the statistic values the
 * discipline declared rather than a single scalar, and the codes are stored
 * verbatim: a finished tournament's standings stay readable after the module
 * version that defined them is retired.
 */
export type MatchSideScore = OutcomeSide;

/**
 * A calculated outcome. Only the audited correction workflow may supersede it.
 * Any number of sides — a duel and an eight-lane heat are the same document.
 */
export interface MatchResult {
  readonly sides: readonly MatchSideScore[];
  /** Duel matches only; a placement result orders its sides instead. */
  readonly winnerEntrantId?: string;
  readonly recordedAt: string;
}

export interface Match {
  readonly matchId: string;
  readonly fixtureId: string;
  /** 1-based sequential number within the stage. */
  readonly number: number;
  readonly status: MatchStatus;
  readonly result?: MatchResult;
}

/**
 * A discipline-declared match subdivision. `type` is validated against the
 * active DisciplineDescriptor's segment-type registry — never a closed enum.
 */
export interface Segment {
  readonly segmentId: string;
  readonly matchId: string;
  readonly type: string;
  /** 1-based sequential number within the match. */
  readonly number: number;
  readonly state: 'pending' | 'active' | 'completed';
  /** Accumulated elapsed time persisted by the authoritative match clock. */
  readonly elapsedSeconds?: number;
  /** Present only while this segment's authoritative clock is running. */
  readonly clockStartedAt?: string;
}

/** A person named to a match's roster for one entrant, tactile-console-facing. */
export interface MatchRosterMember {
  readonly personId: string;
  /** Shirt number; not always numeric (e.g. '00', '7B'). */
  readonly number?: number | string;
  readonly name: string;
  /** Snapshotted at roster-selection time, alongside `number`/`name`/`roles`/`onField`. */
  readonly nationality?: string;
  /**
   * Codes naming discipline-declared `RosterRoleDeclaration`s this member
   * carries this match — a goalkeeper, a captain, a designated hitter.
   * Never a closed enum here: which roles exist and what they mean is the
   * discipline's to declare (`DisciplineDescriptor.rosterRoles`), the same
   * way an event or statistic code is. Zero, one, or several — nothing here
   * is mutually exclusive unless the discipline's own rules make it so.
   * Distinct from `PlayerRole` (person.ts), which names a person's
   * season-long team membership rather than a tactical designation for one
   * match.
   */
  readonly roles?: readonly string[];
  /**
   * Whether this member is currently in play. Seeded at roster creation from
   * starter/substitute status, then kept current by folding `substitution`
   * events — the single source of truth for who can be tactile-targeted
   * right now, so nothing needs a separate starter/substitute classification
   * that could drift from it after a substitution.
   */
  readonly onField: boolean;
}

export interface MatchRoster {
  readonly matchId: string;
  readonly entrantId: string;
  readonly members: readonly MatchRosterMember[];
}
