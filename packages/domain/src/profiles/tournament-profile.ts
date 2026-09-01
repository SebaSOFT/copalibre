import type { CapabilityRequirement } from '../capabilities/capability.js';
import type { Attribution } from '../descriptors/attribution.js';
import type { OverrideSet } from '../descriptors/override-policy.js';
import type { RuleScript } from '../descriptors/discipline-descriptor.js';
import type { TournamentFormat } from '../descriptors/discipline-descriptor.js';
import type { LocalizedLabel } from '../i18n-label.js';

/**
 * A reusable, publishable tournament configuration.
 *
 * Where a `TournamentRuleset` configures one tournament, a profile is the
 * artifact an author publishes and any number of tournaments instantiate — the
 * second module kind alongside `DisciplineDescriptor`.
 *
 * A profile does not name a discipline version. It declares the capabilities it
 * consumes, and binding resolves those against whatever discipline it is used
 * with (see capabilities/binder.ts).
 */

/** How a stage of the competition is shaped. */
export interface ProfileStage {
  /** 1-based order within the profile. */
  readonly number: number;
  readonly name: string;
  readonly format: TournamentFormat;
  /** Overrides applied to the discipline's defaults for this stage. */
  readonly overrides?: OverrideSet;
}

/** Ordered comparator chain, referencing capability names rather than raw codes. */
export interface ProfileTiebreak {
  /** Capability name resolved through the binding at compile time. */
  readonly capability: string;
  readonly label: string | LocalizedLabel;
  readonly direction: 'higher_wins' | 'lower_wins';
  readonly missingValue: 'treat-as-worst' | 'treat-as-zero' | 'invalid';
  readonly scope?: 'overall' | 'head-to-head' | 'match-losses';
}

export interface TournamentProfileDocument {
  /** Stable catalogue identity, unique with `version` within an installation. */
  readonly alias: string;
  /** Semver: a release identifier, not a compatibility contract. */
  readonly version: string;
  readonly name: string | LocalizedLabel;
  readonly description?: string | LocalizedLabel;
  readonly attribution: Attribution;
  readonly requires: readonly CapabilityRequirement[];
  readonly stages: readonly ProfileStage[];
  readonly points: { readonly win: number; readonly draw: number; readonly loss: number };
  readonly tiebreak: readonly ProfileTiebreak[];
  /**
   * Replacement win condition, permitted only where the discipline's field
   * policy marks its own win condition overridable (timed race vs competition
   * race). Absent means the discipline's win condition stands.
   */
  readonly winConditionOverride?: RuleScript;
}

/** A profile installed locally, with its installation-specific UUIDv7. */
export interface TournamentProfile extends TournamentProfileDocument {
  readonly profileId: string;
}
