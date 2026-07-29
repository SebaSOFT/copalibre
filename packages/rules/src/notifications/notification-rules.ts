import type { DisciplineDescriptor, RecordedEvent } from '@copalibre/domain';
import type { EvaluationRecord, TraceNode } from '../trace/explanation-trace';

/**
 * Event-triggered notification rules, per the tournament-engine decision
 * record: scope, input predicate, aggregation, threshold/comparator, trigger
 * semantics, and an in-console notification action. "Notifications are
 * derived effects, not source facts... delivery must be idempotent so
 * reconnects, refreshes, or recalculation do not duplicate an alert for the
 * same threshold crossing."
 */

export type NotificationScope = 'match' | 'segment' | 'side' | 'participant';

export interface NotificationPredicate {
  readonly definitionCodes?: readonly string[];
  readonly categories?: readonly ('positive' | 'negative' | 'neutral')[];
}

export type NotificationAggregation =
  { readonly kind: 'count' } | { readonly kind: 'sum'; readonly payloadField: string };

export type ThresholdComparator = '>=' | '>' | '==' | '<=' | '<';

export type TriggerSemantics =
  | { readonly kind: 'threshold-crossing' }
  | { readonly kind: 'every-qualifying-event' }
  | {
      readonly kind: 'bounded-repeat';
      readonly maxFirings: number;
      /** Qualifying events to skip between firings. */
      readonly cooldownEvents: number;
    };

export interface NotificationRule {
  readonly id: string;
  readonly version: number;
  readonly scope: NotificationScope;
  readonly predicate: NotificationPredicate;
  readonly aggregation: NotificationAggregation;
  readonly threshold: { readonly comparator: ThresholdComparator; readonly value: number };
  readonly semantics: TriggerSemantics;
  readonly action: {
    readonly severity: 'info' | 'warning' | 'critical';
    readonly titleTemplate: string;
    readonly messageTemplate: string;
    readonly targetRole: string;
  };
}

export interface NotificationInstance {
  /**
   * Stable identity of one firing. Recomputing over the same event log yields
   * the same keys, so delivery layers dedupe on it — reconnect, refresh, or
   * recalculation can never duplicate an alert for the same crossing.
   */
  readonly identityKey: string;
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly scopeKey: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly title: string;
  readonly message: string;
  readonly targetRole: string;
  readonly triggeredByEventId: string;
  readonly contextValues: Readonly<Record<string, unknown>>;
}

export interface NotificationEvaluation {
  readonly instances: readonly NotificationInstance[];
  readonly record: EvaluationRecord<readonly string[]>;
}

/**
 * Deterministically evaluates one rule over an ordered event log. Pure
 * recomputation — no internal state — which is exactly what makes the
 * identity keys stable across re-evaluations.
 */
