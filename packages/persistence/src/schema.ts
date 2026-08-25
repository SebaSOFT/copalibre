import type { DrawConstraint, HookScriptAttachment } from '@copalibre/domain';
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
  /** ISO 639-1 code from `SUPPORTED_LANGUAGES`; presentation default only. */
  primary_language: string;
  /** IANA time zone identifier; presentation default only. */
  timezone: string;
  /** FK into `object_metadata.object_id`; null until an emblem is uploaded. */
  emblem_object_id: string | null;
  created_at: Timestamp;
}

/** Internal principal; OIDC remains a replaceable external credential. */
export interface IdentityPrincipalsTable {
  principal_id: string;
  email: string;
  oidc_subject_id: string | null;
  name: string | null;
  picture: string | null;
  password_hash: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Long-lived, revocable API/MCP credential bound to exactly one principal. */
export interface PersonalAccessTokensTable {
  token_id: string;
  principal_id: string;
  token_hash: string;
  label: string;
  scopes: JSONColumnType<readonly string[]>;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  last_used_at: Timestamp | null;
  created_at: Timestamp;
}

/**
 * Single-use, expiring verification tokens for password resets and email
 * changes. The raw token exists only in the email link; the database stores
 * only its hash.
 */
export interface AuthVerificationTokensTable {
  verification_id: string;
  principal_id: string;
  /** `password-reset` or `email-change`. */
  kind: string;
  token_hash: string;
  /** For email-change: the new email being verified. */
  new_email: string | null;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
  created_at: Timestamp;
}

/** Accepted, organization-local access assignment for one verified OIDC subject. */
export interface OrganizationRoleAssignmentsTable {
  assignment_id: string;
  organization_id: string;
  principal_id: string;
  email: string;
  role: string;
  status: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

/** An installation-wide role assignment (`super-admin` today), mirroring `organization_role_assignments` minus `organization_id`. */
export interface InstallationRoleAssignmentsTable {
  assignment_id: string;
  principal_id: string;
  role: string;
  status: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

/** Opaque invitation credentials are stored only as hashes. */
export interface OrganizationInvitesTable {
  invitation_id: string;
  organization_id: string;
  recipient_email: string;
  role: string;
  status: string;
  token_hash: string;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  accepted_principal_id: string | null;
  created_at: Timestamp;
}

/**
 * Device-scoped, revocable credentials for `/tv/**` kiosk and overlay
 * surfaces — deliberately not a person's JWT. Bound to exactly one
 * route (tournament, optionally one match); never stored or logged raw.
 */
export interface DisplayTokensTable {
  display_token_id: string;
  organization_id: string;
  tournament_id: string;
  match_id: string | null;
  token_hash: string;
  /** Operator-supplied device label, e.g. "Cancha 1 - TV entrada". */
  label: string | null;
  revoked_at: Timestamp | null;
  /** Last successful stream/page authorization, for the device-health heartbeat. */
  last_seen_at: Timestamp | null;
  created_at: Timestamp;
  created_by: string;
}

/** A participant self-service report or dispute — a fact, never a mutation path. */
export interface ParticipantReportsTable {
  report_id: string;
  organization_id: string;
  match_id: string;
  /** `report` or `dispute`. */
  kind: string;
  submitted_by_person_id: string;
  submitted_at: Timestamp;
  /** Set for a dispute; absent for a plain report. */
  reason: string | null;
  /** Set for a report; absent for a plain dispute. Never read as authority. */
  proposed_result: JSONColumnType<Record<string, unknown>> | null;
  /** `pending`, `reviewed`, or `dismissed`. */
  status: string;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  review_note: string | null;
  created_at: Timestamp;
}

/** Evidence attached to a report/dispute — a reference into object storage, never bytes in this table. */
export interface ReportEvidenceTable {
  evidence_id: string;
  report_id: string;
  organization_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_bucket: string;
  storage_key: string;
  uploaded_by: string;
  uploaded_at: Timestamp;
  /** `pending`, `passed`, or `failed` — set by the async validation worker job. */
  validation_status: string;
}

export interface ClubsTable {
  club_id: string;
  organization_id: string;
  /** Path identifier, unique within the organization. */
  alias: string | null;
  name: string;
  /** Short label for constrained surfaces; `C I` for "Casa de Italia". */
  abbreviation: string | null;
  /** FK into `object_metadata.object_id`; null until an emblem is uploaded. */
  emblem_object_id: string | null;
  created_at: Timestamp;
}

export interface DisciplineDescriptorsTable {
  descriptor_id: string;
  /** Installation-wide catalogue identity; older rows are backfilled by 0029. */
  alias: string | null;
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
  custom_scripts: JSONColumnType<readonly HookScriptAttachment[]>;
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
  /** Set when the tournament is archived; null until then. */
  archived_at: Timestamp | null;
}

/**
 * The human. `natural_key_normalised` is what uniqueness is enforced on
 * — `12.345.678` and `12345678` are one document, and the column that decides
 * has to agree.
 */
export interface PersonsTable {
  person_id: string;
  organization_id: string;
  alias: string | null;
  display_name: string;
  natural_key_kind: string | null;
  natural_key_value: string | null;
  natural_key_normalised: string | null;
  /** ISO 3166-1 alpha-2 country code; null until an operator records one. */
  nationality: string | null;
  /** ISO 8601 calendar date (YYYY-MM-DD); null until supplied. */
  birth_date: string | null;
  /** FK into `object_metadata.object_id`; null until a photo is uploaded. */
  photo_object_id: string | null;
  created_at: Timestamp;
}

/** One participant record may be reached by one installation principal per organization. */
export interface ParticipantIdentityLinksTable {
  principal_id: string;
  organization_id: string;
  person_id: string;
  created_at: Timestamp;
  created_by: string;
}

/** One person's membership in one team. Several per person, one per team. */
export interface PlayersTable {
  player_id: string;
  person_id: string;
  team_id: string;
  role: string;
  created_at: Timestamp;
}

export interface TeamsTable {
  team_id: string;
  organization_id: string;
  alias: string | null;
  club_id: string | null;
  name: string;
  /** The discipline this side plays; null on teams predating it. */
  discipline_id: string | null;
  /** Overrides the club's short label: `TLL A` beside `TLL B`. */
  abbreviation: string | null;
  created_at: Timestamp;
}

export interface EntrantsTable {
  entrant_id: string;
  tournament_id: string;
  entrant_kind: string;
  person_id: string | null;
  team_id: string | null;
  abbreviation: string | null;
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

/** Source and review state for one asynchronous participant CSV import. */
export interface CsvImportSessionsTable {
  import_id: string;
  organization_id: string;
  tournament_id: string;
  target_type: string;
  source_csv: string;
  source_hash: string;
  status: string;
  preview: JSONColumnType<Record<string, unknown>> | null;
  created_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  reviewed_at: Timestamp | null;
  committed_at: Timestamp | null;
}

/** One running of a tournament. Every tournament has at least one. */
export interface SeasonsTable {
  season_id: string;
  tournament_id: string;
  name: string;
  ordinal: number;
  created_at: Timestamp;
}

export interface StagesTable {
  stage_id: string;
  season_id: string;
  number: number;
  name: string;
  format: string;
  stage_configuration_id: string | null;
  created_at: Timestamp;
}

export interface ZonesTable {
  zone_id: string;
  stage_id: string;
  number: number;
  name: string;
  draw_seed: number | null;
  draw_constraints: JSONColumnType<readonly DrawConstraint[]> | null;
  created_at: Timestamp;
}

export interface GroupsTable {
  group_id: string;
  zone_id: string;
  number: number;
  name: string;
  draw_seed: number | null;
  draw_constraints: JSONColumnType<readonly DrawConstraint[]> | null;
  created_at: Timestamp;
}

export interface PromotionPlansTable {
  promotion_plan_id: string;
  zone_id: string;
  next_stage_id: string;
  plan: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
}

export interface ZoneEntrantsTable {
  zone_id: string;
  entrant_id: string;
}

export interface GroupEntrantsTable {
  group_id: string;
  entrant_id: string;
}

export interface FixturesTable {
  fixture_id: string;
  stage_id: string;
  zone_id: string | null;
  group_id: string | null;
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
  details: JSONColumnType<Record<string, string>> | null;
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
  /** Accumulated elapsed time while the segment was not actively running. */
  elapsed_seconds: number;
  /** Server clock instant at which the current running interval started. */
  clock_started_at: Timestamp | null;
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
  person_id: string | null;
  payload: JSONColumnType<Record<string, unknown>>;
  /** Optional free-text operator note, independent of the discipline and its payloadSchema. */
  notes: string | null;
  /** The active segment's running clock at record time; null for a non-timed segment or a pre-existing row. */
  segment_elapsed_seconds: number | null;
  created_at: Timestamp;
}

/** The selected players for one entrant in one match. */
export interface MatchRostersTable {
  match_id: string;
  entrant_id: string;
  /** Structured member metadata: number, name, tactical roles, on-field state. */
  roster_members: JSONColumnType<readonly MatchRosterMemberRow[]>;
  updated_at: Timestamp;
}

/** JSON-serialized shape of one `MatchRosterMember` inside `roster_members`. */
export interface MatchRosterMemberRow {
  personId: string;
  number?: number | string;
  name: string;
  /** Snapshotted at roster-selection time, alongside number/name/roles/onField. */
  nationality?: string;
  /** Codes naming discipline-declared `RosterRoleDeclaration`s — never a closed enum. */
  roles?: readonly string[];
  onField: boolean;
}

/**
 * A match-operating appointment. Exactly one of `match_id`/`stage_id` is
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

/** A completed command response keyed by a client-supplied idempotency key. */
export interface MatchCommandIdempotencyTable {
  idempotency_key: string;
  match_id: string;
  operation: string;
  request_fingerprint: string;
  response: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
}

/** An explicit early resolution of a timer fact; the source event remains immutable. */
export interface MatchTimerResolutionsTable {
  timer_id: string;
  match_id: string;
  actor: string;
  resolved_at: Timestamp;
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
/**
 * Durable claim and retry state on an outbox row.
 *
 * On the row rather than in a separate queue table: the row *is* the unit of
 * work, and a second table would let the two disagree about whether something
 * was done — which is the one thing an outbox exists to prevent.
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
  /** Who holds the claim, and until when; both null when unclaimed. */
  claimed_by: ColumnType<string | null, string | null | undefined, string | null>;
  claimed_until: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  attempts: ColumnType<number, number | undefined, number>;
  /** When this row may next be claimed; the backoff, made durable. */
  next_attempt_at: ColumnType<Date, Date | string | undefined, Date | string>;
  /** Set when retries are exhausted. A dead letter is inspected, never dropped. */
  dead_lettered_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  /** Every failure, oldest first: what failed, when, on which attempt. */
  failures: ColumnType<readonly Record<string, unknown>[], string | undefined, string>;
}

/**
 * What a consumer has already applied.
 *
 * The idempotency key is the outbox row's own id — a UUIDv7 the producer
 * already generated — rather than a hash of the payload. Two consumers may each
 * process the same row once, which is why the consumer is part of the key.
 */
export interface ProcessedMarkersTable {
  consumer: string;
  event_id: string;
  processed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

/**
 * The single logical scheduler, elected by holding a row.
 *
 * A lease rather than a leader-election service: a second coordination system
 * to decide which replica runs a cron loop is a lot of machinery for a question
 * PostgreSQL can already answer transactionally.
 */
export interface SchedulerLeasesTable {
  lease_name: string;
  holder: string;
  /** Wall-clock expiry. A holder that stops renewing loses it without asking. */
  expires_at: Timestamp;
  acquired_at: ColumnType<Date, Date | string | undefined, Date | string>;
  renewed_at: ColumnType<Date, Date | string | undefined, Date | string>;
  /** Bumped on every handoff, so a stale holder can tell it was replaced. */
  fencing_token: ColumnType<number, number | undefined, number>;
}

/** A recurring job a later phase registered; the scheduler only enqueues. */
export interface ScheduledJobsTable {
  job_name: string;
  organization_id: string | null;
  event_type: string;
  payload: JSONColumnType<Record<string, unknown>>;
  interval_seconds: number;
  last_enqueued_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: ColumnType<Date, Date | string | undefined, Date | string>;
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
  /** Installation-wide catalogue identity; older rows are backfilled by 0029. */
  alias: string | null;
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

/**
 * One folded figure, kept at the granularity its collector declares and
 * attributed to the match it was folded from.
 *
 * The match is part of the key rather than metadata: a total that cannot be
 * traced to the facts that produced it cannot be recomputed when one of them is
 * corrected, and the correction path is the reason this table exists at all.
 * Coarser figures — a season, a club — are the aggregate of these rows at read,
 * never a second row that could drift from them.
 */
export interface StatisticTotalsTable {
  organization_id: string;
  collector_code: string;
  actor_granularity: string;
  actor_id: string;
  competition_granularity: string;
  competition_id: string;
  /** The match whose finalisation produced this row. */
  source_match_id: string;
  value: number;
  /** How many facts produced the value; what an average is recomputed from. */
  samples: number;
  projection_version: number;
  updated_at: Timestamp;
}

/**
 * How much of a collector-threshold rule's total each actor has already
 * answered with a firing — the `since-last-consequence` window's
 * durable state, apart from the collector total (`statistic_totals`) it never
 * edits.
 */
export interface CollectorThresholdConsumptionTable {
  rule_id: string;
  actor_id: string;
  stage_id: string;
  consumed_total: number;
  updated_at: Timestamp;
}

/** One materialized script effect; the deterministic identity is its dedupe key. */
export interface DeclaredEffectsTable {
  identity_key: string;
  organization_id: string;
  match_id: string;
  cause_event_id: string;
  hook: string;
  script_id: string;
  script_version: number;
  rule_id: string;
  action_id: string;
  kind: string;
  payload: JSONColumnType<Record<string, unknown>>;
  created_at: Timestamp;
}

/**
 * A number moved by hand or by a script's declaration, recorded as a fact.
 * Folded like any other fact, so a replay reproduces the total.
 */
export interface StatisticAdjustmentsTable {
  adjustment_id: string;
  organization_id: string;
  /** Where the facts it belongs with are; a fold is always of a match. */
  match_id: string;
  collector_code: string;
  actor_granularity: string;
  actor_id: string;
  delta: number;
  reason: string;
  actor: string;
  created_at: Timestamp;
}

/**
 * Application and lifting of a tag, both recorded.
 *
 * There is no update and no delete: "was he suspended when that match was
 * played?" is a question a protest asks months later, and a row that was
 * removed cannot answer it. Whether a tag applies *now* is derived from these
 * rows at read.
 */
export interface TagFactsTable {
  fact_id: string;
  organization_id: string;
  code: string;
  /** `applied` or `lifted`; never `deleted`. */
  action: string;
  actor_granularity: string;
  actor_id: string;
  competition_granularity: string;
  competition_id: string;
  /** Who decided: `user:<id>`, `script:<id>` or `event:<id>`. */
  actor: string;
  reason: string;
  occurred_at: Timestamp;
  created_at: Timestamp;
}

/**
 * Aliases a resource used to answer to.
 *
 * Scoped to the organization: two organizations may both have used `apertura`,
 * and resolving one's old alias to the other's tournament hands a spectator
 * somebody else's competition.
 */
export interface AliasRedirectsTable {
  redirect_id: string;
  organization_id: string;
  /** `tournament` or `organization`; the alias namespace this rename is in. */
  scope: string;
  old_alias: string;
  new_alias: string;
  created_at: Timestamp;
}

export interface SchemaVersionTable {
  version: string;
  applied_at: Timestamp;
}

/**
 * One installed community module — its source (curated or
 * allow-listed alternate) and which `discipline_descriptors`/
 * `tournament_profiles` row (`document_id`, matching `kind`) it installed.
 */
export interface InstalledModulesTable {
  module_id: string;
  /** `discipline` or `tournament-profile`. */
  kind: string;
  alias: string;
  version: string;
  document_id: string;
  attribution_author: string;
  attribution_licence: string;
  attribution_source_url: string | null;
  requires_copalibre: string;
  /** `curated` or `alternate`. */
  source_kind: string;
  source_repository_url: string;
  installed_at: Timestamp;
}

/** An installed module's uploaded asset — object-storage reference only, no bytes in this table. */
export interface ModuleAssetsTable {
  asset_id: string;
  module_id: string;
  path: string;
  /** `background` or `logo`. */
  kind: string;
  content_type: string;
  size_bytes: number;
  storage_bucket: string;
  storage_key: string;
  created_at: Timestamp;
}

/**
 * The object-storage capability's own metadata registry — one row per
 * object stored through `@copalibre/object-storage`, pointing at its
 * profile-agnostic storage key. A domain-specific table that already records
 * its own storage reference and status (`report_evidence`, `module_assets`)
 * is not required to write here too.
 */
export interface ObjectMetadataTable {
  object_id: string;
  organization_id: string;
  /** `s3` or `filesystem`. */
  profile: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  /** `pending`, `passed` or `failed` — the async media-processing job's tracking field. */
  status: string;
  created_at: Timestamp;
}

export interface Database {
  organizations: OrganizationsTable;
  identity_principals: IdentityPrincipalsTable;
  organization_role_assignments: OrganizationRoleAssignmentsTable;
  installation_role_assignments: InstallationRoleAssignmentsTable;
  organization_invites: OrganizationInvitesTable;
  display_tokens: DisplayTokensTable;
  personal_access_tokens: PersonalAccessTokensTable;
  auth_verification_tokens: AuthVerificationTokensTable;
  participant_reports: ParticipantReportsTable;
  report_evidence: ReportEvidenceTable;
  clubs: ClubsTable;
  discipline_descriptors: DisciplineDescriptorsTable;
  tournament_rulesets: TournamentRulesetsTable;
  stage_configurations: StageConfigurationsTable;
  tournaments: TournamentsTable;
  persons: PersonsTable;
  participant_identity_links: ParticipantIdentityLinksTable;
  players: PlayersTable;
  teams: TeamsTable;
  entrants: EntrantsTable;
  entrant_attributes: EntrantAttributesTable;
  csv_import_sessions: CsvImportSessionsTable;
  venues: VenuesTable;
  officials: OfficialsTable;
  fixture_schedules: FixtureSchedulesTable;
  fixture_schedule_officials: FixtureScheduleOfficialsTable;
  seasons: SeasonsTable;
  stages: StagesTable;
  zones: ZonesTable;
  groups: GroupsTable;
  promotion_plans: PromotionPlansTable;
  zone_entrants: ZoneEntrantsTable;
  group_entrants: GroupEntrantsTable;
  fixtures: FixturesTable;
  matches: MatchesTable;
  segments: SegmentsTable;
  match_events: MatchEventsTable;
  match_assignments: MatchAssignmentsTable;
  match_command_idempotency: MatchCommandIdempotencyTable;
  match_timer_resolutions: MatchTimerResolutionsTable;
  match_rosters: MatchRostersTable;
  audit_log: AuditLogTable;
  outbox_events: OutboxEventsTable;
  tournament_profiles: TournamentProfilesTable;
  compiled_rulesets: CompiledRulesetsTable;
  materialised_standings: MaterialisedStandingsTable;
  event_cursors: EventCursorsTable;
  projection_versions: ProjectionVersionsTable;
  processed_markers: ProcessedMarkersTable;
  scheduler_leases: SchedulerLeasesTable;
  scheduled_jobs: ScheduledJobsTable;
  statistic_totals: StatisticTotalsTable;
  collector_threshold_consumption: CollectorThresholdConsumptionTable;
  declared_effects: DeclaredEffectsTable;
  statistic_adjustments: StatisticAdjustmentsTable;
  tag_facts: TagFactsTable;
  alias_redirects: AliasRedirectsTable;
  schema_version: SchemaVersionTable;
  installed_modules: InstalledModulesTable;
  module_assets: ModuleAssetsTable;
  object_metadata: ObjectMetadataTable;
}
