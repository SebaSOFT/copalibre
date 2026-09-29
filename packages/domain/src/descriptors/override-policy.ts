/**
 * Per-field configuration contracts, straight from the tournament-engine
 * decision record (chaos-vault, 2026-07-27): "Every configurable field states
 * whether it is inherited, replaced, merged by a defined strategy, or
 * forbidden to override. Unspecified deep merges are prohibited." and the
 * mutation classification "is a product contract, not merely UI guidance."
 */
import type { LocalizedLabel } from '../i18n-label.js';

/** Named merge strategies — the only merges the compiler will ever perform. */
export type MergeStrategyName = 'append-list' | 'union-list' | 'shallow-object';

export type OverridePermission =
  | { readonly kind: 'inherited' }
  | { readonly kind: 'replaced' }
  | { readonly kind: 'merged'; readonly strategy: MergeStrategyName }
  | { readonly kind: 'forbidden' };

export type MutationClass = 'safe' | 'requires_rebuild' | 'blocked_after_results';

/** Contract attached to one configurable field (addressed by dot-path). */
export interface FieldPolicy {
  readonly permission: OverridePermission;
  readonly mutationClass: MutationClass;
  /** Human-readable field name for display. Absent: callers derive one from the dot-path. */
  readonly label?: string | LocalizedLabel;
  /** What this field controls, in plain language. Optional: absent renders no explanation. */
  readonly description?: string | LocalizedLabel;
}

/** Dot-path (e.g. "scoring.pointsPerWin") → its policy. */
export type ConfigFieldPolicies = Readonly<Record<string, FieldPolicy>>;

/** Arbitrary JSON configuration tree the policies govern. */
export type RulesetConfig = Readonly<Record<string, unknown>>;

/** Dot-path → replacement/merge value, declared by a ruleset or stage. */
export type OverrideSet = Readonly<Record<string, unknown>>;
