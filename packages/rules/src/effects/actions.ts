import {
  AbstractAction,
  ExecutionResult,
  MessageType,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import { parameter, type RulesRegistry } from '../registry/rules-registry.js';
import {
  EFFECTS_STATE_KEY,
  type DeclaredEffectKind,
  type EffectDraft,
} from './declared-effects.js';

/**
 * The effectful actions (0013-scripting-hook-surface, extended by 0016).
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

/**
 * Declares a statistic adjustment.
 *
 * A script may move a total the collectors do not produce on their own — a
 * bonus point, a deduction, a figure a discipline computes from something no
 * event carries. It declares the movement; the fold applies it like any other
 * recorded fact, so replaying the match reproduces the number instead of
 * incrementing it a second time.
 */
export class AdjustStatisticAction extends AbstractAction {
  static readonly TYPE = 'adjustStatistic';

  execute(context: ExecutionContext): ExecutionResult<DeclaredEffectKind | null> {
    const cause = causeOf(context);
    if (!cause) {
      return new ExecutionResult(false, context, null, [
        'adjustStatistic requires the evaluation to publish what it is about (context.cause)',
      ]);
    }

    const collectorCode = text(context, this, 'collectorCode');
    const actorGranularity = text(context, this, 'actorGranularity');
    const actorId = text(context, this, 'actorId');
    const delta = this.params.get('delta')?.getValue(context);

    if (
      collectorCode === undefined ||
      actorGranularity === undefined ||
      actorId === undefined ||
      typeof delta !== 'number' ||
      !Number.isFinite(delta)
    ) {
      return new ExecutionResult(false, context, null, [
        'adjustStatistic requires collectorCode, actorGranularity, actorId and a numeric delta',
      ]);
    }

    return appendDraft(
      context,
      {
        kind: 'statistic-adjustment',
        actionId: this.id,
        payload: {
          collectorCode,
          actorGranularity,
          actorId,
          delta,
          // Without a reason the fold still applies it, but nobody can say why
          // the number moved — so the rule's own words are the default.
          reason: text(context, this, 'reason'),
        },
      },
      `Declared ${delta >= 0 ? '+' : ''}${delta} on "${collectorCode}" for ${actorGranularity} ${actorId}`,
    );
  }
}

/**
 * Declares a tag.
 *
 * It labels and enforces nothing: a script may mark a player suspended, and the
 * organizer still decides whether they take the field. That is the whole
 * contract — CopaLibre keeps the integrity of its records and what this
 * organizer configured, and never what a sport usually requires.
 */
export class ApplyTagAction extends AbstractAction {
  static readonly TYPE = 'applyTag';

  execute(context: ExecutionContext): ExecutionResult<DeclaredEffectKind | null> {
    const cause = causeOf(context);
    if (!cause) {
      return new ExecutionResult(false, context, null, [
        'applyTag requires the evaluation to publish what it is about (context.cause)',
      ]);
    }

    const code = text(context, this, 'code');
    const actorGranularity = text(context, this, 'actorGranularity');
    const actorId = text(context, this, 'actorId');
    const competitionGranularity = text(context, this, 'competitionGranularity');
    const competitionId = text(context, this, 'competitionId');

    if (
      code === undefined ||
      actorGranularity === undefined ||
      actorId === undefined ||
      competitionGranularity === undefined ||
      competitionId === undefined
    ) {
      return new ExecutionResult(false, context, null, [
        'applyTag requires code, actorGranularity, actorId, competitionGranularity and competitionId',
      ]);
    }

    const action = text(context, this, 'action') ?? 'applied';
    if (action !== 'applied' && action !== 'lifted') {
      return new ExecutionResult(false, context, null, [
        'applyTag action is "applied" or "lifted"; a tag is never deleted',
      ]);
    }

    return appendDraft(
      context,
      {
        kind: 'tag',
        actionId: this.id,
        payload: {
          code,
          action,
          actorGranularity,
          actorId,
          competitionGranularity,
          competitionId,
          reason: text(context, this, 'reason'),
        },
      },
      `Declared tag "${code}" ${action} for ${actorGranularity} ${actorId}`,
    );
  }
}

/** Registers the declaring actions (idempotent per registry). */
export function registerDeclaredEffectActions(registry: RulesRegistry): RulesRegistry {
  registry.registerAction(
    NotifyAction.TYPE,
    NotifyAction,
    'Declares a notification with a stable identity; delivery is the caller’s, never the action’s',
    {
      parameters: [
        parameter(
          'title',
          'Notification title',
          'simple_string',
          { type: 'string', minLength: 1 },
          { allowExpression: true },
        ),
        parameter(
          'message',
          'Notification message',
          'simple_string',
          { type: 'string', minLength: 1 },
          { allowExpression: true },
        ),
        parameter(
          'severity',
          'Notification severity',
          'simple_string',
          { enum: ['info', 'warning', 'critical'] },
          { required: false },
        ),
        parameter(
          'targetRole',
          'Recipient role',
          'simple_string',
          { type: 'string', minLength: 1 },
          { required: false },
        ),
      ],
    },
  );
  registry.registerAction(
    StartTimerAction.TYPE,
    StartTimerAction,
    'Declares a timer starting at the causing event, so a replay reproduces the clock',
    {
      parameters: [
        parameter('timerId', 'Stable timer identifier', 'simple_string', {
          type: 'string',
          minLength: 1,
        }),
        parameter(
          'durationSeconds',
          'Timer duration in seconds',
          'simple_number',
          { type: 'number', exclusiveMinimum: 0 },
          { allowExpression: true },
        ),
      ],
    },
  );
  registry.registerAction(
    StopTimerAction.TYPE,
    StopTimerAction,
    'Declares a timer stopping at the causing event',
    {
      parameters: [
        parameter(
          'timerId',
          'Timer identifier to stop',
          'simple_string',
          { type: 'string', minLength: 1 },
          { allowExpression: true },
        ),
      ],
    },
  );
  registry.registerAction(
    AdjustStatisticAction.TYPE,
    AdjustStatisticAction,
    'Declares a statistic adjustment the fold applies as a fact, so a replay reproduces it',
    {
      parameters: [
        parameter('collectorCode', 'Statistic collector code', 'simple_string', {
          type: 'string',
          minLength: 1,
        }),
        parameter('actorGranularity', 'Actor granularity', 'simple_string', {
          type: 'string',
          minLength: 1,
        }),
        parameter(
          'actorId',
          'Actor identifier',
          'simple_string',
          { type: 'string', minLength: 1 },
          { allowExpression: true },
        ),
        parameter(
          'delta',
          'Signed statistic movement',
          'simple_number',
          { type: 'number' },
          { allowExpression: true },
        ),
        parameter(
          'reason',
          'Human-readable reason',
          'simple_string',
          { type: 'string' },
          { required: false, allowExpression: true },
        ),
      ],
    },
  );
  registry.registerAction(
    ApplyTagAction.TYPE,
    ApplyTagAction,
    'Declares a tag. It labels; it refuses nothing — the organizer decides what carrying it means',
    {
      parameters: [
        parameter('code', 'Tag code', 'simple_string', { type: 'string', minLength: 1 }),
        parameter('actorGranularity', 'Actor granularity', 'simple_string', {
          type: 'string',
          minLength: 1,
        }),
        parameter(
          'actorId',
          'Actor identifier',
          'simple_string',
          { type: 'string', minLength: 1 },
          { allowExpression: true },
        ),
        parameter('competitionGranularity', 'Competition granularity', 'simple_string', {
          type: 'string',
          minLength: 1,
        }),
        parameter(
          'competitionId',
          'Competition identifier',
          'simple_string',
          { type: 'string', minLength: 1 },
          { allowExpression: true },
        ),
        parameter(
          'action',
          'Apply or lift tag',
          'simple_string',
          { enum: ['applied', 'lifted'] },
          { required: false },
        ),
        parameter(
          'reason',
          'Human-readable reason',
          'simple_string',
          { type: 'string' },
          { required: false, allowExpression: true },
        ),
      ],
    },
  );
  return registry;
}
