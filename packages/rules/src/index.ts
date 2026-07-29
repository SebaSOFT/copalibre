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
} from './errors';

export {
  RulesRegistry,
  type ElementKind,
  type RegistryEntry,
  type RuleScript,
} from './registry/rules-registry';

export {
  registerCopalibreVocabulary,
  StateNumberParameter,
  StateStringParameter,
  SetGuardOutcomeAction,
  type GuardState,
} from './evaluation/vocabulary';

export { evaluateGuard, type GuardDecision, type GuardInput } from './evaluation/guard-evaluator';
export {
  evaluateEligibility,
  evaluateAdvancement,
  type EligibilityFacts,
  type AdvancementFacts,
} from './guards/guards';

export {
  resolveTiebreak,
  type ComparisonDirection,
  type MissingValueBehavior,
  type TiebreakParameterDefinition,
  type TiebreakPipeline,
  type EntrantValues,
  type TiebreakResolution,
} from './tiebreak/pipeline';

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
} from './notifications/notification-rules';

export { roundTripsAsJson, type TraceNode, type EvaluationRecord } from './trace/explanation-trace';
