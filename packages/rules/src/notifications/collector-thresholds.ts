import type { ActorGranularity, RecordedEvent, StatisticCollector } from '@copalibre/domain';
import type { TraceNode } from '../trace/explanation-trace.js';
import type { NotificationEvaluation, NotificationInstance } from './notification-rules.js';

/**
 * Thresholds over a declared collector (0016-statistic-collectors-and-tags).
 *
 * `evaluateNotificationRule` counts events inside one match. A discipline's
 * real question is rarely bounded that way — "the fifth yellow of the
 * tournament", "the third suspension of the season" — and answering it by
 * writing a second counter per rule is how two numbers that should agree stop
 * agreeing. So a threshold names a **collector**, and the number it compares is
 * the one every table already shows.
 *
 * ## Windows, not resets
 *
 * "Five cards and then start again" is a window on the *rule*: the count
 * restarts from the last consequence the rule produced, while the collector
 * keeps every card forever. The career total and the disciplinary state are
 * different questions, and a reset would answer the second by destroying the
 * first — which is exactly the data loss this capability refuses to do.
 */

export type ThresholdWindow =
  /** Every fact the collector has, for as long as it has kept them. */
  | 'career'
  /** What has accumulated since this rule last recorded a consequence. */
  | 'since-last-consequence';

export interface CollectorThresholdRule {
  readonly id: string;
  readonly version: number;
  readonly collectorCode: string;
  /** Whom the threshold is about; the collector must collect at least this fine. */
  readonly actorGranularity: ActorGranularity;
  readonly threshold: { readonly comparator: '>=' | '>' | '=='; readonly value: number };
  readonly window?: ThresholdWindow;
  readonly action: {
    readonly severity: 'info' | 'warning' | 'critical';
    readonly titleTemplate: string;
    readonly messageTemplate: string;
    readonly targetRole: string;
  };
}

export interface CollectorThresholdInput {
  readonly rule: CollectorThresholdRule;
  readonly collector: StatisticCollector;
  readonly events: readonly RecordedEvent[];
  /** Resolves an event to the actor the rule is about, at its granularity. */
  readonly actorOf: (event: RecordedEvent) => string | undefined;
  /** What each actor brought into this match, read from the projection. */
  readonly carriedIn?: Readonly<Record<string, number>>;
  /**
   * How much of each actor's total this rule has already answered with a
   * consequence. Supplied by the caller from its own record of firings, so the
   * evaluation stays a pure fold and a replay reproduces it.
   */
  readonly consumed?: Readonly<Record<string, number>>;
}

/**
 * Evaluates one threshold over an ordered event log, deterministically.
 *
 * Produces the same `NotificationInstance` the two other notification paths
 * produce, with an identity of the shape `0013` established — so delivery,
 * dedupe and the console see one thing, not a third.
 */
export function evaluateCollectorThreshold(input: CollectorThresholdInput): NotificationEvaluation {
  const { rule, collector, events } = input;
  const instances: NotificationInstance[] = [];
  const trace: TraceNode[] = [];

  const totals = new Map<string, number>(Object.entries(input.carriedIn ?? {}));
  const consumed = new Map<string, number>(Object.entries(input.consumed ?? {}));
  const firings = new Map<string, number>();

  for (const event of events) {
    if (!watches(collector, event)) continue;

    const actorId = input.actorOf(event);
    if (actorId === undefined) continue;

    const total = (totals.get(actorId) ?? 0) + contribution(collector, event);
    totals.set(actorId, total);

    const alreadyAnswered = consumed.get(actorId) ?? 0;
    const measured = rule.window === 'since-last-consequence' ? total - alreadyAnswered : total;
    const previous = measured - contribution(collector, event);

    // Fires on the crossing, not on every event past it: an alert that repeats
    // for the rest of the match is one an operator learns to ignore.
    if (!meets(rule.threshold, measured) || meets(rule.threshold, previous)) continue;

    const firing = (firings.get(actorId) ?? 0) + 1;
    firings.set(actorId, firing);
    if (rule.window === 'since-last-consequence') {
      // The rule starts counting again. The collector keeps everything: the
      // career total is not what a sanction is allowed to edit.
      consumed.set(actorId, total);
    }

    const contextValues = {
      scopeKey: actorId,
      collector: collector.code,
      total,
      window: measured,
      threshold: rule.threshold.value,
      eventId: event.eventId,
    };

    instances.push({
      identityKey: `${rule.id}@v${rule.version}|${actorId}|firing:${firing}`,
      ruleId: rule.id,
      ruleVersion: rule.version,
      scopeKey: actorId,
      severity: rule.action.severity,
      title: render(rule.action.titleTemplate, contextValues),
      message: render(rule.action.messageTemplate, contextValues),
      targetRole: rule.action.targetRole,
      triggeredByEventId: event.eventId,
      contextValues,
    });

    trace.push({
      kind: 'threshold',
      id: rule.id,
      label: `Collector threshold ${rule.id}`,
      outcome: 'fired',
      values: contextValues,
      detail:
        `${collector.code} reached ${measured} ${rule.threshold.comparator} ` +
        `${rule.threshold.value} for ${actorId} at event ${event.eventId}` +
        (rule.window === 'since-last-consequence'
          ? ` (career total ${total}, unchanged by this firing)`
          : ''),
    });
  }

  return {
    instances,
    record: {
      engine: 'copalibre-rules',
      ruleVersion: { id: rule.id, version: rule.version },
      inputFacts: { eventCount: events.length, collector: collector.code },
      output: instances.map((instance) => instance.identityKey),
      trace,
    },
  };
}

/**
 * Whether a threshold can be evaluated at all: a rule about a person cannot
 * read a collector kept per team, and answering it with the team's number would
 * sanction the wrong human.
 */
export function thresholdReadable(
  rule: CollectorThresholdRule,
  collector: StatisticCollector,
  order: readonly ActorGranularity[],
): boolean {
  if (rule.collectorCode !== collector.code) return false;
  const wanted = order.indexOf(rule.actorGranularity);
  const kept = order.indexOf(collector.granularity.actor);
  return wanted >= 0 && kept >= 0 && wanted >= kept;
}

function watches(collector: StatisticCollector, event: RecordedEvent): boolean {
  if (collector.source.kind !== 'event') return false;
  const codes = collector.source.definitionCodes;
  return codes === undefined || codes.includes(event.definitionCode);
}

function contribution(collector: StatisticCollector, event: RecordedEvent): number {
  if (collector.measure.kind !== 'sum') return 1;
  const value = event.payload[collector.measure.field];
  return typeof value === 'number' ? value : 0;
}

function meets(threshold: CollectorThresholdRule['threshold'], aggregate: number): boolean {
  switch (threshold.comparator) {
    case '>':
      return aggregate > threshold.value;
    case '==':
      return aggregate === threshold.value;
    default:
      return aggregate >= threshold.value;
  }
}

function render(template: string, values: Readonly<Record<string, unknown>>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) =>
    String(values[key] ?? ''),
  );
}
