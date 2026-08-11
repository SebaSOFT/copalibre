import {
  isActorGranularity,
  isCompetitionGranularity,
  type StatisticAdjustment,
  type TagFact,
} from '@copalibre/domain';
import type { NotificationInstance } from '../notifications/notification-rules.js';

/**
 * Effects a script declares but never performs (0013-scripting-hook-surface).
 *
 * This is the load-bearing decision of the phase. The tournament-engine
 * decision record requires notification delivery to be idempotent "so
 * reconnects, refreshes, or recalculation do not duplicate an alert for the
 * same threshold crossing". Today that holds for free, because notifications
 * are a pure fold over an event log — nothing is stored mid-flight and
 * recomputation *is* the mechanism.
 *
 * A script action breaks that the moment it *does* anything. So an action
 * produces a value, and the caller — which already owns the transaction, the
 * outbox and the delivery log — decides what to do with it.
 *
 * For a timer the same rule has a sharper consequence. A timer is not a derived
 * fact: it is state with a wall clock. `startTimer` therefore declares the
 * instant of the **causing event** and a duration, and remaining time is
 * computed at read. Replaying a match yields the same declaration and therefore
 * the same clock; a countdown stored and decremented would not survive a single
 * recalculation.
 */

export type DeclaredEffectKind =
  'notification' | 'timer-start' | 'timer-stop' | 'statistic-adjustment' | 'tag';

/**
 * What produced an effect. Named rather than implied, so an effect is traceable
 * to a decision instead of appearing from nowhere.
 */
export interface EffectOrigin {
  readonly hook: string;
  readonly scriptId: string;
  readonly scriptVersion: number;
  readonly ruleId: string;
  readonly actionId: string;
  /** The occurrence the evaluation was about — an event id, never a clock read. */
  readonly causeId: string;
}

