/**
 * @copalibre/domain — framework-free source of truth for CopaLibre's
 * tournament domain. No @nestjs/* or fastify import may ever appear here
 * (architecture rule: "domain and rules do not import Nest or Fastify").
 */

export { ok, err, unwrap, type Result } from './result.js';
export {
  DomainError,
  InvalidUuidError,
  InvalidAliasError,
  RulesetCompilationError,
  EventValidationError,
  DescriptorValidationError,
  TournamentProfileValidationError,
  OutcomeValidationError,
  MutationBlockedError,
  type PolicyViolation,
} from './errors.js';

export { UuidV7 } from './identifiers/uuid-v7.js';
export {
  SemanticVersion,
  latestVersion,
  InvalidSemanticVersionError,
} from './identifiers/semantic-version.js';
export { Alias, type AliasScope } from './identifiers/alias.js';
export {
  MAX_CSV_IMPORT_BYTES,
  validateCsvImport,
  type ParticipantImportTarget,
  type CsvImportTarget,
  type CsvImportError,
  type CsvImportPreview,
  type CsvImportPreviewRow,
} from './import-export/csv-import.js';
export { stringifyCsv, escapeCsvFormulaCell } from './import-export/csv-export.js';
export { suggestAlias, suggestAvailableAlias, isSuggestable } from './identifiers/suggest-alias.js';
export {
  Abbreviation,
  isAbbreviation,
  InvalidAbbreviationError,
  MAX_ABBREVIATION_LENGTH,
} from './identifiers/abbreviation.js';
export {
  abbreviationOf,
  deriveEntrantAbbreviation,
  labelCollisions,
  type LabelledSide,
  type LabelCollision,
} from './aggregates/short-labels.js';

export type {
  MergeStrategyName,
  OverridePermission,
  MutationClass,
  FieldPolicy,
  ConfigFieldPolicies,
  RulesetConfig,
  OverrideSet,
} from './descriptors/override-policy.js';
export type { Attribution } from './descriptors/attribution.js';
export {
  CANONICAL_STATISTICS,
  resolveRequirement,
  codeFor,
  type CanonicalStatistic,
  type CapabilityRequirement,
  type ResolvedCapability,
  type CapabilityBinding,
} from './capabilities/capability.js';
export {
  bindCapabilities,
  declaredCodes,
  UnsatisfiedCapabilityError,
  type BindOptions,
} from './capabilities/binder.js';
export type {
  TournamentProfile,
  TournamentProfileDocument,
  ProfileStage,
  ProfileTiebreak,
} from './profiles/tournament-profile.js';
export { compileProfile, effectiveWinCondition } from './profiles/compile-profile.js';

export type {
  EventCategory,
  ActorRequirement,
  PayloadJsonSchema,
  EventEffect,
  EventWorkflow,
  EventDefinition,
  ScoreAward,
  TargetAttribution,
} from './descriptors/event-definition.js';
export {
  MVP_FORMATS,
  DUEL_FORMATS,
  PLACEMENT_FORMATS,
  SUPPORTED_FORMATS,
  isPlacementFormat,
  type DuelFormat,
  type PlacementFormat,
  type ParticipantType,
  type TournamentFormat,
  type RosterConstraints,
  type SegmentTypeDefinition,
  type StatisticDefinition,
  type PlacementPoints,
  type ScoringInputDefinition,
  type RosterRoleDeclaration,
  type DisciplineDescriptor,
  type DisciplineDescriptorDocument,
  type RuleScript,
} from './descriptors/discipline-descriptor.js';
export type {
  TableTarget,
  ColumnSource,
  ColumnFormat,
  TableSortRule,
  TableQualificationFilter,
  TableColumnDefinition,
  TableLayoutDefinition,
} from './descriptors/table-layout.js';
export {
  resolveEffectiveTableLayouts,
  findTableLayout,
} from './descriptors/table-layout-resolution.js';
export {
  segmentThresholdEventDefinitions,
  SEGMENT_THRESHOLD_EVENT_CODES,
  type SegmentThresholdEventCode,
} from './descriptors/segment-threshold-events.js';
export {
  footballDescriptor,
  tennisDescriptor,
  battleRoyaleDescriptor,
  swimmingDescriptor,
  bestOfFiveWinCondition,
  winConditionScript,
  type SegmentRuleSpec,
  type MatchRuleSpec,
} from './modules/index.js';
export {
  validateDisciplineDescriptorDocument,
  DISCIPLINE_DESCRIPTOR_SCHEMA,
  RECORDED_OUTCOME_SCHEMA,
  RULE_SCRIPT_SCHEMA,
  type JsonSchemaDocument,
} from './descriptors/descriptor-schema.js';
export { DESCRIPTOR_FIELD_EXPLANATIONS } from './descriptors/descriptor-field-explanations.js';
export {
  TOURNAMENT_PROFILE_SCHEMA,
  validateTournamentProfileDocument,
} from './profiles/profile-schema.js';

