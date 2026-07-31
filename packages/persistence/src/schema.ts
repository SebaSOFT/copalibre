import type { ColumnType, JSONColumnType } from 'kysely';

/**
 * CopaLibre relational schema — snake_case columns/tables per the
 * naming-conventions decision; packages/persistence owns the entire
 * camelCase-domain-to-snake_case-column mapping (each repository maps its
 * aggregate explicitly, no auto-conversion plugin hiding the boundary).
 *
 * Aggregate payloads that the domain layer owns structurally (descriptor
 * documents, override sets, rosters, event payloads) are stored as jsonb next
 * to extracted, indexed identity/version columns.
 */

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface OrganizationsTable {
  organization_id: string;
  alias: string;
  name: string;
  created_at: Timestamp;
}

export interface ClubsTable {
  club_id: string;
  organization_id: string;
  name: string;
  created_at: Timestamp;
}

export interface DisciplineDescriptorsTable {
  descriptor_id: string;
  /** Semver text, not an integer: see 0008-extensible-module-foundation. */
  version: string;
  name: string;
  /** Full DisciplineDescriptor JSON document (domain-validated). */
  document: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
}

export interface TournamentRulesetsTable {
  ruleset_id: string;
  tournament_id: string;
  /** Ruleset revisions stay integer: internal, not a published artifact. */
  version: number;
  descriptor_id: string;
  descriptor_version: string;
  overrides: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
}

export interface StageConfigurationsTable {
  stage_configuration_id: string;
  stage_id: string;
  version: number;
  ruleset_id: string;
  overrides: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
}

export interface TournamentsTable {
  tournament_id: string;
  organization_id: string;
  alias: string;
  name: string;
  descriptor_id: string;
  descriptor_version: string;
  ruleset_id: string | null;
  status: string;
  /** Set when the tournament starts; module versions freeze from then on. */
  started_at: Timestamp | null;
  profile_id: string | null;
  profile_version: string | null;
  created_at: Timestamp;
}

export interface ParticipantsTable {
  participant_id: string;
  organization_id: string;
  alias: string | null;
  display_name: string;
  participant_type: string;
  created_at: Timestamp;
}

export interface TeamsTable {
  team_id: string;
  organization_id: string;
  club_id: string | null;
  name: string;
  created_at: Timestamp;
}

export interface RostersTable {
  roster_id: string;
  team_id: string;
  members: JSONColumnType<readonly Record<string, unknown>[]>;
  created_at: Timestamp;
}

export interface EntrantsTable {
  entrant_id: string;
  tournament_id: string;
  entrant_kind: string;
  participant_id: string | null;
  team_id: string | null;
  seed: number | null;
  status: string;
  created_at: Timestamp;
}

export interface EntrantAttributesTable {
  entrant_attribute_id: string;
  entrant_id: string;
  tournament_id: string;
  key: string;
  kind: string;
  /** Populated for a categorical attribute; null for a numeric one. */
  value_text: string | null;
  /** Populated for a numeric attribute; null for a categorical one. */
  value_numeric: number | null;
  created_at: Timestamp;
}

export interface StagesTable {
  stage_id: string;
  tournament_id: string;
  number: number;
  name: string;
  format: string;
  stage_configuration_id: string | null;
  created_at: Timestamp;
}

export interface FixturesTable {
  fixture_id: string;
  stage_id: string;
  round: number;
  home_entrant_id: string | null;
  away_entrant_id: string | null;
  scheduled_at: Timestamp | null;
  created_at: Timestamp;
}

export interface VenuesTable {
  venue_id: string;
  organization_id: string;
  alias: string;
  name: string;
  concurrent_capacity: number;
  address: string | null;
  created_at: Timestamp;
}

export interface OfficialsTable {
  official_id: string;
  organization_id: string;
  display_name: string;
  roles: JSONColumnType<readonly string[]>;
  created_at: Timestamp;
}

export interface FixtureSchedulesTable {
  fixture_schedule_id: string;
  fixture_id: string;
  venue_id: string | null;
  /** Epoch milliseconds. Read back as a string by pg's bigint mapping. */
  starts_at: string;
  duration_minutes: number;
  published: boolean;
  created_at: Timestamp;
}

export interface FixtureScheduleOfficialsTable {
  fixture_schedule_id: string;
  official_id: string;
}

export interface MatchesTable {
  match_id: string;
  fixture_id: string;
  number: number;
  status: string;
  result: JSONColumnType<Record<string, unknown>> | null;
  created_at: Timestamp;
}

export interface SegmentsTable {
  segment_id: string;
  match_id: string;
  segment_type: string;
  number: number;
  state: string;
  created_at: Timestamp;
}

