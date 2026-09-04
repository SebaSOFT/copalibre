import type { DescriptorRef } from '../rulesets/tournament-ruleset.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * `started` is a distinct status, not a derived "has a match begun?" predicate.
 * Modelling it as a transition gives one auditable moment to attach the start
 * validations to, and one clear condition for the module freeze.
 *
 * `archived` (TMS-014) is a fifth,
 * terminal state reachable only from `finished` — archival is a visibility
 * change, never a data change, so nothing about the module freeze or any
 * other `started`-gated behavior differs once a tournament reaches it.
 */
export type TournamentStatus = 'draft' | 'published' | 'started' | 'finished' | 'archived';

export interface Tournament {
  readonly tournamentId: string;
  readonly organizationId: string;
  /** Unique within its organization (Alias, scope 'tournament'). */
  readonly alias: string;
  readonly name: string;
  readonly disciplineRef: DescriptorRef;
  readonly rulesetId?: string;
  readonly status: TournamentStatus;
  /** Set when the tournament starts; discipline and profile versions freeze from here. */
  readonly startedAt?: string;
  /** Set when the tournament is archived; absent until then. */
  readonly archivedAt?: string;
  /** Profile this tournament instantiated, pinned at start. */
  readonly profileRef?: { readonly profileId: string; readonly version: string };
}

/** A started tournament's modules are frozen; see canChangeModuleVersion. */
export function hasStarted(tournament: Tournament): boolean {
  return (
    tournament.status === 'started' ||
    tournament.status === 'finished' ||
    tournament.status === 'archived'
  );
}

/**
 * The lifecycle's legal transitions, one linear path plus the
 * terminal archival step. Each key lists exactly what it may become next —
 * a tournament earlier than `finished` cannot reach `archived` in one step,
 * which is the state machine's own enforcement of "archive only what is
 * actually done," not a separate check layered on top.
 */
const LEGAL_TRANSITIONS: Readonly<Record<TournamentStatus, readonly TournamentStatus[]>> = {
  draft: ['published'],
  published: ['started'],
  started: ['finished'],
  finished: ['archived'],
  archived: [],
};

export class TournamentTransitionError extends DomainError {
  readonly code = 'TOURNAMENT_TRANSITION_ILLEGAL';
}

export function canTransitionTournament(from: TournamentStatus, to: TournamentStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * Validates a requested transition, reporting exactly why an illegal one is
 * refused rather than leaving the caller to reconstruct the reason from a
 * boolean.
 */
export function transitionTournament(
  from: TournamentStatus,
  to: TournamentStatus,
): Result<TournamentStatus, TournamentTransitionError> {
  if (!canTransitionTournament(from, to)) {
    return err(
      new TournamentTransitionError(`Cannot transition a tournament from "${from}" to "${to}"`, {
        from,
        to,
      }),
    );
  }
  return ok(to);
}

export type PublicTournamentStatus = 'upcoming' | 'live' | 'finished';

/**
 * Derives a tournament's public-facing status from its lifecycle state
 * and recorded match statuses. A tournament where every match is finalized
 * is classified as 'finished', consistent across organization home and tournament overview.
 */
export function deriveTournamentStatus(
  status: TournamentStatus | string,
  matches: readonly { readonly status?: string; readonly state?: string }[] = [],
): PublicTournamentStatus {
  if (status === 'finished' || status === 'archived') {
    return 'finished';
  }
  if (
    matches.length > 0 &&
    matches.every((m) => m.status === 'finalized' || m.status === 'finished' || m.state === 'final')
  ) {
    return 'finished';
  }
  if (
    status === 'started' ||
    matches.some(
      (m) =>
        m.status === 'in-progress' ||
        m.status === 'live' ||
        m.state === 'live' ||
        m.status === 'finalized' ||
        m.state === 'final',
    )
  ) {
    return 'live';
  }
  return 'upcoming';
}
