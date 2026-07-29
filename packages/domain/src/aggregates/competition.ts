import type { TournamentFormat } from '../descriptors/discipline-descriptor';

/**
 * Stage, Fixture, Match, and Segment. Stage/round/match numbers are scoped
 * sequential numbers — they are the identifiers that appear in URLs (never
 * UUIDs), per the URL/routing contract in copalibre-platform-architecture.md.
 */

export interface Stage {
  readonly stageId: string;
  readonly tournamentId: string;
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
  /** 1-based round number within the stage. */
  readonly round: number;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  readonly scheduledAt?: string;
}

export type MatchStatus = 'scheduled' | 'in-progress' | 'finalized';

export interface MatchSideScore {
  readonly entrantId: string;
  readonly score: number;
}

/** A calculated outcome. Only the audited correction workflow may supersede it. */
export interface MatchResult {
  readonly sides: readonly MatchSideScore[];
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
}