/** Append-only: rows are never updated or deleted (corrections supersede). */
export interface MatchEventsTable {
  event_id: string;
  match_id: string;
  segment_id: string;
  definition_code: string;
  occurred_at: Timestamp;
  sequence: number;
  side: string | null;
  participant_id: string | null;
  payload: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
}

/** Who takes the field for one entrant in one match (0014). */
export interface MatchLineupsTable {
  match_id: string;
  entrant_id: string;
  participant_ids: JSONColumnType<readonly string[]>;
  updated_at: Timestamp;
}

/**
 * A match-operating appointment (0014). Exactly one of `match_id`/`stage_id` is
 * set, enforced by a check constraint: a grant covers what it names, and a
 * stage grant resolves down to its matches.
 */
export interface MatchAssignmentsTable {
  assignment_id: string;
  organization_id: string;
  subject_id: string;
  match_id: string | null;
  stage_id: string | null;
  capabilities: JSONColumnType<readonly string[]>;
  created_at: Timestamp;
}

export interface AuditLogTable {
  audit_id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  authorization_context: string;
  previous_state: JSONColumnType<Record<string, unknown>> | null;
  resulting_state: JSONColumnType<Record<string, unknown>> | null;
  reason: string | null;
  occurred_at: Timestamp;
}

/**
 * Transactional outbox. Columns mirror the SSE envelope fields the events
 * tier (phase 0010) emits in camelCase — the mapping lives here, per the
 * architecture doc's SSE contract section.
 */
export interface OutboxEventsTable {
  event_id: string;
  organization_id: string;
  stream: string;
  entity_id: string;
  event_type: string;
  projection_version: number;
  payload: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
  consumed_at: Timestamp | null;
}

export interface EventCursorsTable {
  cursor_id: string;
  consumer: string;
  last_event_id: string;
  updated_at: Timestamp;
}

export interface ProjectionVersionsTable {
  projection_id: string;
  projection_type: string;
  entity_id: string;
  version: number;
  published_at: Timestamp | null;
  updated_at: Timestamp;
}

export interface TournamentProfilesTable {
  profile_id: string;
  /** Semver text. */
  version: string;
  name: string;
  /** Full TournamentProfile JSON document. */
  document: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
}

/**
 * Compiled effective ruleset plus its resolved capability binding, persisted so
 * a finished competition is readable with the modules that produced it deleted.
 */
export interface CompiledRulesetsTable {
  compiled_ruleset_id: string;
  tournament_id: string;
  stage_id: string | null;
  descriptor_id: string;
  descriptor_version: string;
  profile_id: string | null;
  profile_version: string | null;
  config: JSONColumnType<Record<string, unknown>>;
  binding: JSONColumnType<Record<string, unknown>> | null;
  compiled_at: Timestamp;
}

/** Materialised standings written as each match is finalised. */
export interface MaterialisedStandingsTable {
  standings_id: string;
  tournament_id: string;
  stage_id: string;
  /** Match whose finalisation produced this snapshot. */
  match_id: string;
  rows: JSONColumnType<readonly Record<string, unknown>[]>;
  trace: JSONColumnType<readonly Record<string, unknown>[]>;
  fully_resolved: boolean;
  created_at: Timestamp;
}

export interface SchemaVersionTable {
  version: string;
  applied_at: Timestamp;
}

export interface Database {
  organizations: OrganizationsTable;
  clubs: ClubsTable;
  discipline_descriptors: DisciplineDescriptorsTable;
  tournament_rulesets: TournamentRulesetsTable;
  stage_configurations: StageConfigurationsTable;
  tournaments: TournamentsTable;
  participants: ParticipantsTable;
  teams: TeamsTable;
  rosters: RostersTable;
  entrants: EntrantsTable;
  entrant_attributes: EntrantAttributesTable;
  venues: VenuesTable;
  officials: OfficialsTable;
  fixture_schedules: FixtureSchedulesTable;
  fixture_schedule_officials: FixtureScheduleOfficialsTable;
  stages: StagesTable;
  fixtures: FixturesTable;
  matches: MatchesTable;
  segments: SegmentsTable;
  match_events: MatchEventsTable;
  match_assignments: MatchAssignmentsTable;
  match_lineups: MatchLineupsTable;
  audit_log: AuditLogTable;
  outbox_events: OutboxEventsTable;
  tournament_profiles: TournamentProfilesTable;
  compiled_rulesets: CompiledRulesetsTable;
  materialised_standings: MaterialisedStandingsTable;
  event_cursors: EventCursorsTable;
  projection_versions: ProjectionVersionsTable;
  schema_version: SchemaVersionTable;
}
