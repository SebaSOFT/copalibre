import type { OverrideSet } from '../descriptors/override-policy.js';

/** Pins one exact descriptor version — rulesets never track "latest". */
export interface DescriptorRef {
  readonly descriptorId: string;
  readonly version: number;
}

/**
 * Tournament-level configuration: selects a versioned discipline descriptor
 * and declares only the overrides the descriptor's field policies permit.
 */
export interface TournamentRuleset {
  readonly rulesetId: string;
  readonly tournamentId: string;
  readonly version: number;
  readonly descriptorRef: DescriptorRef;
  readonly overrides: OverrideSet;
}

/** Stage-level refinement of a tournament ruleset for one competition phase. */
export interface StageConfiguration {
  readonly stageConfigurationId: string;
  readonly stageId: string;
  readonly version: number;
  readonly rulesetId: string;
  readonly overrides: OverrideSet;
}
