import type { DescriptorRef } from '../rulesets/tournament-ruleset.js';

/**
 * `started` is a distinct status, not a derived "has a match begun?" predicate.
 * Modelling it as a transition gives one auditable moment to attach the start
 * validations to, and one clear condition for the module freeze
 * (0008-extensible-module-foundation).
 */
export type TournamentStatus = 'draft' | 'published' | 'started' | 'finished';

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
  /** Profile this tournament instantiated, pinned at start. */
  readonly profileRef?: { readonly profileId: string; readonly version: string };
}

/** A started tournament's modules are frozen; see canChangeModuleVersion. */
export function hasStarted(tournament: Tournament): boolean {
  return tournament.status === 'started' || tournament.status === 'finished';
}