export {
  TOURNAMENT_CUSTOM_SCRIPT_HOOKS,
  validateHookScriptAttachment,
  type DescriptorRef,
  type TournamentRuleset,
  type StageConfiguration,
  type HookScriptAttachment,
} from './rulesets/tournament-ruleset.js';
export type { CompilationProvenance, MatchRuleset } from './rulesets/match-ruleset.js';
export {
  validateConstraint,
  roundNumberFor,
  CONSTRAINT_HOOK_POINTS,
  IMPLEMENTED_HOOK_POINTS,
  DrawConstraintError,
  type ConstraintHookPoint,
  type DrawConstraint,
  type SeparationConstraint,
  type DistributionConstraint,
  type ScriptConstraint,
} from './rulesets/draw-constraints.js';
export {
  validateCollectors,
  readableAt,
  cadenceOf,
  isLiveCadence,
  CollectorError,
  type StatisticCollector,
  type CollectorSource,
  type CollectorActorSource,
  type CollectorMeasure,
  type CollectorGranularity,
  type CollectorCadence,
  type CollectorVocabulary,
  type ValidatedCollectors,
  type InertCollector,
} from './statistics/collector.js';
export {
  COMPETITION_GRANULARITIES,
  ACTOR_GRANULARITIES,
  GRANULARITY_SOURCES,
  isCompetitionGranularity,
  isActorGranularity,
  granularitiesAbove,
  isCoarser,
  actorOfEntrant,
  actorOfOfficial,
  actorOfVenue,
  requireGranularities,
  HierarchyError,
  type CompetitionGranularity,
  type ActorGranularity,
  type ResolvedActor,
} from './statistics/hierarchies.js';
export {
  validateTagDeclaration,
  validateTagDeclarations,
  checkTagApplication,
  tagScopeFor,
  tagsAt,
  TagError,
  type TagDeclaration,
  type TagLifetime,
  type TagFact,
  type AppliedTag,
  type TagReadContext,
} from './statistics/tags.js';
export {
  checkAdjustment,
  AdjustmentError,
  type StatisticAdjustment,
} from './statistics/adjustment.js';
export {
  validatePerson,
  ageAt,
  normaliseNaturalKey,
  sameNaturalKey,
  isDuplicateMembership,
  squadOfDiscipline,
  PersonError,
  type Person,
  type Player,
  type PlayerRole,
  type NaturalKey,
} from './aggregates/person.js';
export {
  ORGANIZATION_ROLES,
  ORGANIZATION_MEMBER_STATUSES,
  INSTALLATION_ROLES,
  TOURNAMENT_SCOPED_ROLES,
  CLUB_SCOPED_ROLES,
  canCreateOrganizationInvitation,
  canGrantRole,
  isTournamentScopedRole,
  isClubScopedRole,
  wouldLeaveOrganizationWithoutAdmin,
  wouldLeaveInstallationWithoutSuperAdmin,
  isOrganizationMemberStatus,
  isOrganizationRole,
  normaliseEmail,
  validateOrganizationInvitation,
  OrganizationAccessError,
  type GrantorContext,
  type IdentityPrincipal,
  type InstallationRole,
  type InstallationRoleAssignment,
  type OrganizationInvitation,
  type OrganizationMemberStatus,
  type OrganizationRole,
  type OrganizationRoleAssignment,
  type ParticipantIdentityLink,
} from './aggregates/organization-access.js';
export {
  ORGANIZATION_CAPABILITIES,
  capabilitiesForRole,
  inheritedFrom,
  inheritsFrom,
  isOrganizationCapability,
  rolesForCapability,
  type OrganizationCapability,
} from './aggregates/role-capabilities.js';
export {
  validateSeason,
  competitionName,
  isImplicitSeason,
  SeasonError,
  IMPLICIT_SEASON_NAME,
  type Season,
} from './aggregates/season.js';
export {
  validateZone,
  isImplicitZone,
  ZoneError,
  IMPLICIT_ZONE_NAME,
  type Zone,
} from './aggregates/zone.js';
export {
  validateGroup,
  isImplicitGroup,
  GroupError,
  IMPLICIT_GROUP_NAME,
  type Group,
} from './aggregates/group.js';
export {
  planCorrection,
  CorrectionError,
  type CorrectionRequest,
  type CorrectionPlan,
  type DownstreamState,
} from './aggregates/result-correction.js';
export {
  validateReportSubmission,
  ReportValidationError,
  type ReportKind,
  type ReportStatus,
  type EvidenceReference,
  type ProposedResultClaim,
  type ParticipantReportSubmission,
  type SubmitReportInput,
} from './aggregates/participant-report.js';
export {
  applyMatchCommand,
  runningTimers,
  validateRoster,
  type RosterSelection,
  type RosterFinding,
  type CheckedRoster,
  type RosterConstraint,
  MatchOperationError,
  type MatchCommand,
  type MatchTransition,
  type RunningTimer,
  type TimerEventCodes,
} from './aggregates/match-operations.js';
export { foldLiveScores, type LiveScore } from './events/live-score.js';
export { foldRosterLineup, soleMemberWithRole } from './events/roster-lineup.js';
export {
  authorizeMatchCommand,
  validateAssignment,
  isMatchCapability,
  MATCH_CAPABILITIES,
  CAPABILITY_TEMPLATES,
  MatchAuthorityError,
  type MatchCapability,
  type MatchAssignment,
  type AuthorityScope,
  type AuthorityDecision,
  type MatchContext,
} from './aggregates/match-authority.js';
export {
  SCRIPT_HOOKS,
  SCRIPT_HOOK_IDS,
  ENVIRONMENT_CONTEXT_PATHS,
  findScriptHook,
  resolveHookAttachment,
  publishedContextPaths,
  publishesPath,
  assertDataOnlyContext,
  ScriptHookError,
  type ScriptHook,
  type ScriptHookId,
  type HookAttachment,
  type HookEvaluation,
  type HookPolarity,
} from './rulesets/script-hooks.js';
export {
  validateAllocation,
  assertSlotCount,
  ALLOCATION_MODES,
  StageAllocationError,
  type StageAllocation,
  type AutomaticAllocation,
  type ManualAllocation,
  type WeightedAllocation,
  type SeedDirection,
  type SeedPlacement,
} from './rulesets/stage-allocation.js';
export { compileEffectiveRuleset } from './rulesets/compiler.js';
export {
  evaluateMutation,
  evaluateCustomScriptsMutation,
  type FixtureRef,
  type MutationContext,
  type MutationDecision,
} from './rulesets/mutation.js';

