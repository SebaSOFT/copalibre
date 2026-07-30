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
  MutationBlockedError,
  type PolicyViolation,
} from './errors.js';

export { UuidV7 } from './identifiers/uuid-v7.js';
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
export type {
  EventCategory,
  ActorRequirement,
  PayloadJsonSchema,
  EventEffect,
  EventDefinition,
} from './descriptors/event-definition.js';
export {
  MVP_FORMATS,
  type ParticipantType,
  type TournamentFormat,
  type RosterConstraints,
  type SegmentTypeDefinition,
  type StatisticDefinition,
  type ScoringInputDefinition,
  type DisciplineDescriptor,
} from './descriptors/discipline-descriptor.js';

export type {
  DescriptorRef,
  TournamentRuleset,
  StageConfiguration,
} from './rulesets/tournament-ruleset.js';
export type { CompilationProvenance, MatchRuleset } from './rulesets/match-ruleset.js';
export { compileEffectiveRuleset } from './rulesets/compiler.js';
export {
  evaluateMutation,
  type FixtureRef,
  type MutationContext,
  type MutationDecision,
} from './rulesets/mutation.js';

export type { Organization, Club } from './aggregates/organization.js';
export type { Tournament, TournamentStatus } from './aggregates/tournament.js';
export type {
  Participant,
  Team,
  RosterMember,
  Roster,
  EntrantStatus,
  Entrant,
} from './aggregates/participant.js';
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
  EventLog,
  effectsOf,
  type RecordedEvent,
  type RecordEventInput,
} from './events/event-log.js';
