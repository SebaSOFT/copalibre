import type { DescriptorRef } from '../rulesets/tournament-ruleset';

export type TournamentStatus = 'draft' | 'published';

export interface Tournament {
  readonly tournamentId: string;
  readonly organizationId: string;
  /** Unique within its organization (Alias, scope 'tournament'). */
  readonly alias: string;
  readonly name: string;
  readonly disciplineRef: DescriptorRef;
  readonly rulesetId?: string;
  readonly status: TournamentStatus;
}
