/**
 * @copalibre/domain — framework-free source of truth for CopaLibre's
 * tournament domain. No @nestjs/* or fastify import may ever appear here
 * (architecture rule: "domain and rules do not import Nest or Fastify").
 */

export { ok, err, unwrap, type Result } from './result';
export {
  DomainError,
  InvalidUuidError,
  InvalidAliasError,
  RulesetCompilationError,
  EventValidationError,
  MutationBlockedError,
  type PolicyViolation,
} from './errors';

export { UuidV7 } from './identifiers/uuid-v7';
export { Alias, type AliasScope } from './identifiers/alias';

export type {
  MergeStrategyName,
  OverridePermission,
  MutationClass,
  FieldPolicy,
  ConfigFieldPolicies,
  RulesetConfig,
  OverrideSet,
} from './descriptors/override-policy';
export type {
  EventCategory,
  ActorRequirement,
  PayloadJsonSchema,
  EventEffect,
  EventDefinition,
} from './descriptors/event-definition';
export {
  MVP_FORMATS,
  type ParticipantType,
  type TournamentFormat,
  type RosterConstraints,
  type SegmentTypeDefinition,
  type StatisticDefinition,
  type ScoringInputDefinition,
  type DisciplineDescriptor,
} from './descriptors/discipline-descriptor';

export type {
  DescriptorRef,
  TournamentRuleset,
  StageConfiguration,
} from './rulesets/tournament-ruleset';
export type { CompilationProvenance, MatchRuleset } from './rulesets/match-ruleset';
export { compileEffectiveRuleset } from './rulesets/compiler';
export {
  evaluateMutation,
  type FixtureRef,
  type MutationContext,
  type MutationDecision,
} from './rulesets/mutation';

export type { Organization, Club } from './aggregates/organization';
export type { Tournament, TournamentStatus } from './aggregates/tournament';
export type {
  Participant,
  Team,
  RosterMember,
  Roster,
  EntrantStatus,
  Entrant,
} from './aggregates/participant';
export type {
  Stage,
  Fixture,
  MatchStatus,
  MatchSideScore,
  MatchResult,
  Match,
  Segment,
} from './aggregates/competition';

export { EventLog, effectsOf, type RecordedEvent, type RecordEventInput } from './events/event-log';
