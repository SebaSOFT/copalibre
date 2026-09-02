import type { Attribution } from './attribution.js';
import type { EventDefinition } from './event-definition.js';
import type { StatisticCollector } from '../statistics/collector.js';
import type { TagDeclaration } from '../statistics/tags.js';
import type { ConfigFieldPolicies, RulesetConfig } from './override-policy.js';
import type { TableLayoutDefinition } from './table-layout.js';
import type { LocalizedLabel } from '../i18n-label.js';
import type { ObjectReference } from '@copalibre/object-storage';
import type { SeriesDeclaration } from '../aggregates/series.js';

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
 * *advancement* rather than about competition.
 */
export type TournamentFormat = DuelFormat | PlacementFormat;

/** Formats whose matches join exactly two sides and carry advancement edges. */
export type DuelFormat =
  | 'single-elimination'
  | 'double-elimination'
  | 'round-robin'
  | 'league'
  | 'round-robin-single-leg'
  | 'round-robin-home-away'
  | 'bracket-groups'
  | 'gauntlet';

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
  'bracket-groups',
  'gauntlet',
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
export const MVP_FORMATS: readonly TournamentFormat[] = [
  'single-elimination',
  'double-elimination',
  'round-robin',
  'league',
  'round-robin-single-leg',
  'round-robin-home-away',
];

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
  readonly label: string | LocalizedLabel;
  readonly timed: boolean;
  readonly defaultDurationSeconds?: number;
}

export interface StatisticDefinition {
  readonly code: string;
  readonly label: string | LocalizedLabel;
  readonly aggregation: 'sum' | 'count' | 'max' | 'min' | 'average';
  /** What this statistic counts, in competition terms. Optional: absent renders no explanation. */
  readonly description?: string | LocalizedLabel;
}

/**
 * A finishing position and what it is worth.
 *
 * Battle-royale scoring is conventionally placement points plus performance
 * points. The performance half is discipline-specific and already covered —
 * `frags` is a declared statistic that the accounting model aggregates. The
 * placement half is structural: every placement discipline needs a mapping from
 * finishing position to points, and none of them expresses it differently.
 */
export interface PlacementPoints {
  /** 1-based finishing position. */
  readonly placement: number;
  readonly points: number;
}

export interface ScoringInputDefinition {
  readonly code: string;
  readonly label: string | LocalizedLabel;
  readonly source: 'event-derived' | 'operator-entered';
  /** What this input does to the score, in competition terms. Optional: absent renders no explanation. */
  readonly description?: string | LocalizedLabel;
}

/**
 * A tactical/positional tag a match roster member may carry — a goalkeeper,
 * a captain, a designated hitter, a jungler. Never core-hardcoded: which
 * roles exist and what each one means belongs to the discipline, the same
 * way `tags` and `statistics` do. A sport with no exclusive roster roles
 * (an eight-lane heat) simply declares none.
 */
export interface RosterRoleDeclaration {
  readonly code: string;
  readonly label: string | LocalizedLabel;
  /** Short tactile-console badge text, e.g. `'GK'`, `'C'`. Falls back to `code` when absent. */
  readonly badge?: string;
}

export interface DisciplineDescriptor {
  readonly descriptorId: string;
  /** Stable catalogue identity, unique with `version` within an installation. */
  readonly alias: string;
  /**
   * Semver. Identifies a release, not a compatibility contract: profiles
   * declare capabilities rather than version ranges, so a new discipline
   * version never invalidates a profile.
   */
  readonly version: string;
  readonly name: string | LocalizedLabel;
  readonly description?: string | LocalizedLabel;
  /** Optional public background images stored by opaque object reference. */
  readonly images?: readonly ObjectReference[];
  /** Who authored this discipline, where it came from, under what licence. */
  readonly attribution: Attribution;
  readonly participantTypes: readonly ParticipantType[];
  readonly rosterConstraints: RosterConstraints;
  readonly segmentTypes: readonly SegmentTypeDefinition[];
  readonly eventDefinitions: readonly EventDefinition[];
  readonly statistics: readonly StatisticDefinition[];
  /**
   * Declared aggregations over the competition and actor hierarchies.
   * Absent on a descriptor written before collectors existed, which stays valid:
   * a discipline that declares none simply answers no statistic question beyond
   * what a result records.
   */
  readonly collectors?: readonly StatisticCollector[];
  /**
   * Labels a granularity on either hierarchy may carry — suspended, captain,
   * under review through declared tagging. Absent means the discipline
   * declares none; a collector's `requiresTag` must name one declared here.
   */
  readonly tags?: readonly TagDeclaration[];
  /**
   * Roster roles a match roster member may carry — see `RosterRoleDeclaration`.
   * Absent means the discipline declares none; a `MatchRosterMember.roles`
   * entry and a `roster-role-snapshot` effect's `role` must both name one
   * declared here.
   */
  readonly rosterRoles?: readonly RosterRoleDeclaration[];
  /**
   * Standard tables and rankings this discipline declares — group standings,
   * top scorers, goalkeeper rankings, and the like. A tournament ruleset may
   * replace this set (`fieldPolicies['tableLayouts']`); absent means the
   * discipline offers no standard tables beyond the standings engine's own
   * declared statistics.
   */
  readonly tableLayouts?: readonly TableLayoutDefinition[];
  readonly scoringInputs: readonly ScoringInputDefinition[];
  /**
   * Points awarded by finishing position in a placement match, and the code the
   * award is recorded under. Absent for a discipline that never places.
   */
  readonly placementScoring?: {
    /** The declared statistic the points are recorded as. */
    readonly statisticCode: string;
    readonly table: readonly PlacementPoints[];
    /** Points for a position the table does not name. Defaults to 0. */
    readonly beyondTable?: number;
  };
  readonly availableFormats: readonly TournamentFormat[];
  /**
   * A discipline's own explanation of what a format it lists in
   * `availableFormats` does during its competition — a discipline that calls
   * `single-elimination` a "cup draw" explains it in those terms. Absent for a
   * format resolves to the platform's own catalogued description instead.
   */
  readonly formatDescriptions?: Readonly<
    Partial<Record<TournamentFormat, string | LocalizedLabel>>
  >;
  /** Stable identifiers of notification-rule capabilities the discipline permits. */
  readonly notificationRuleCapabilities: readonly string[];
  /**
   * How a match is won. Declared by the discipline; a tournament profile may
   * replace it only where `fieldPolicies['winCondition']` permits, so a timed
   * race can become a competition race where the discipline allows and cannot
   * where it does not.
   */
  readonly winCondition: RuleScript;
  /** Optional default series configuration for competitions under this discipline. */
  readonly series?: SeriesDeclaration;
  /** Presentation hints for editors/consoles — never behavior. */
  readonly uiMetadata?: Readonly<Record<string, unknown>>;
  /** The configuration tree overrides act on. */
  readonly defaults: RulesetConfig;
  /** Per-dot-path override permission + mutation class for `defaults`. */
  readonly fieldPolicies: ConfigFieldPolicies;
}

/**
 * A submitted or catalogued discipline document before an installation assigns
 * its local UUIDv7. Persistent descriptors always carry `descriptorId`.
 */
export type DisciplineDescriptorDocument = Omit<DisciplineDescriptor, 'descriptorId'>;
