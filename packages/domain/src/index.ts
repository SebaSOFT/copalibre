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
  ProfileStage,
  ProfileTiebreak,
} from './profiles/tournament-profile.js';
export { compileProfile, effectiveWinCondition } from './profiles/compile-profile.js';

export type {
  EventCategory,
  ActorRequirement,
  PayloadJsonSchema,
  EventEffect,
  EventDefinition,
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
  type ScoringInputDefinition,
  type DisciplineDescriptor,
  type RuleScript,
} from './descriptors/discipline-descriptor.js';
export {
  segmentThresholdEventDefinitions,
  SEGMENT_THRESHOLD_EVENT_CODES,
  type SegmentThresholdEventCode,
} from './descriptors/segment-threshold-events.js';
export {
  footballDescriptor,
  tennisDescriptor,
  bestOfFiveWinCondition,
  seededDescriptors,
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

export type {
  DescriptorRef,
  TournamentRuleset,
  StageConfiguration,
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
  type FixtureRef,
  type MutationContext,
  type MutationDecision,
} from './rulesets/mutation.js';

export type { Organization, Club } from './aggregates/organization.js';
export { hasStarted, type Tournament, type TournamentStatus } from './aggregates/tournament.js';
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
export type {
  Participant,
  Team,
  RosterMember,
  Roster,
  EntrantStatus,
  Entrant,
} from './aggregates/participant.js';
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
export type {
  Stage,
  Fixture,
  MatchStatus,
  MatchSideScore,
  MatchResult,
  Match,
  Segment,
} from './aggregates/competition.js';

export {
  validateRecordedOutcome,
  declaredStatisticsSchema,
  type OutcomeSide,
  type RecordedOutcome,
  type OutcomeValidationOptions,
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
