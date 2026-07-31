import {
  AbstractAction,
  ExecutionResult,
  MessageType,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import type { RulesRegistry } from '../registry/rules-registry.js';
import {
  EFFECTS_STATE_KEY,
  type DeclaredEffectKind,
  type EffectDraft,
} from './declared-effects.js';

/**
 * The three effectful actions (0013-scripting-hook-surface).
 *
 * Each one **declares** an effect and performs none. The contract is enforced
 * by shape rather than by discipline: an action appends a draft to the
 * evaluation state and returns, so performing an effect would require reaching
 * outside the signature — there is no service to call and no clock to start.
 *
 * The evaluator stamps identity afterwards, from the document and the causing
 * occurrence, which is why nothing here derives an identifier of its own.
 */

/** Where the evaluator publishes what this evaluation is about. */
interface EvaluationCause {
  readonly id: string;
  readonly at: number;
  readonly scopeKey?: string;
}

function causeOf(context: ExecutionContext): EvaluationCause | undefined {
  const cause = (context.state as { cause?: unknown }).cause;
  if (typeof cause !== 'object' || cause === null) return undefined;
  const { id, at, scopeKey } = cause as Record<string, unknown>;
  if (typeof id !== 'string' || typeof at !== 'number') return undefined;
  return { id, at, scopeKey: typeof scopeKey === 'string' ? scopeKey : undefined };
}

function appendDraft(
  context: ExecutionContext,
  draft: EffectDraft,
  message: string,
): ExecutionResult<DeclaredEffectKind> {
  const existing = (context.state as { [EFFECTS_STATE_KEY]?: readonly EffectDraft[] })[
    EFFECTS_STATE_KEY
  ];
  const drafts = Array.isArray(existing) ? existing : [];

  return new ExecutionResult(
    true,
    {
      ...context,
      messages: [...context.messages, { type: MessageType.INFO, text: message }],
      state: { ...context.state, [EFFECTS_STATE_KEY]: [...drafts, draft] },
    },
    draft.kind,
  );
}

function text(context: ExecutionContext, action: AbstractAction, name: string): string | undefined {
  const value = action.params.get(name)?.getValue(context);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Declares a notification. It produces the same `NotificationInstance` a
 * threshold rule produces, so delivery and dedupe stay one path — the `notify`
 * action covers what a threshold cannot express, not a second kind of alert.
 */
export class NotifyAction extends AbstractAction {
  static readonly TYPE = 'notify';

  execute(context: ExecutionContext): ExecutionResult<DeclaredEffectKind | null> {
    const cause = causeOf(context);
    if (!cause) {
      return new ExecutionResult(false, context, null, [
        'notify requires the evaluation to publish what it is about (context.cause)',
      ]);
    }

    const title = text(context, this, 'title');
    const message = text(context, this, 'message');
    if (title === undefined || message === undefined) {
      return new ExecutionResult(false, context, null, [
        'notify requires title and message parameters',
      ]);
    }

    const severity = text(context, this, 'severity') ?? 'info';
    const targetRole = text(context, this, 'targetRole') ?? 'operator';

    return appendDraft(
      context,
      {
        kind: 'notification',
        actionId: this.id,
        payload: {
          severity,
          title,
          message,
          targetRole,
          scopeKey: cause.scopeKey ?? cause.id,
          contextValues: { causeId: cause.id, at: cause.at },
        },
      },
      `Declared notification "${title}" (${severity})`,
    );
  }
}

/**
 * Declares a timer start.
 *
 * `startedAt` is the instant of the **causing event**, published by the
 * evaluator, and never the instant this action ran: replaying a match must
 * reproduce the same clock rather than restart it.
 */
export class StartTimerAction extends AbstractAction {
  static readonly TYPE = 'startTimer';

  execute(context: ExecutionContext): ExecutionResult<DeclaredEffectKind | null> {
    const cause = causeOf(context);
    if (!cause) {
      return new ExecutionResult(false, context, null, [
        'startTimer requires the evaluation to publish what it is about (context.cause)',
      ]);
    }

    const timerId = text(context, this, 'timerId');
    const duration = this.params.get('durationSeconds')?.getValue(context);
    if (timerId === undefined || typeof duration !== 'number' || !Number.isFinite(duration)) {
      return new ExecutionResult(false, context, null, [
        'startTimer requires a timerId and a numeric durationSeconds',
      ]);
    }

    return appendDraft(
      context,
      {
        kind: 'timer-start',
        actionId: this.id,
        payload: { timerId, startedAt: cause.at, durationSeconds: duration },
      },
      `Declared timer "${timerId}" starting at ${cause.at} for ${duration}s`,
    );
  }
}

/** Declares a timer stop, likewise at the causing event's instant. */
export class StopTimerAction extends AbstractAction {
  static readonly TYPE = 'stopTimer';

  execute(context: ExecutionContext): ExecutionResult<DeclaredEffectKind | null> {
    const cause = causeOf(context);
    if (!cause) {
      return new ExecutionResult(false, context, null, [
        'stopTimer requires the evaluation to publish what it is about (context.cause)',
      ]);
    }

    const timerId = text(context, this, 'timerId');
    if (timerId === undefined) {
      return new ExecutionResult(false, context, null, ['stopTimer requires a timerId']);
    }

    return appendDraft(
      context,
      {
        kind: 'timer-stop',
        actionId: this.id,
        payload: { timerId, stoppedAt: cause.at },
      },
      `Declared timer "${timerId}" stopping at ${cause.at}`,
    );
  }
}

/** Registers the three declaring actions (idempotent per registry). */
export function registerDeclaredEffectActions(registry: RulesRegistry): RulesRegistry {
  registry.registerAction(
    NotifyAction.TYPE,
    NotifyAction,
    'Declares a notification with a stable identity; delivery is the caller’s, never the action’s',
  );
  registry.registerAction(
    StartTimerAction.TYPE,
    StartTimerAction,
    'Declares a timer starting at the causing event, so a replay reproduces the clock',
  );
  registry.registerAction(
    StopTimerAction.TYPE,
    StopTimerAction,
    'Declares a timer stopping at the causing event',
  );
  return registry;
}
