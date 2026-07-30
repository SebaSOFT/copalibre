import type { RulesetConfig } from '../descriptors/override-policy.js';

/** Every configuration version a MatchRuleset was compiled from. */
export interface CompilationProvenance {
  readonly descriptorId: string;
  readonly descriptorVersion: number;
  readonly rulesetId?: string;
  readonly rulesetVersion?: number;
  readonly stageConfigurationId?: string;
  readonly stageConfigurationVersion?: number;
}

/**
 * The resolved, immutable configuration snapshot used to generate and operate
 * a match. Consumers receive it deep-frozen; the only way to change match
 * configuration is compiling a new snapshot from new versions.
 */
export interface MatchRuleset {
  readonly compiledFrom: CompilationProvenance;
  readonly config: RulesetConfig;
  readonly compiledAt: string;
}
