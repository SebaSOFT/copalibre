import type { Attribution } from './attribution.js';
import type { EventDefinition } from './event-definition.js';
import type { ConfigFieldPolicies, RulesetConfig } from './override-policy.js';

/**
 * Reusable, versioned profile for a sport, esports title, or competition
 * discipline — the root of the configuration hierarchy
 * DisciplineDescriptor → TournamentRuleset → StageConfiguration → MatchRuleset.
 */

export type RuleScript = Record<string, unknown>;

export type ParticipantType = 'individual' | 'team';

/**
 * The formats the engine supports. The decision record's "must not advertise or
 * simulate support for formats outside this list" still holds — the list simply
 * grew, and it grew because the duel-only constraint was always about
 * *advancement* rather than about competition
 * (0011-placement-stage-format).
 */
export type TournamentFormat = DuelFormat | PlacementFormat;

/** Formats whose matches join exactly two sides and carry advancement edges. */
export type DuelFormat =
  | 'single-elimination'
  | 'double-elimination'
  | 'round-robin'
  | 'league'
  | 'round-robin-single-leg'
  | 'round-robin-home-away';

/**
 * Formats whose matches produce an ordering rather than a winner. They feed the
 * stage table and never another match: qualification is by result across every
 * heat, so winning a slow heat qualifies nobody.
 */
export type PlacementFormat = 'free-for-all' | 'heats';

export const DUEL_FORMATS: readonly DuelFormat[] = [
  'single-elimination',
  'double-elimination',
  'round-robin',
  'league',
  'round-robin-single-leg',
  'round-robin-home-away',
];

export const PLACEMENT_FORMATS: readonly PlacementFormat[] = ['free-for-all', 'heats'];

export const SUPPORTED_FORMATS: readonly TournamentFormat[] = [
  ...DUEL_FORMATS,
  ...PLACEMENT_FORMATS,
];

/**
 * @deprecated Read `DUEL_FORMATS` or `SUPPORTED_FORMATS` for what is meant. Kept
 * as the name the earlier phases wrote, now that "MVP" no longer distinguishes
 * anything.
 */
export const MVP_FORMATS: readonly TournamentFormat[] = DUEL_FORMATS;

export function isPlacementFormat(format: TournamentFormat): format is PlacementFormat {
  return (PLACEMENT_FORMATS as readonly string[]).includes(format);
}

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
  /**
   * Semver. Identifies a release, not a compatibility contract: profiles
   * declare capabilities rather than version ranges, so a new discipline
   * version never invalidates a profile
   * (0008-extensible-module-foundation).
   */
  readonly version: string;
  readonly name: string;
  /** Who authored this discipline, where it came from, under what licence. */
  readonly attribution: Attribution;
  readonly participantTypes: readonly ParticipantType[];
  readonly rosterConstraints: RosterConstraints;
  readonly segmentTypes: readonly SegmentTypeDefinition[];
  readonly eventDefinitions: readonly EventDefinition[];
  readonly statistics: readonly StatisticDefinition[];
  readonly scoringInputs: readonly ScoringInputDefinition[];
  readonly availableFormats: readonly TournamentFormat[];
  /** Stable identifiers of notification-rule capabilities the discipline permits. */
  readonly notificationRuleCapabilities: readonly string[];
  /**
   * How a match is won. Declared by the discipline; a tournament profile may
   * replace it only where `fieldPolicies['winCondition']` permits, so a timed
   * race can become a competition race where the discipline allows and cannot
   * where it does not.
   */
  readonly winCondition: RuleScript;
  /** Presentation hints for editors/consoles — never behavior. */
  readonly uiMetadata?: Readonly<Record<string, unknown>>;
  /** The configuration tree overrides act on. */
  readonly defaults: RulesetConfig;
  /** Per-dot-path override permission + mutation class for `defaults`. */
  readonly fieldPolicies: ConfigFieldPolicies;
}