export { SUPPORTED_LANGUAGES, isSupportedLanguage, type SupportedLanguage } from './i18n.js';
export { ISO_3166_ALPHA_2_CODES, isValidCountryCode } from './countries.js';
export { resolveLabel, isLocalizedLabel, type LocalizedLabel } from './i18n-label.js';
export type { Organization, Club } from './aggregates/organization.js';
export {
  hasStarted,
  canTransitionTournament,
  transitionTournament,
  TournamentTransitionError,
  type Tournament,
  type TournamentStatus,
} from './aggregates/tournament.js';
export {
  validateStageCompletion,
  validateNextStage,
  StageCompletionError,
  StageNotReadyError,
  type StageStatus,
  type StageCompletionPreconditions,
  type NextStagePreconditions,
} from './aggregates/stage-completion.js';
export {
  validateStart,
  canChangeModuleVersion,
  StartValidationError,
  ModuleFrozenError,
  type StartPreconditions,
} from './aggregates/tournament-start.js';
export type { Team, EntrantStatus, Entrant } from './aggregates/participant.js';
export {
  teamMembershipsEditable,
  teamMembershipsApply,
  planRosterReconciliation,
  canDecide,
  statusFor,
  planBulkReview,
  RegistrationError,
  type ReviewDecision,
  type CheckInWindow,
} from './aggregates/registration-review.js';
export {
  validateAttributes,
  assertWeightingComplete,
  attributeValue,
  numericAttribute,
  categoricalAttribute,
  EntrantAttributeError,
  type EntrantAttribute,
  type EntrantAttributes,
} from './aggregates/entrant-attribute.js';
export {
  endsAt,
  overlaps,
  gapMinutes,
  validateWindow,
  validateVenue,
  validateOfficial,
  ResourceError,
  type Venue,
  type Official,
  type OfficialRole,
  type TimeWindow,
  type ResourceAssignment,
} from './aggregates/resource.js';
export {
  computeSlotCountPerVenue,
  generateScheduleSlots,
  validateSchedule,
  ScheduleError,
  type Schedule,
  type ScheduleSlot,
} from './aggregates/schedule.js';
export {
  classifyScheduleMutation,
  type ScheduleMutationContext,
} from './aggregates/schedule-mutation.js';
export {
  detectConflicts,
  describeWindow,
  ScheduleConflictError,
  type ConflictKind,
  type ScheduleConflict,
  type ScheduleContext,
  type SlotInfo,
  type RestRule,
} from './aggregates/schedule-conflict.js';
export {
  validateSeriesDeclaration,
  resolveSeries,
  SeriesConfigurationError,
  type SeriesDeclaration,
  type SeriesResolutionClass,
  type SeriesAccountingGrain,
  type SeriesResolutionStatus,
  type SeriesResolutionResult,
  type SeriesTraceNode,
  type ResolveSeriesInput,
} from './aggregates/series.js';
export type {
  Stage,
  Fixture,
  MatchStatus,
  MatchSideScore,
  MatchResult,
  Match,
  Segment,
  MatchRosterMember,
  MatchRoster,
} from './aggregates/competition.js';

export {
  validateRecordedOutcome,
  applyPlacementScoring,
  validatePlacementTable,
  pointsFor,
  declaredStatisticsSchema,
  type OutcomeSide,
  type OutcomeContributor,
  type RecordedOutcome,
  type OutcomeValidationOptions,
  type ResultReason,
} from './standings/index.js';

export {
  EventLog,
  effectsOf,
  type RecordedEvent,
  type RecordEventInput,
} from './events/event-log.js';

/**
 * Test fixtures, exported so downstream packages can build realistic cases
 * against real descriptor/profile shapes instead of re-inventing them.
 */
export { fixtureDescriptor } from './test-support/fixture-descriptor.js';
export { fixtureProfile } from './test-support/fixture-profile.js';

export { resolveAlias, type AliasRedirect, type AliasResolution } from './aliasing.js';
