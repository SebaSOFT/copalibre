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
  type RegistryAuthoringDefinition,
  type RegistryEntry,
  type RegistryParameterDefinition,
  type RuleScript,
} from './registry/rules-registry.js';

export {
  registerCopalibreVocabulary,
  registerCopalibreParameters,
  NumberParameter,
  StringParameter,
  SetGuardOutcomeAction,
  type GuardState,
} from './evaluation/vocabulary.js';

export {
  validateExpression,
  validateParameterDeclaration,
  evaluateExpression,
  resolveExpressionField,
  splitTemplate,
  expressionResolutions,
  pathsIn,
  pathsRead,
  type ExpressionResolution,
  isExpressionMode,
  type TemplateSegment,
} from './expressions/expression.js';
/** Re-exported so a caller of `evaluateExpression`/`resolveExpressionField` outside this package can construct one without depending on `@sebasoft/neuron-js` directly. */
export type { ExecutionContext } from '@sebasoft/neuron-js';
export {
  EXPRESSION_FUNCTION_NAMES,
  isExpressionFunction,
  type ExpressionValue,
} from './expressions/functions.js';

export {
  evaluateCollectorThreshold,
  thresholdReadable,
  collectorThresholdRulesFrom,
  foldCollectorTotals,
  type CollectorThresholdRule,
  type CollectorThresholdInput,
  type ThresholdWindow,
} from './notifications/collector-thresholds.js';
export {
  registerDeclaredEffectActions,
  NotifyAction,
  StartTimerAction,
  StopTimerAction,
  AdjustStatisticAction,
  ApplyTagAction,
} from './effects/actions.js';
export {
  effectIdentityKey,
  declaredEffect,
  toNotificationInstance,
  toDeclaredTimer,
  toStatisticAdjustment,
  toTagFact,
  remainingSeconds,
  EFFECTS_STATE_KEY,
  type DeclaredEffect,
  type DeclaredEffectKind,
  type DeclaredTimer,
  type EffectDraft,
  type EffectOrigin,
} from './effects/declared-effects.js';
export {
  evaluateAtHook,
  drawRecords,
  validateHookScriptDocument,
  type HookDecision,
  type HookEvaluationInput,
} from './evaluation/hook-evaluator.js';

export {
  registerCopalibreConditions,
  CompareTwoNumbersCondition,
  CompareTwoStringsCondition,
  ValueInSetCondition,
  ValueExistsCondition,
  CompareTwoInstantsCondition,
} from './evaluation/conditions.js';

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
  bindTiebreakPipeline,
  overriddenGaps,
  type BoundTiebreakParameter,
  type BoundTiebreakPipeline,
  type CapabilityTiebreakParameter,
} from './tiebreak/binding.js';
export {
  resolveTiebreak,
  type ComparisonDirection,
  type MissingValueBehavior,
  type TiebreakParameterDefinition,
  type RatioDefinition,
  type TiebreakPipeline,
  type EntrantValues,
  type TiebreakResolution,
} from './tiebreak/pipeline.js';

export {
  evaluateNotificationRule,
  dedupeNotifications,
  notificationRulesFrom,
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
export {
  traceLines,
  lineOf,
  traceForEntrant,
  hasTraceFor,
  type TraceRenderOptions,
} from './trace/render.js';

export {
  registerWinConditionVocabulary,
  RequireMarginAction,
  WinSegmentAction,
  WinMatchAction,
  type WinConditionState,
  type WinConditionDecisionRecord,
} from './win-condition/actions.js';
/**
 * Re-exported from the domain, where the event definitions live: the discipline
 * declares them, this package emits and evaluates them.
 */
export { segmentThresholdEventDefinitions } from '@copalibre/domain';
export {
  evaluateWinCondition,
  toRecordedEvents,
  asRuleScript,
  type WinConditionDecision,
  type WinConditionInput,
  type WinConditionOutput,
  type ThresholdEventOptions,
} from './win-condition/evaluator.js';
export {
  SEGMENT_THRESHOLD_KINDS,
  type MatchProgress,
  type SegmentProgress,
  type SegmentOutcome,
  type SegmentDecision,
  type SegmentThresholdEvent,
  type SegmentThresholdKind,
} from './win-condition/types.js';

export {
  registerConstraintVocabulary,
  RejectDrawAction,
  RequireDrawAction,
  type ConstraintFinding,
  type ConstraintState,
} from './constraints/actions.js';

export {
  registerSeriesResolutionVocabulary,
  WinSeriesAction,
  type SeriesResolutionState,
} from './series/actions.js';

import { registerDeclaredEffectActions } from './effects/actions.js';
import { registerCopalibreConditions } from './evaluation/conditions.js';
import {
  registerCopalibreParameters,
  registerCopalibreVocabulary,
} from './evaluation/vocabulary.js';
import { registerWinConditionVocabulary } from './win-condition/actions.js';
import { registerConstraintVocabulary } from './constraints/actions.js';
import { registerSeriesResolutionVocabulary } from './series/actions.js';
import { RulesRegistry } from './registry/rules-registry.js';

export function createDefaultRulesRegistry(): RulesRegistry {
  const registry = new RulesRegistry();
  registerCopalibreVocabulary(registry);
  registerWinConditionVocabulary(registry);
  registerConstraintVocabulary(registry);
  registerSeriesResolutionVocabulary(registry);
  return registry;
}

export function createHookScriptRegistry(): RulesRegistry {
  const registry = new RulesRegistry({
    includeBuiltinActions: false,
    enforceAuthoringDefinitions: true,
  });
  registerCopalibreConditions(registry);
  registerCopalibreParameters(registry);
  registerDeclaredEffectActions(registry);
  registerSeriesResolutionVocabulary(registry);
  return registry;
}