export interface DeclaredEffect {
  readonly kind: DeclaredEffectKind;
  /** Stable across re-evaluation: derived from the cause, never from a draw. */
  readonly identityKey: string;
  readonly origin: EffectOrigin;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** What an action leaves in the state; the evaluator stamps the rest. */
export interface EffectDraft {
  readonly kind: DeclaredEffectKind;
  readonly actionId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export const EFFECTS_STATE_KEY = 'effects';

/**
 * The identity an effect keeps forever.
 *
 * It follows the shape `evaluateNotificationRule` established —
 * `rule@vN|scopeKey|firing:n` — so both notification paths deduplicate through
 * one mechanism. Every component comes from the document or from the causing
 * occurrence: never from `context.uuid`, because two replicas evaluating the
 * same event would then draw two identities and raise two alerts, which is the
 * duplication this whole model exists to avoid.
 */
export function effectIdentityKey(origin: EffectOrigin): string {
  return (
    `${origin.scriptId}@v${origin.scriptVersion}` +
    `|${origin.hook}:${origin.causeId}` +
    `|${origin.ruleId}/${origin.actionId}`
  );
}

export function declaredEffect(origin: EffectOrigin, draft: EffectDraft): DeclaredEffect {
  return {
    kind: draft.kind,
    identityKey: effectIdentityKey(origin),
    origin,
    payload: draft.payload,
  };
}

/**
 * A declared notification as the one `NotificationInstance` delivery already
 * knows. The threshold path and the script path converge here, so dedupe, the
 * outbox and the console see one shape and not two.
 */
export function toNotificationInstance(effect: DeclaredEffect): NotificationInstance | undefined {
  if (effect.kind !== 'notification') return undefined;

  const payload = effect.payload;
  const severity = payload.severity;
  return {
    identityKey: effect.identityKey,
    // Traceable to the rule inside the script, which is what an operator asks
    // about when an alert surprises them.
    ruleId: `${effect.origin.scriptId}/${effect.origin.ruleId}`,
    ruleVersion: effect.origin.scriptVersion,
    scopeKey: asText(payload.scopeKey) ?? effect.origin.causeId,
    severity: severity === 'warning' || severity === 'critical' ? severity : 'info',
    title: asText(payload.title) ?? '',
    message: asText(payload.message) ?? '',
    targetRole: asText(payload.targetRole) ?? 'operator',
    triggeredByEventId: effect.origin.causeId,
    contextValues: { hook: effect.origin.hook, ...(payload.contextValues as object) },
  };
}

export interface DeclaredTimer {
  readonly timerId: string;
  readonly startedAt: number;
  readonly durationSeconds: number;
}

/** The declared timer a `timer-start` effect carries, or nothing if malformed. */
export function toDeclaredTimer(effect: DeclaredEffect): DeclaredTimer | undefined {
  if (effect.kind !== 'timer-start') return undefined;

  const { timerId, startedAt, durationSeconds } = effect.payload;
  if (typeof timerId !== 'string' || timerId === '') return undefined;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return undefined;
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) return undefined;
  return { timerId, startedAt, durationSeconds };
}

/**
 * Remaining time, derived at read from the start instant and the duration.
 *
 * One helper rather than one calculation per surface: the console, the TV board
 * and the public page must not disagree about how much time is left, and they
 * would the moment each rounded differently.
 */
export function remainingSeconds(timer: DeclaredTimer, now: number): number {
  const elapsed = (now - timer.startedAt) / 1000;
  const remaining = timer.durationSeconds - elapsed;
  return remaining > 0 ? remaining : 0;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The adjustment a `statistic-adjustment` effect carries, or nothing if
 * malformed.
 *
 * The script is named as the actor, because "who moved this number" must have
 * an answer, and "a rule did" is only an answer when the rule can be pointed
 * at. The identity key rides along as the reason's provenance so a re-evaluation
 * of the same event recognises the adjustment it already declared instead of
 * declaring a second one.
 */
export function toStatisticAdjustment(effect: DeclaredEffect): StatisticAdjustment | undefined {
  if (effect.kind !== 'statistic-adjustment') return undefined;

  const { collectorCode, actorGranularity, actorId, delta, reason } = effect.payload;
  if (typeof collectorCode !== 'string' || collectorCode === '') return undefined;
  if (typeof actorId !== 'string' || actorId === '') return undefined;
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return undefined;
  if (typeof actorGranularity !== 'string' || !isActorGranularity(actorGranularity)) {
    return undefined;
  }

  return {
    collectorCode,
    actorGranularity,
    actorId,
    delta,
    reason: asText(reason) ?? `Declared by ${effect.origin.scriptId}/${effect.origin.ruleId}`,
    actor: `script:${effect.origin.scriptId}`,
  };
}

/**
 * The tag fact a `tag` effect carries, or nothing if malformed.
 *
 * The instant is the causing event's, never the clock: replaying a match must
 * reproduce when the label was applied rather than stamping it with the moment
 * of the replay. Which is also what makes the same evaluation, run twice,
 * produce one fact instead of two.
 */
export function toTagFact(effect: DeclaredEffect, occurredAt: string): TagFact | undefined {
  if (effect.kind !== 'tag') return undefined;

  const { code, action, actorGranularity, actorId, competitionGranularity, competitionId, reason } =
    effect.payload;

  if (typeof code !== 'string' || code === '') return undefined;
  if (action !== 'applied' && action !== 'lifted') return undefined;
  if (typeof actorId !== 'string' || actorId === '') return undefined;
  if (typeof competitionId !== 'string' || competitionId === '') return undefined;
  if (typeof actorGranularity !== 'string' || !isActorGranularity(actorGranularity)) {
    return undefined;
  }
  if (
    typeof competitionGranularity !== 'string' ||
    !isCompetitionGranularity(competitionGranularity)
  ) {
    return undefined;
  }

  return {
    code,
    action,
    actorGranularity,
    actorId,
    competitionGranularity,
    competitionId,
    actor: `script:${effect.origin.scriptId}`,
    reason: asText(reason) ?? `Declared by ${effect.origin.scriptId}/${effect.origin.ruleId}`,
    at: occurredAt,
  };
}
