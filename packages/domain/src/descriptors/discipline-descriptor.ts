import type { EventDefinition } from './event-definition.js';
import type { ConfigFieldPolicies, RulesetConfig } from './override-policy.js';

/**
 * Reusable, versioned profile for a sport, esports title, or competition
 * discipline — the root of the configuration hierarchy
 * DisciplineDescriptor → TournamentRuleset → StageConfiguration → MatchRuleset.
 */

export type ParticipantType = 'individual' | 'team';

/**
 * The six MVP formats. "The engine must not advertise or simulate support for
 * formats outside this list." (tournament-engine decision record.)
 */
export type TournamentFormat =
  | 'single-elimination'
  | 'double-elimination'
  | 'round-robin'
  | 'league'
  | 'round-robin-single-leg'
  | 'round-robin-home-away';

export const MVP_FORMATS: readonly TournamentFormat[] = [
  'single-elimination',
  'double-elimination',
  'round-robin',
  'league',
  'round-robin-single-leg',
  'round-robin-home-away',
];

export interface RosterConstraints {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly maxSubstitutes?: number;
  readonly allowMidTournamentChanges?: boolean;
}

/** A discipline-declared match subdivision unit — never a closed enum. */
export interface SegmentTypeDefinition {
  readonly name: string;
  readonly label: string;
  readonly timed: boolean;
  readonly defaultDurationSeconds?: number;
}

export interface StatisticDefinition {
  readonly code: string;
  readonly label: string;
  readonly aggregation: 'sum' | 'count' | 'max' | 'min' | 'average';
}

export interface ScoringInputDefinition {
  readonly code: string;
  readonly label: string;
  readonly source: 'event-derived' | 'operator-entered';
}

export interface DisciplineDescriptor {
  readonly descriptorId: string;
  readonly version: number;
  readonly name: string;
  readonly participantTypes: readonly ParticipantType[];
  readonly rosterConstraints: RosterConstraints;
  readonly segmentTypes: readonly SegmentTypeDefinition[];
  readonly eventDefinitions: readonly EventDefinition[];
  readonly statistics: readonly StatisticDefinition[];
  readonly scoringInputs: readonly ScoringInputDefinition[];
  readonly availableFormats: readonly TournamentFormat[];
  /** Stable identifiers of notification-rule capabilities the discipline permits. */
  readonly notificationRuleCapabilities: readonly string[];
  /** Presentation hints for editors/consoles — never behavior. */
  readonly uiMetadata?: Readonly<Record<string, unknown>>;
  /** The configuration tree overrides act on. */
  readonly defaults: RulesetConfig;
  /** Per-dot-path override permission + mutation class for `defaults`. */
  readonly fieldPolicies: ConfigFieldPolicies;
}
