/**
 * @copalibre/rules — the @sebasoft/neuron-js adapter for CopaLibre's
 * declarative decisions: tiebreak comparator pipeline, eligibility and
 * advancement guards, event-triggered notification rules, and the
 * explanation-trace contract. Framework-free (no @nestjs/*, no fastify);
 * evaluates only — never mutates domain state.
 */

export {
  RulesError,
  UnregisteredElementError,
  ScriptValidationError,
  GuardEvaluationError,
  NotificationRuleError,
} from './errors.js';

export {
  RulesRegistry,
  type ElementKind,
  type RegistryEntry,
  type RuleScript,
} from './registry/rules-registry.js';

export {
  registerCopalibreVocabulary,
  StateNumberParameter,
  StateStringParameter,
  SetGuardOutcomeAction,
  type GuardState,
} from './evaluation/vocabulary.js';

export {
  evaluateGuard,
  type GuardDecision,
  type GuardInput,
} from './evaluation/guard-evaluator.js';
export {
  evaluateEligibility,
  evaluateAdvancement,
  type EligibilityFacts,
  type AdvancementFacts,
} from './guards/guards.js';

export {
  resolveTiebreak,
  type ComparisonDirection,
  type MissingValueBehavior,
  type TiebreakParameterDefinition,
  type TiebreakPipeline,
  type EntrantValues,
  type TiebreakResolution,
} from './tiebreak/pipeline.js';

export {
  evaluateNotificationRule,
  dedupeNotifications,
  type NotificationScope,
  type NotificationPredicate,
  type NotificationAggregation,
  type ThresholdComparator,
  type TriggerSemantics,
  type NotificationRule,
  type NotificationInstance,
  type NotificationEvaluation,
} from './notifications/notification-rules.js';

export {
  roundTripsAsJson,
  type TraceNode,
  type EvaluationRecord,
} from './trace/explanation-trace.js';
