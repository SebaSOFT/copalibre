import type { OverrideSet } from '../descriptors/override-policy.js';
import type { StageAllocation } from './stage-allocation.js';

/** Pins one exact descriptor version — rulesets never track "latest". */
export interface DescriptorRef {
  readonly descriptorId: string;
  /** Semver string; see DisciplineDescriptor.version. */
  readonly version: string;
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
  /**
   * Where this stage's seed order comes from. Absent means the caller
   * supplies the order, which is phase 7's original contract and remains valid
   * for a single-stage tournament.
   */
  readonly allocation?: StageAllocation;
}