export function evaluateNotificationRule(
  rule: NotificationRule,
  descriptor: DisciplineDescriptor,
  events: readonly RecordedEvent[],
): NotificationEvaluation {
  const bySide = new Map<string, { aggregate: number; firings: number; cooldown: number }>();
  const instances: NotificationInstance[] = [];
  const trace: TraceNode[] = [];

  for (const event of events) {
    if (!qualifies(rule.predicate, descriptor, event)) continue;

    const scopeKey = scopeKeyFor(rule.scope, event);
    const tracker = bySide.get(scopeKey) ?? { aggregate: 0, firings: 0, cooldown: 0 };

    const previous = tracker.aggregate;
    tracker.aggregate += contribution(rule.aggregation, event);

    const crossedNow = meets(rule.threshold, tracker.aggregate) && !meets(rule.threshold, previous);

    let fires = false;
    switch (rule.semantics.kind) {
      case 'threshold-crossing':
        fires = crossedNow && tracker.firings === 0;
        break;
      case 'every-qualifying-event':
        fires = meets(rule.threshold, tracker.aggregate);
        break;
      case 'bounded-repeat':
        if (meets(rule.threshold, tracker.aggregate)) {
          if (tracker.cooldown > 0) {
            tracker.cooldown -= 1;
          } else if (tracker.firings < rule.semantics.maxFirings) {
            fires = true;
            tracker.cooldown = rule.semantics.cooldownEvents;
          }
        }
        break;
    }

    if (fires) {
      tracker.firings += 1;
      const contextValues = {
        scopeKey,
        aggregate: tracker.aggregate,
        threshold: rule.threshold.value,
        eventId: event.eventId,
        side: event.side ?? null,
        participantId: event.participantId ?? null,
      };
      instances.push({
        identityKey: `${rule.id}@v${rule.version}|${scopeKey}|firing:${tracker.firings}`,
        ruleId: rule.id,
        ruleVersion: rule.version,
        scopeKey,
        severity: rule.action.severity,
        title: renderTemplate(rule.action.titleTemplate, contextValues),
        message: renderTemplate(rule.action.messageTemplate, contextValues),
        targetRole: rule.action.targetRole,
        triggeredByEventId: event.eventId,
        contextValues,
      });
      trace.push({
        kind: 'threshold',
        id: rule.id,
        label: `Notification ${rule.id}`,
        outcome: 'fired',
        values: contextValues,
        detail: `Aggregate ${tracker.aggregate} ${rule.threshold.comparator} ${rule.threshold.value} at event ${event.eventId}`,
      });
    }

    bySide.set(scopeKey, tracker);
  }

  return {
    instances,
    record: {
      engine: 'copalibre-rules',
      ruleVersion: { id: rule.id, version: rule.version },
      inputFacts: { eventCount: events.length },
      output: instances.map((instance) => instance.identityKey),
      trace,
    },
  };
}

/** Filters instances already delivered; delivery layers persist the keys. */
export function dedupeNotifications(
  alreadyDelivered: ReadonlySet<string>,
  instances: readonly NotificationInstance[],
): readonly NotificationInstance[] {
  return instances.filter((instance) => !alreadyDelivered.has(instance.identityKey));
}

function qualifies(
  predicate: NotificationPredicate,
  descriptor: DisciplineDescriptor,
  event: RecordedEvent,
): boolean {
  if (predicate.definitionCodes && !predicate.definitionCodes.includes(event.definitionCode)) {
    return false;
  }
  if (predicate.categories) {
    const definition = descriptor.eventDefinitions.find(
      (candidate) => candidate.code === event.definitionCode,
    );
    if (!definition || !predicate.categories.includes(definition.category)) return false;
  }
  return true;
}

function scopeKeyFor(scope: NotificationScope, event: RecordedEvent): string {
  switch (scope) {
    case 'match':
      return `match:${event.matchId}`;
    case 'segment':
      return `segment:${event.segmentId}`;
    case 'side':
      return `match:${event.matchId}/side:${event.side ?? 'unknown'}`;
    case 'participant':
      return `participant:${event.participantId ?? 'unknown'}`;
  }
}

function contribution(aggregation: NotificationAggregation, event: RecordedEvent): number {
  if (aggregation.kind === 'count') return 1;
  const value = event.payload[aggregation.payloadField];
  return typeof value === 'number' ? value : 0;
}

function meets(
  threshold: { comparator: ThresholdComparator; value: number },
  aggregate: number,
): boolean {
  switch (threshold.comparator) {
    case '>=':
      return aggregate >= threshold.value;
    case '>':
      return aggregate > threshold.value;
    case '==':
      return aggregate === threshold.value;
    case '<=':
      return aggregate <= threshold.value;
    case '<':
      return aggregate < threshold.value;
  }
}

// Trivial {{key}} substitution — deliberately not a template library: no
// logic, no partials, no escaping needs (console-only strings).
function renderTemplate(template: string, values: Readonly<Record<string, unknown>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    key in values ? String(values[key]) : `{{${key}}}`,
  );
}
